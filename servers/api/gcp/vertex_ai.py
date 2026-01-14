"""
Vertex AI Gemini 모듈
엔티티/관계 추출을 위한 LLM 클라이언트
"""

import asyncio
import json
import re
from typing import Any

import vertexai
from vertexai.generative_models import GenerativeModel, Part, GenerationConfig

from config import get_settings
from logger import get_logger
from models import (
    EntityType,
    ExtractionResult,
    ExtractedEntity,
    ExtractedRelation,
    GraphEntity,
    GraphRelation,
)

logger = get_logger(__name__)


def create_extraction_prompt(
    text: str,
    existing_entities: list[GraphEntity] | None = None,
    existing_relations: list[GraphRelation] | None = None,
    feedback_context: str | None = None,
) -> str:
    """
    엔티티/관계 추출 프롬프트 생성
    피드백 컨텍스트를 포함하여 더 나은 추출 결과를 생성
    """
    base_prompt = """You are an expert knowledge graph builder.
Extract entities and relationships from the given text.

## Entity Types
- PERSON: People, names
- ORGANIZATION: Organizations, companies, institutions
- LOCATION: Places, regions, countries, cities
- CONCEPT: Abstract concepts, theories, ideas
- EVENT: Events, incidents, occurrences
- PRODUCT: Products, services, offerings
- TECHNOLOGY: Technologies, tools, frameworks, programming languages
- DATE: Dates, times, periods
- METRIC: Numbers, metrics, statistics, measurements
- ACTION: Actions, activities, verbs

## CRITICAL RULES
1. Extract ONLY explicitly mentioned entities.
2. Each entity must have a UNIQUE ID (e.g., entity_1, entity_2).
3. Relations describe semantic connections between entities.
4. Relation descriptions should be concise verbs or phrases.
5. Do NOT extract vague or uncertain relations.
6. Extract the MOST IMPORTANT 3-5 entities maximum.
7. Extract 1-3 key relations maximum.
8. Support multiple languages (Korean, English, Japanese, Chinese, etc.)

## DUPLICATE PREVENTION
1. If an entity is semantically identical to an existing one, REUSE the existing ID.
2. Synonyms, abbreviations, and aliases are the SAME entity.
3. Do NOT create duplicate relations (same source-target pair).
"""

    # 피드백 기반 개선 지침 추가
    if feedback_context:
        base_prompt += f"""

## FEEDBACK-BASED IMPROVEMENTS
Based on user feedback from previous sessions, please note:
{feedback_context}
"""

    # 기존 엔티티 컨텍스트
    if existing_entities:
        entities_context = "\n## Existing Entities (reuse these IDs if applicable)\n"
        for e in existing_entities[:20]:
            entities_context += f'- ID: {e.id}, Label: "{e.label}", Type: {e.type.value}\n'
        base_prompt += entities_context

    # 기존 관계 컨텍스트
    if existing_relations:
        relations_context = "\n## Existing Relations (avoid duplicates)\n"
        for r in existing_relations[:20]:
            relations_context += f"- {r.source} --[{r.relation}]--> {r.target}\n"
        base_prompt += relations_context

    # 출력 형식
    output_format = """

## Output Format
Return ONLY valid JSON in this exact format:

```json
{
  "entities": [
    { "id": "entity_1", "label": "Entity Name", "type": "ENTITY_TYPE" }
  ],
  "relations": [
    { "source": "entity_1", "target": "entity_2", "relation": "relationship description" }
  ]
}
```

If no entities or relations found, return:
```json
{ "entities": [], "relations": [] }
```

## Text to analyze:
"""

    return base_prompt + output_format + f'"""\n{text}\n"""'


