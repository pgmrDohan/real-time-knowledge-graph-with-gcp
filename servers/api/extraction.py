"""
엔티티/관계 추출 모듈
LangChain + Gemini를 사용한 지식 추출
"""

import asyncio
import json
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import JsonOutputParser
from langchain_google_genai import ChatGoogleGenerativeAI

from config import get_settings
from logger import get_logger
from models import (
    EntityType,
    ExtractionResult,
    ExtractedEntity,
    ExtractedRelation,
    GraphEntity,
    GraphRelation,
    KiwiMorpheme,
)

logger = get_logger(__name__)


def create_extraction_system_prompt(
    existing_entities: list[GraphEntity] | None = None,
    existing_relations: list[GraphRelation] | None = None,
) -> str:
    """엔티티/관계 추출 시스템 프롬프트 생성"""
    base_prompt = """You are a knowledge graph expert.
Extract entities and relations from the given Korean text and return as structured JSON.

## Entity Types
- PERSON: People, names
- ORGANIZATION: Organizations, companies
- LOCATION: Places, regions, countries
- CONCEPT: Abstract concepts, theories
- EVENT: Events, incidents
- PRODUCT: Products, services
- TECHNOLOGY: Technologies, tools, frameworks
- DATE: Dates, times, periods
- METRIC: Numbers, metrics, statistics
- ACTION: Actions, activities

## CRITICAL RULES
1. Extract ONLY clearly mentioned entities.
2. Each entity must have a UNIQUE ID (e.g., entity_1, entity_2).
3. Relations describe semantic connections between entities.
4. Relation descriptions should be concise verbs.
5. Do NOT extract vague or uncertain relations.
6. Extract ONLY the MOST IMPORTANT 3-5 entities maximum.
7. Extract ONLY 1-3 key relations maximum.

## DUPLICATE PREVENTION (VERY IMPORTANT!)
1. If an entity is semantically identical to an existing one, REUSE the existing ID.
2. Synonyms, abbreviations, and aliases are the SAME entity.
   Example: "삼성전자" = "삼성" = "Samsung" = same entity
3. Do NOT create relations that already exist (same source-target pair).
4. If unsure whether an entity exists, assume it does and skip it."""

    # 기존 컨텍스트 추가
    if existing_entities:
        entities_context = "\n## 기존 엔티티 (재사용 필요시 이 ID 사용)\n"
        for e in existing_entities[:20]:  # 최대 20개만 컨텍스트에 포함
            entities_context += f"- ID: {e.id}, 라벨: \"{e.label}\", 유형: {e.type.value}\n"
        base_prompt += entities_context

    if existing_relations:
        relations_context = "\n## 기존 관계 (중복 생성 금지)\n"
        for r in existing_relations[:20]:
            relations_context += f"- {r.source} --[{r.relation}]--> {r.target}\n"
        base_prompt += relations_context

    output_format = """

## 출력 형식
반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.

```json
{
  "entities": [
    { "id": "entity_1", "label": "엔티티 이름", "type": "ENTITY_TYPE" }
  ],
  "relations": [
    { "source": "entity_1", "target": "entity_2", "relation": "관계 설명" }
  ]
}
```

추출할 엔티티나 관계가 없으면 빈 배열을 반환합니다:
```json
{ "entities": [], "relations": [] }
```"""

    return base_prompt + output_format


class KnowledgeExtractor:
    """지식 추출기"""

    def __init__(self) -> None:
        self._llm: ChatGoogleGenerativeAI | None = None
        self._initialized = False

    async def initialize(self) -> None:
        """LLM 초기화"""
        if self._initialized:
            return

        settings = get_settings()
        if not settings.gemini_api_key:
            raise ValueError("GEMINI_API_KEY가 설정되지 않았습니다")

        self._llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",  # 추출에는 빠른 모델 사용
            google_api_key=settings.gemini_api_key,
            temperature=0.1,
            max_output_tokens=2048,
        )

        self._initialized = True
        logger.info("knowledge_extractor_initialized")

    async def extract(
        self,
        text: str,
        morpheme_info: str | None = None,
        existing_entities: list[GraphEntity] | None = None,
        existing_relations: list[GraphRelation] | None = None,
        retry_count: int = 3,
    ) -> ExtractionResult:
        """텍스트에서 엔티티와 관계 추출"""
        if not self._llm:
            await self.initialize()

        system_prompt = create_extraction_system_prompt(
            existing_entities, existing_relations
        )

        user_prompt = f"다음 텍스트에서 엔티티와 관계를 추출하세요:\n\n\"\"\"\n{text}\n\"\"\""
        if morpheme_info:
            user_prompt += f"\n\n형태소 분석 참고 정보:\n{morpheme_info}"

        for attempt in range(retry_count):
            try:
                response = await asyncio.to_thread(
                    self._llm.invoke,  # type: ignore
                    [
                        SystemMessage(content=system_prompt),
                        HumanMessage(content=user_prompt),
                    ],
                )

                # JSON 파싱
                result = self._parse_extraction_response(response.content)  # type: ignore

                logger.debug(
                    "extraction_completed",
                    text_length=len(text),
                    entities_count=len(result.entities),
                    relations_count=len(result.relations),
                )

                return result

            except Exception as e:
                logger.warning(
                    "extraction_attempt_failed",
                    attempt=attempt + 1,
                    error=str(e),
                )
                if attempt == retry_count - 1:
                    logger.error("extraction_failed_all_retries", text=text[:100])
                    # 빈 결과 반환
                    return ExtractionResult(entities=[], relations=[])

                await asyncio.sleep(1)  # 재시도 전 대기

        return ExtractionResult(entities=[], relations=[])

    def _parse_extraction_response(self, content: str) -> ExtractionResult:
        """LLM 응답에서 JSON 추출 및 파싱"""
        # JSON 블록 추출
        json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            # JSON 블록이 없으면 전체 내용에서 JSON 찾기
            json_match = re.search(r"\{.*\}", content, re.DOTALL)
            if json_match:
                json_str = json_match.group(0)
            else:
                raise ValueError(f"JSON을 찾을 수 없습니다: {content[:200]}")

        data = json.loads(json_str)

        # 검증 및 변환
        entities = []
        for e in data.get("entities", []):
            entity_type = e.get("type", "UNKNOWN")
            if entity_type not in EntityType.__members__:
                entity_type = "UNKNOWN"

            entities.append(
                ExtractedEntity(
                    id=e.get("id", ""),
                    label=e.get("label", ""),
                    type=EntityType(entity_type),
                )
            )

        relations = []
        for r in data.get("relations", []):
            relations.append(
                ExtractedRelation(
                    source=r.get("source", ""),
                    target=r.get("target", ""),
                    relation=r.get("relation", ""),
                )
            )

        return ExtractionResult(entities=entities, relations=relations)


class ExtractionPipeline:
    """추출 파이프라인 - 배치 처리 및 큐 관리"""

    def __init__(self, extractor: KnowledgeExtractor) -> None:
        self._extractor = extractor
        self._semaphore: asyncio.Semaphore | None = None

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
        """단일 청크 처리"""
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


