"""
Cloud Storage 모듈
오디오 파일 및 그래프 데이터 저장
"""

import asyncio
import json
import uuid
from datetime import datetime, timedelta
from typing import Any

from google.cloud import storage

from config import get_settings
from logger import get_logger

logger = get_logger(__name__)


class CloudStorageClient:
    """Google Cloud Storage 클라이언트"""

    def __init__(self) -> None:
        self._client: storage.Client | None = None
        self._bucket: storage.Bucket | None = None
        self._initialized = False

    async def initialize(self) -> None:
        """클라이언트 초기화"""
        if self._initialized:
            return

        settings = get_settings()

        # Storage 클라이언트 생성
        self._client = storage.Client(project=settings.gcp_project_id)
        self._bucket = self._client.bucket(settings.gcs_bucket_name)

        # 버킷 존재 확인
        if not self._bucket.exists():
            logger.warning(
                "bucket_not_found",
                bucket=settings.gcs_bucket_name,
            )

        self._initialized = True
        logger.info(
            "cloud_storage_initialized",
            bucket=settings.gcs_bucket_name,
        )

    async def upload_audio(
        self,
        session_id: str,
        audio_data: bytes,
        audio_format: str,
        metadata: dict[str, str] | None = None,
    ) -> str:
        """
        오디오 파일 업로드

        Args:
            session_id: 세션 ID
            audio_data: 오디오 바이너리 데이터
            audio_format: 오디오 포맷 (wav, webm, etc.)
            metadata: 추가 메타데이터

        Returns:
            업로드된 파일의 GCS URI
        """
        if not self._bucket:
            await self.initialize()

        # 파일 경로 생성
        timestamp = datetime.utcnow().strftime("%Y/%m/%d/%H")
        file_id = str(uuid.uuid4())[:8]
        blob_path = f"audio/{timestamp}/{session_id}_{file_id}.{audio_format}"

        # Blob 생성 및 업로드
        blob = self._bucket.blob(blob_path)

        # 메타데이터 설정
        blob.metadata = {
            "session_id": session_id,
            "timestamp": datetime.utcnow().isoformat(),
            **(metadata or {}),
        }

        # 컨텐츠 타입 설정
        content_type_map = {
            "wav": "audio/wav",
            "webm": "audio/webm",
            "opus": "audio/opus",
            "mp3": "audio/mpeg",
            "pcm": "audio/pcm",
        }
        blob.content_type = content_type_map.get(audio_format, "application/octet-stream")

        # 비동기 업로드
        await asyncio.to_thread(
            blob.upload_from_string,
            audio_data,
            content_type=blob.content_type,
        )

        gcs_uri = f"gs://{self._bucket.name}/{blob_path}"
        logger.debug(
            "audio_uploaded",
            session_id=session_id,
            path=blob_path,
            size=len(audio_data),
        )

        return gcs_uri

    async def upload_graph_state(
        self,
        session_id: str,
        graph_state: dict[str, Any],
        version: int,
    ) -> str:
        """
        그래프 상태 저장

        Args:
            session_id: 세션 ID
            graph_state: 그래프 상태 딕셔너리
            version: 그래프 버전

        Returns:
            업로드된 파일의 GCS URI
        """
        if not self._bucket:
            await self.initialize()

        # 파일 경로 생성
        timestamp = datetime.utcnow().strftime("%Y/%m/%d")
        blob_path = f"graphs/{timestamp}/{session_id}_v{version}.json"

        # JSON 직렬화
        json_data = json.dumps(graph_state, ensure_ascii=False, indent=2)

        # Blob 생성 및 업로드
        blob = self._bucket.blob(blob_path)
        blob.metadata = {
            "session_id": session_id,
            "version": str(version),
            "timestamp": datetime.utcnow().isoformat(),
        }
        blob.content_type = "application/json"

        await asyncio.to_thread(
            blob.upload_from_string,
            json_data,
            content_type="application/json",
        )

        gcs_uri = f"gs://{self._bucket.name}/{blob_path}"
        logger.debug(
            "graph_state_uploaded",
            session_id=session_id,
            version=version,
            path=blob_path,
        )

        return gcs_uri

    async def upload_session_log(
        self,
        session_id: str,
        log_data: dict[str, Any],
    ) -> str:
        """
        세션 로그 저장

        Args:
            session_id: 세션 ID
            log_data: 로그 데이터

        Returns:
            업로드된 파일의 GCS URI
        """
        if not self._bucket:
            await self.initialize()

        # 파일 경로 생성
        timestamp = datetime.utcnow().strftime("%Y/%m/%d/%H")
        blob_path = f"logs/{timestamp}/{session_id}.json"

        # JSON 직렬화
        json_data = json.dumps(log_data, ensure_ascii=False)

        # Blob 생성 및 업로드
        blob = self._bucket.blob(blob_path)
        blob.content_type = "application/json"

        await asyncio.to_thread(
            blob.upload_from_string,
            json_data,
            content_type="application/json",
        )

        gcs_uri = f"gs://{self._bucket.name}/{blob_path}"
        logger.debug("session_log_uploaded", session_id=session_id, path=blob_path)

        return gcs_uri

    async def get_signed_url(
        self,
        blob_path: str,
        expiration_minutes: int = 60,
    ) -> str:
        """
        서명된 URL 생성 (임시 다운로드용)

        Args:
            blob_path: GCS 내 파일 경로
            expiration_minutes: URL 유효 시간 (분)

        Returns:
            서명된 URL
        """
        if not self._bucket:
            await self.initialize()

        blob = self._bucket.blob(blob_path)

        url = await asyncio.to_thread(
            blob.generate_signed_url,
            version="v4",
            expiration=timedelta(minutes=expiration_minutes),
            method="GET",
        )

        return url

    async def delete_session_data(self, session_id: str) -> int:
        """
        세션 관련 모든 데이터 삭제

        Args:
            session_id: 세션 ID

        Returns:
            삭제된 파일 수
        """
        if not self._bucket:
            await self.initialize()

        deleted_count = 0

        # 세션 ID가 포함된 모든 파일 찾기
        for prefix in ["audio/", "graphs/", "logs/"]:
            blobs = list(self._client.list_blobs(self._bucket, prefix=prefix))
            for blob in blobs:
                if session_id in blob.name:
                    await asyncio.to_thread(blob.delete)
                    deleted_count += 1

        logger.info(
            "session_data_deleted",
            session_id=session_id,
            deleted_count=deleted_count,
        )

        return deleted_count


# 싱글톤 인스턴스
_storage_client: CloudStorageClient | None = None


async def get_storage_client() -> CloudStorageClient:
    """Storage 클라이언트 의존성"""
    global _storage_client
    if _storage_client is None:
        _storage_client = CloudStorageClient()
        await _storage_client.initialize()
    return _storage_client

