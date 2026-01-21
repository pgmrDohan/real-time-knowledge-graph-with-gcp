"""
엔티티/관계 추출 모듈
Vertex AI Gemini를 사용한 지식 추출

이 모듈은 Vertex AI의 Gemini 모델을 활용하여
텍스트에서 엔티티와 관계를 추출합니다.
피드백 기반 개선 기능을 포함합니다.

스트리밍 추출 지원으로 부분 결과를 즉시 전달합니다.
"""

import asyncio
import time
from typing import Any, Callable

from config import get_settings
from gcp.vertex_ai import VertexAIClient, get_vertex_client
from gcp.feedback import FeedbackManager, get_feedback_manager
from gcp.bigquery_client import get_bigquery_client
from logger import get_logger
from models import (
    ExtractionResult,
    ExtractedEntity,
    ExtractedRelation,
    GraphEntity,
    GraphRelation,
    KiwiMorpheme,
)

logger = get_logger(__name__)


class KnowledgeExtractor:
    """지식 추출기 - Vertex AI 기반 (스트리밍 지원)"""

    def __init__(self) -> None:
        self._vertex_client: VertexAIClient | None = None
        self._feedback_manager: FeedbackManager | None = None
        self._initialized = False
        self._feedback_context_cache: str | None = None
        self._feedback_cache_time: float = 0
        self._feedback_cache_ttl: float = 300  # 5분 캐시

    async def initialize(self) -> None:
        """추출기 초기화"""
        if self._initialized:
            return

        self._vertex_client = await get_vertex_client()

        # 피드백 기능이 활성화된 경우
        settings = get_settings()
        if settings.enable_feedback:
            try:
                self._feedback_manager = await get_feedback_manager()
            except Exception as e:
                logger.warning("feedback_manager_init_failed", error=str(e))

        self._initialized = True
        logger.info("knowledge_extractor_initialized")

    async def _get_feedback_context(self) -> str | None:
        """피드백 컨텍스트 조회 (캐싱)"""
        if not self._feedback_manager:
            return None
        
        # 캐시 유효성 확인
        now = time.time()
        if self._feedback_context_cache and (now - self._feedback_cache_time) < self._feedback_cache_ttl:
            return self._feedback_context_cache
        
        try:
            self._feedback_context_cache = await self._feedback_manager.get_improvement_context()
            self._feedback_cache_time = now
            return self._feedback_context_cache
        except Exception as e:
            logger.warning("feedback_context_fetch_failed", error=str(e))
            return None

    async def extract(
        self,
        text: str,
        morpheme_info: str | None = None,
        existing_entities: list[GraphEntity] | None = None,
        existing_relations: list[GraphRelation] | None = None,
        retry_count: int = 3,
    ) -> ExtractionResult:
        """
        텍스트에서 엔티티와 관계 추출 (일반 모드)

        Args:
            text: 분석할 텍스트
            morpheme_info: 형태소 분석 정보 (선택)
            existing_entities: 기존 엔티티 목록
            existing_relations: 기존 관계 목록
            retry_count: 재시도 횟수

        Returns:
            추출 결과
        """
        if not self._vertex_client:
            await self.initialize()

        feedback_context = await self._get_feedback_context()

        # 형태소 정보 추가 (간결하게)
        enhanced_text = text
        if morpheme_info:
            # 형태소 정보는 너무 길면 생략
            if len(morpheme_info) <= 200:
                enhanced_text = f"{text}\n[참고: {morpheme_info}]"

        start_time = time.time()

        result = await self._vertex_client.extract_knowledge(
            text=enhanced_text,
            existing_entities=existing_entities,
            existing_relations=existing_relations,
            feedback_context=feedback_context,
            retry_count=retry_count,
        )

        processing_time_ms = int((time.time() - start_time) * 1000)

        # BigQuery에 추출 결과 기록 (백그라운드)
        asyncio.create_task(self._log_extraction_result(
            text, result, processing_time_ms
        ))

        logger.debug(
            "extraction_completed",
            text_length=len(text),
            entities_count=len(result.entities),
            relations_count=len(result.relations),
            processing_time_ms=processing_time_ms,
        )

        return result

    async def extract_streaming(
        self,
        text: str,
        existing_entities: list[GraphEntity] | None = None,
        existing_relations: list[GraphRelation] | None = None,
        on_partial: Callable[[list[ExtractedEntity], list[ExtractedRelation]], Any] | None = None,
    ) -> ExtractionResult:
        """
        스트리밍 방식으로 엔티티/관계 추출
        
        부분 결과가 파싱되면 즉시 on_partial 콜백 호출
        
        Args:
            text: 분석할 텍스트
            existing_entities: 기존 엔티티 목록
            existing_relations: 기존 관계 목록
            on_partial: 부분 결과 콜백 (새 엔티티들, 새 관계들)
        
        Returns:
            최종 추출 결과
        """
        if not self._vertex_client:
            await self.initialize()

        feedback_context = await self._get_feedback_context()

        start_time = time.time()

        result = await self._vertex_client.extract_knowledge_streaming(
            text=text,
            existing_entities=existing_entities,
            existing_relations=existing_relations,
            feedback_context=feedback_context,
            on_partial=on_partial,
        )

        processing_time_ms = int((time.time() - start_time) * 1000)

        # BigQuery에 추출 결과 기록 (백그라운드)
        asyncio.create_task(self._log_extraction_result(
            text, result, processing_time_ms
        ))

        logger.debug(
            "streaming_extraction_completed",
            text_length=len(text),
            entities_count=len(result.entities),
            relations_count=len(result.relations),
            processing_time_ms=processing_time_ms,
        )

        return result

    async def _log_extraction_result(
        self,
        text: str,
        result: ExtractionResult,
        processing_time_ms: int,
    ) -> None:
        """BigQuery에 추출 결과 기록"""
        settings = get_settings()
        if not settings.enable_feedback:
            return
        
        try:
            import json
            bigquery = await get_bigquery_client()
            await bigquery.insert_extraction_result(
                session_id="global",
                text_input=text,
                entities_count=len(result.entities),
                relations_count=len(result.relations),
                processing_time_ms=processing_time_ms,
                entities_json=json.dumps([e.model_dump() for e in result.entities]),
                relations_json=json.dumps([r.model_dump() for r in result.relations]),
            )
        except Exception as e:
            logger.warning("extraction_result_logging_failed", error=str(e))


