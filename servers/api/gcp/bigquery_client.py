"""
BigQuery 클라이언트 모듈
로그, 세션 데이터, 피드백 저장 및 분석
"""

import asyncio
from datetime import datetime
from typing import Any

from google.cloud import bigquery

from config import get_settings
from logger import get_logger

logger = get_logger(__name__)


class BigQueryClient:
    """Google BigQuery 클라이언트"""

    def __init__(self) -> None:
        self._client: bigquery.Client | None = None
        self._dataset_id: str | None = None
        self._initialized = False

    async def initialize(self) -> None:
        """클라이언트 초기화"""
        if self._initialized:
            return

        settings = get_settings()

        # BigQuery 클라이언트 생성
        self._client = bigquery.Client(project=settings.gcp_project_id)
        self._dataset_id = f"{settings.gcp_project_id}.{settings.bq_dataset_id}"

        # 데이터셋 확인
        try:
            self._client.get_dataset(self._dataset_id)
        except Exception as e:
            logger.warning(
                "dataset_not_found",
                dataset=self._dataset_id,
                error=str(e),
            )

        self._initialized = True
        logger.info("bigquery_initialized", dataset=self._dataset_id)

    async def insert_session_event(
        self,
        session_id: str,
        event_type: str,
        event_data: dict[str, Any],
    ) -> None:
        """
        세션 이벤트 삽입

        Args:
            session_id: 세션 ID
            event_type: 이벤트 유형 (start, audio_chunk, stt_result, extraction, end, etc.)
            event_data: 이벤트 데이터
        """
        if not self._client:
            await self.initialize()

        table_id = f"{self._dataset_id}.session_events"

        row = {
            "session_id": session_id,
            "event_type": event_type,
            "event_data": str(event_data),  # JSON 문자열로 저장
            "timestamp": datetime.utcnow().isoformat(),
        }

        errors = await asyncio.to_thread(
            self._client.insert_rows_json,
            table_id,
            [row],
        )

        if errors:
            logger.error(
                "bigquery_insert_error",
                table=table_id,
                errors=errors,
            )
        else:
            logger.debug(
                "session_event_inserted",
                session_id=session_id,
                event_type=event_type,
            )

    async def insert_extraction_result(
        self,
        session_id: str,
        text_input: str,
        entities_count: int,
        relations_count: int,
        processing_time_ms: int,
        entities_json: str,
        relations_json: str,
    ) -> None:
        """
        추출 결과 삽입

        Args:
            session_id: 세션 ID
            text_input: 입력 텍스트
            entities_count: 추출된 엔티티 수
            relations_count: 추출된 관계 수
            processing_time_ms: 처리 시간 (밀리초)
            entities_json: 엔티티 JSON 문자열
            relations_json: 관계 JSON 문자열
        """
        if not self._client:
            await self.initialize()

        table_id = f"{self._dataset_id}.extraction_results"

        row = {
            "session_id": session_id,
            "text_input": text_input[:1000],  # 텍스트 길이 제한
            "entities_count": entities_count,
            "relations_count": relations_count,
            "processing_time_ms": processing_time_ms,
            "entities_json": entities_json,
            "relations_json": relations_json,
            "timestamp": datetime.utcnow().isoformat(),
        }

        errors = await asyncio.to_thread(
            self._client.insert_rows_json,
            table_id,
            [row],
        )

        if errors:
            logger.error("bigquery_insert_error", table=table_id, errors=errors)

    async def insert_feedback(
        self,
        session_id: str,
        rating: int,
        comment: str | None,
        graph_version: int,
        entities_count: int,
        relations_count: int,
        audio_gcs_uri: str | None,
        graph_gcs_uri: str | None,
    ) -> None:
        """
        사용자 피드백 삽입

        Args:
            session_id: 세션 ID
            rating: 만족도 (1-5)
            comment: 사용자 코멘트
            graph_version: 최종 그래프 버전
            entities_count: 최종 엔티티 수
            relations_count: 최종 관계 수
            audio_gcs_uri: 오디오 파일 GCS URI
            graph_gcs_uri: 그래프 파일 GCS URI
        """
        if not self._client:
            await self.initialize()

        table_id = f"{self._dataset_id}.user_feedback"

        row = {
            "session_id": session_id,
            "rating": rating,
            "comment": comment or "",
            "graph_version": graph_version,
            "entities_count": entities_count,
            "relations_count": relations_count,
            "audio_gcs_uri": audio_gcs_uri or "",
            "graph_gcs_uri": graph_gcs_uri or "",
            "timestamp": datetime.utcnow().isoformat(),
        }

        errors = await asyncio.to_thread(
            self._client.insert_rows_json,
            table_id,
            [row],
        )

        if errors:
            logger.error("bigquery_insert_error", table=table_id, errors=errors)
        else:
            logger.info(
                "feedback_inserted",
                session_id=session_id,
                rating=rating,
            )

    async def get_recent_feedback(
        self,
        limit: int = 100,
        min_rating: int | None = None,
    ) -> list[dict[str, Any]]:
        """
        최근 피드백 조회

        Args:
            limit: 최대 결과 수
            min_rating: 최소 평점 필터

        Returns:
            피드백 목록
        """
        if not self._client:
            await self.initialize()

        query = f"""
            SELECT 
                session_id,
                rating,
                comment,
                graph_version,
                entities_count,
                relations_count,
                timestamp
            FROM `{self._dataset_id}.user_feedback`
            WHERE 1=1
        """

        if min_rating is not None:
            query += f" AND rating >= {min_rating}"

        query += f"""
            ORDER BY timestamp DESC
            LIMIT {limit}
        """

        results = await asyncio.to_thread(
            lambda: list(self._client.query(query).result())
        )

        return [dict(row) for row in results]

    async def get_feedback_analytics(self) -> dict[str, Any]:
        """
        피드백 분석 통계 조회

        Returns:
            분석 결과 딕셔너리
        """
        if not self._client:
            await self.initialize()

        query = f"""
            SELECT
                COUNT(*) as total_feedback,
                AVG(rating) as avg_rating,
                COUNTIF(rating >= 4) as positive_count,
                COUNTIF(rating <= 2) as negative_count,
                AVG(entities_count) as avg_entities,
                AVG(relations_count) as avg_relations
            FROM `{self._dataset_id}.user_feedback`
            WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
        """

        results = await asyncio.to_thread(
            lambda: list(self._client.query(query).result())
        )

        if results:
            row = results[0]
            return {
                "total_feedback": row.total_feedback or 0,
                "avg_rating": float(row.avg_rating or 0),
                "positive_count": row.positive_count or 0,
                "negative_count": row.negative_count or 0,
                "avg_entities": float(row.avg_entities or 0),
                "avg_relations": float(row.avg_relations or 0),
            }

        return {}

    async def get_low_rating_patterns(self) -> list[dict[str, Any]]:
        """
        낮은 평점 패턴 분석 (피드백 기반 개선용)

        Returns:
            낮은 평점 피드백 패턴
        """
        if not self._client:
            await self.initialize()

        query = f"""
            SELECT
                comment,
                rating,
                entities_count,
                relations_count
            FROM `{self._dataset_id}.user_feedback`
            WHERE rating <= 2 AND comment != ''
            ORDER BY timestamp DESC
            LIMIT 20
        """

        results = await asyncio.to_thread(
            lambda: list(self._client.query(query).result())
        )

        return [dict(row) for row in results]


# 싱글톤 인스턴스
_bigquery_client: BigQueryClient | None = None


async def get_bigquery_client() -> BigQueryClient:
    """BigQuery 클라이언트 의존성"""
    global _bigquery_client
    if _bigquery_client is None:
        _bigquery_client = BigQueryClient()
        await _bigquery_client.initialize()
    return _bigquery_client

