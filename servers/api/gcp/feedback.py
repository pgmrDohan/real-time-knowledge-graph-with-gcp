"""
피드백 관리 모듈
사용자 피드백 수집 및 AI 모델 개선
"""

import asyncio
from typing import Any

from config import get_settings
from logger import get_logger
from .bigquery_client import BigQueryClient, get_bigquery_client
from .storage import CloudStorageClient, get_storage_client
from .vertex_ai import VertexAIClient, get_vertex_client

logger = get_logger(__name__)


class FeedbackManager:
    """
    피드백 관리자
    사용자 피드백을 수집하고 AI 모델 개선에 활용
    """

    def __init__(
        self,
        bigquery: BigQueryClient,
        storage: CloudStorageClient,
        vertex_ai: VertexAIClient,
    ) -> None:
        self._bigquery = bigquery
        self._storage = storage
        self._vertex_ai = vertex_ai
        self._feedback_cache: str | None = None
        self._cache_timestamp: float = 0
        self._cache_ttl: float = 3600  # 1시간

    async def submit_feedback(
        self,
        session_id: str,
        rating: int,
        comment: str | None,
        graph_state: dict[str, Any],
        audio_data: bytes | None = None,
        audio_format: str = "wav",
    ) -> dict[str, str]:
        """
        세션 피드백 제출

        Args:
            session_id: 세션 ID
            rating: 만족도 (1-5)
            comment: 사용자 코멘트
            graph_state: 최종 그래프 상태
            audio_data: 세션 오디오 데이터 (선택)
            audio_format: 오디오 포맷

        Returns:
            저장된 리소스 URI 딕셔너리
        """
        result_uris: dict[str, str] = {}

        # 1. 오디오 저장 (있는 경우)
        if audio_data:
            audio_uri = await self._storage.upload_audio(
                session_id=session_id,
                audio_data=audio_data,
                audio_format=audio_format,
                metadata={"feedback_rating": str(rating)},
            )
            result_uris["audio_uri"] = audio_uri
        else:
            result_uris["audio_uri"] = ""

        # 2. 그래프 상태 저장
        graph_uri = await self._storage.upload_graph_state(
            session_id=session_id,
            graph_state=graph_state,
            version=graph_state.get("version", 0),
        )
        result_uris["graph_uri"] = graph_uri

        # 3. BigQuery에 피드백 저장
        entities_count = len(graph_state.get("entities", []))
        relations_count = len(graph_state.get("relations", []))

        await self._bigquery.insert_feedback(
            session_id=session_id,
            rating=rating,
            comment=comment,
            graph_version=graph_state.get("version", 0),
            entities_count=entities_count,
            relations_count=relations_count,
            audio_gcs_uri=result_uris.get("audio_uri"),
            graph_gcs_uri=graph_uri,
        )

        # 4. 캐시 무효화 (피드백 변경됨)
        self._feedback_cache = None

        logger.info(
            "feedback_submitted",
            session_id=session_id,
            rating=rating,
            entities_count=entities_count,
            relations_count=relations_count,
        )

        return result_uris

    async def get_improvement_context(self) -> str:
        """
        피드백 기반 개선 컨텍스트 조회

        최근 피드백을 분석하여 AI 모델 개선에 사용할 컨텍스트 생성

        Returns:
            개선 지침 문자열
        """
        import time

        # 캐시 확인
        if (
            self._feedback_cache
            and time.time() - self._cache_timestamp < self._cache_ttl
        ):
            return self._feedback_cache

        try:
            # 최근 피드백 조회
            recent_feedback = await self._bigquery.get_recent_feedback(limit=50)

            if not recent_feedback:
                return ""

            # 낮은 평점 피드백 패턴 분석
            low_rating_patterns = await self._bigquery.get_low_rating_patterns()

            # Vertex AI로 개선 지침 생성
            all_feedback = recent_feedback + low_rating_patterns
            context = await self._vertex_ai.generate_feedback_summary(all_feedback)

            # 캐시 저장
            self._feedback_cache = context
            self._cache_timestamp = time.time()

            logger.info(
                "improvement_context_generated",
                feedback_count=len(all_feedback),
                context_length=len(context),
            )

            return context

        except Exception as e:
            logger.error("improvement_context_generation_failed", error=str(e))
            return ""

    async def get_analytics(self) -> dict[str, Any]:
        """
        피드백 분석 통계 조회

        Returns:
            분석 결과 딕셔너리
        """
        return await self._bigquery.get_feedback_analytics()

    async def should_improve_extraction(self) -> bool:
        """
        추출 품질 개선이 필요한지 판단

        평균 평점이 3점 미만이면 개선 필요

        Returns:
            개선 필요 여부
        """
        try:
            analytics = await self.get_analytics()
            avg_rating = analytics.get("avg_rating", 5)
            return avg_rating < 3.0
        except Exception:
            return False


# 싱글톤 인스턴스
_feedback_manager: FeedbackManager | None = None


async def get_feedback_manager() -> FeedbackManager:
    """피드백 매니저 의존성"""
    global _feedback_manager
    if _feedback_manager is None:
        bigquery = await get_bigquery_client()
        storage = await get_storage_client()
        vertex_ai = await get_vertex_client()
        _feedback_manager = FeedbackManager(bigquery, storage, vertex_ai)
    return _feedback_manager