class ExtractionPipeline:
    """추출 파이프라인 - 배치 처리 및 스트리밍 지원"""

    def __init__(self, extractor: KnowledgeExtractor) -> None:
        self._extractor = extractor
        self._semaphore: asyncio.Semaphore | None = None
        self._use_streaming: bool = True  # 기본적으로 스트리밍 사용

    async def initialize(self) -> None:
        """파이프라인 초기화"""
        settings = get_settings()
        self._semaphore = asyncio.Semaphore(settings.max_concurrent_extractions)

    async def process_chunk(
        self,
        text: str,
        morphemes: list[KiwiMorpheme] | None,
        existing_entities: list[GraphEntity],
        existing_relations: list[GraphRelation],
    ) -> ExtractionResult:
        """단일 청크 처리 (일반 모드)"""
        if self._semaphore is None:
            await self.initialize()

        morpheme_info = None
        if morphemes:
            morpheme_info = " ".join([f"{m.form}/{m.tag}" for m in morphemes])

        async with self._semaphore:  # type: ignore
            return await self._extractor.extract(
                text=text,
                morpheme_info=morpheme_info,
                existing_entities=existing_entities,
                existing_relations=existing_relations,
            )

    async def process_chunk_streaming(
        self,
        text: str,
        existing_entities: list[GraphEntity],
        existing_relations: list[GraphRelation],
        on_partial: Callable[[list[ExtractedEntity], list[ExtractedRelation]], Any] | None = None,
    ) -> ExtractionResult:
        """
        스트리밍 방식으로 단일 청크 처리
        
        부분 결과가 생성되면 즉시 on_partial 콜백 호출
        """
        if self._semaphore is None:
            await self.initialize()

        async with self._semaphore:  # type: ignore
            return await self._extractor.extract_streaming(
                text=text,
                existing_entities=existing_entities,
                existing_relations=existing_relations,
                on_partial=on_partial,
            )

    async def process_batch(
        self,
        chunks: list[tuple[str, list[KiwiMorpheme] | None]],
        existing_entities: list[GraphEntity],
        existing_relations: list[GraphRelation],
    ) -> list[ExtractionResult]:
        """배치 처리"""
        tasks = [
            self.process_chunk(text, morphemes, existing_entities, existing_relations)
            for text, morphemes in chunks
        ]
        return await asyncio.gather(*tasks)


# 싱글톤 인스턴스
knowledge_extractor = KnowledgeExtractor()
extraction_pipeline: ExtractionPipeline | None = None


async def get_extractor() -> KnowledgeExtractor:
    """추출기 의존성"""
    if not knowledge_extractor._initialized:
        await knowledge_extractor.initialize()
    return knowledge_extractor


async def get_extraction_pipeline() -> ExtractionPipeline:
    """파이프라인 의존성"""
    global extraction_pipeline
    if extraction_pipeline is None:
        extractor = await get_extractor()
        extraction_pipeline = ExtractionPipeline(extractor)
        await extraction_pipeline.initialize()
    return extraction_pipeline