class VertexAIClient:
    """Vertex AI Gemini 클라이언트"""

    def __init__(self) -> None:
        self._model: GenerativeModel | None = None
        self._initialized = False

    async def initialize(self) -> None:
        """Vertex AI 초기화"""
        if self._initialized:
            return

        settings = get_settings()

        # Vertex AI 초기화
        vertexai.init(
            project=settings.gcp_project_id,
            location=settings.gcp_region,
        )

        # Gemini 모델 로드
        self._model = GenerativeModel(settings.vertex_ai_model)

        self._initialized = True
        logger.info(
            "vertex_ai_initialized",
            project=settings.gcp_project_id,
            model=settings.vertex_ai_model,
        )

    async def extract_knowledge(
        self,
        text: str,
        existing_entities: list[GraphEntity] | None = None,
        existing_relations: list[GraphRelation] | None = None,
        feedback_context: str | None = None,
        retry_count: int = 3,
    ) -> ExtractionResult:
        """
        텍스트에서 엔티티와 관계 추출

        Args:
            text: 분석할 텍스트
            existing_entities: 기존 엔티티 목록 (중복 방지용)
            existing_relations: 기존 관계 목록 (중복 방지용)
            feedback_context: 피드백 기반 개선 컨텍스트
            retry_count: 재시도 횟수
        """
        if not self._model:
            await self.initialize()

        prompt = create_extraction_prompt(
            text, existing_entities, existing_relations, feedback_context
        )

        settings = get_settings()

        for attempt in range(retry_count):
            try:
                # 생성 설정
                generation_config = GenerationConfig(
                    temperature=0.1,
                    max_output_tokens=2048,
                    top_p=0.8,
                    top_k=40,
                )

                # 비동기 호출
                response = await asyncio.to_thread(
                    self._model.generate_content,
                    prompt,
                    generation_config=generation_config,
                )

                # JSON 파싱
                result = self._parse_response(response.text)

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
                    return ExtractionResult(entities=[], relations=[])

                await asyncio.sleep(1)

        return ExtractionResult(entities=[], relations=[])

    async def generate_feedback_summary(
        self, feedbacks: list[dict[str, Any]]
    ) -> str:
        """
        사용자 피드백을 분석하여 개선 지침 생성

        Args:
            feedbacks: 피드백 목록 [{rating, comment, session_metadata}, ...]
        """
        if not self._model or not feedbacks:
            return ""

        # 피드백 분석 프롬프트
        feedback_texts = []
        for fb in feedbacks[-10:]:  # 최근 10개만
            rating = fb.get("rating", 0)
            comment = fb.get("comment", "")
            feedback_texts.append(f"- Rating: {rating}/5, Comment: {comment}")

        prompt = f"""Analyze the following user feedback about knowledge graph extraction
and provide concise improvement guidelines for future extractions.

User Feedback:
{chr(10).join(feedback_texts)}

Provide 2-3 specific, actionable guidelines based on the feedback patterns.
Focus on what users found helpful or unhelpful.
Keep the response under 200 words.
"""

        try:
            response = await asyncio.to_thread(
                self._model.generate_content,
                prompt,
                generation_config=GenerationConfig(
                    temperature=0.3,
                    max_output_tokens=300,
                ),
            )
            return response.text.strip()
        except Exception as e:
            logger.error("feedback_summary_generation_failed", error=str(e))
            return ""

    def _parse_response(self, content: str) -> ExtractionResult:
        """LLM 응답에서 JSON 추출 및 파싱"""
        # JSON 블록 추출
        json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            # JSON 블록이 없으면 전체에서 JSON 찾기
            json_match = re.search(r"\{.*\}", content, re.DOTALL)
            if json_match:
                json_str = json_match.group(0)
            else:
                raise ValueError(f"JSON not found in response: {content[:200]}")

        data = json.loads(json_str)

        # 엔티티 변환
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

        # 관계 변환
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


# 싱글톤 인스턴스
_vertex_client: VertexAIClient | None = None


async def get_vertex_client() -> VertexAIClient:
    """Vertex AI 클라이언트 의존성"""
    global _vertex_client
    if _vertex_client is None:
        _vertex_client = VertexAIClient()
        await _vertex_client.initialize()
    return _vertex_client

