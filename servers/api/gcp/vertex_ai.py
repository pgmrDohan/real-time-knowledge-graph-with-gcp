"""
Vertex AI Gemini 모듈
엔티티/관계 추출을 위한 LLM 클라이언트

최적화된 프롬프트 + 스트리밍 응답 지원
"""

import asyncio
import json
import re
from typing import Any, AsyncGenerator, Callable

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


# ============================================
# 최적화된 프롬프트 템플릿
# ============================================

COMPACT_EXTRACTION_PROMPT = """Extract entities and relations from text. Be concise.

## Types
PERSON|ORGANIZATION|LOCATION|CONCEPT|EVENT|PRODUCT|TECHNOLOGY|DATE|METRIC|ACTION

## Rules
- Max 5 entities, 3 relations
- Reuse existing entity IDs when applicable
- Relations: use short verb phrases
- Support: Korean, English, Japanese, Chinese
{context}
## Text
"{text}"

## Output (JSON only)
```json
{{"entities":[{{"id":"e1","label":"Name","type":"TYPE"}}],"relations":[{{"source":"e1","target":"e2","relation":"verb"}}]}}
```"""

COMPACT_CONTEXT_TEMPLATE = """
## Existing (reuse IDs)
Entities: {entities_summary}
Relations: {relations_summary}"""

FEEDBACK_CONTEXT_TEMPLATE = """
## Feedback Guidelines
{feedback}"""


def select_relevant_context(
    text: str,
    entities: list[GraphEntity],
    relations: list[GraphRelation],
    max_entities: int = 8,
    max_relations: int = 5,
) -> tuple[list[GraphEntity], list[GraphRelation]]:
    """
    현재 텍스트와 관련성 높은 엔티티/관계만 선택
    
    선택 기준:
    1. 텍스트에 언급된 엔티티 (우선)
    2. 최근 업데이트된 엔티티 (recency bias)
    3. 선택된 엔티티와 연결된 관계
    """
    if not entities:
        return [], []
    
    text_lower = text.lower()
    selected_entities: list[GraphEntity] = []
    seen_ids: set[str] = set()
    
    # 1. 텍스트에 언급된 엔티티 우선 선택
    for entity in entities:
        label_lower = entity.label.lower()
        # 정확한 매칭 또는 부분 매칭 (3글자 이상)
        if label_lower in text_lower or (len(label_lower) >= 3 and label_lower in text_lower):
            if entity.id not in seen_ids:
                selected_entities.append(entity)
                seen_ids.add(entity.id)
    
    # 2. 최근 엔티티로 채우기 (남은 슬롯)
    remaining_slots = max_entities - len(selected_entities)
    if remaining_slots > 0:
        recent_entities = sorted(
            [e for e in entities if e.id not in seen_ids],
            key=lambda e: e.updated_at,
            reverse=True
        )
        for entity in recent_entities[:remaining_slots]:
            selected_entities.append(entity)
            seen_ids.add(entity.id)
    
    # 3. 선택된 엔티티와 연결된 관계만 선택
    selected_relations: list[GraphRelation] = []
    for relation in relations:
        if relation.source in seen_ids or relation.target in seen_ids:
            selected_relations.append(relation)
            if len(selected_relations) >= max_relations:
                break
    
    return selected_entities, selected_relations


def format_compact_context(
    entities: list[GraphEntity],
    relations: list[GraphRelation],
) -> str:
    """컨텍스트를 간결한 형태로 포맷"""
    if not entities and not relations:
        return ""
    
    # 엔티티: "id:label(TYPE), ..." 형식
    entities_parts = [f"{e.id}:{e.label}({e.type.value})" for e in entities]
    entities_summary = ", ".join(entities_parts) if entities_parts else "none"
    
    # 관계: "src->tgt:rel, ..." 형식
    relations_parts = [f"{r.source}->{r.target}:{r.relation}" for r in relations]
    relations_summary = ", ".join(relations_parts) if relations_parts else "none"
    
    return COMPACT_CONTEXT_TEMPLATE.format(
        entities_summary=entities_summary,
        relations_summary=relations_summary
    )


def create_extraction_prompt(
    text: str,
    existing_entities: list[GraphEntity] | None = None,
    existing_relations: list[GraphRelation] | None = None,
    feedback_context: str | None = None,
    use_compact: bool = True,
) -> str:
    """
    엔티티/관계 추출 프롬프트 생성
    
    Args:
        text: 분석할 텍스트
        existing_entities: 기존 엔티티 목록
        existing_relations: 기존 관계 목록
        feedback_context: 피드백 기반 개선 컨텍스트
        use_compact: 간결한 프롬프트 사용 여부 (기본: True)
    """
    if use_compact:
        return create_compact_prompt(text, existing_entities, existing_relations, feedback_context)
    
    # 레거시 프롬프트 (필요시 폴백)
    return create_legacy_prompt(text, existing_entities, existing_relations, feedback_context)


def create_compact_prompt(
    text: str,
    existing_entities: list[GraphEntity] | None = None,
    existing_relations: list[GraphRelation] | None = None,
    feedback_context: str | None = None,
) -> str:
    """최적화된 간결한 프롬프트 생성"""
    context_parts = []
    
    # 관련성 기반 컨텍스트 선택
    if existing_entities or existing_relations:
        selected_entities, selected_relations = select_relevant_context(
            text,
            existing_entities or [],
            existing_relations or [],
        )
        entity_context = format_compact_context(selected_entities, selected_relations)
        if entity_context:
            context_parts.append(entity_context)
    
    # 피드백 컨텍스트 (간결하게)
    if feedback_context:
        # 피드백을 2-3줄로 제한
        feedback_lines = feedback_context.strip().split('\n')[:3]
        short_feedback = '\n'.join(feedback_lines)
        context_parts.append(FEEDBACK_CONTEXT_TEMPLATE.format(feedback=short_feedback))
    
    context = '\n'.join(context_parts)
    
    return COMPACT_EXTRACTION_PROMPT.format(
        context=context,
        text=text
    )


def create_legacy_prompt(
    text: str,
    existing_entities: list[GraphEntity] | None = None,
    existing_relations: list[GraphRelation] | None = None,
    feedback_context: str | None = None,
) -> str:
    """레거시 프롬프트 (호환성 유지)"""
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


class PartialJSONParser:
    """스트리밍 응답에서 부분 JSON 파싱"""
    
    def __init__(self) -> None:
        self._buffer = ""
        self._parsed_entities: list[ExtractedEntity] = []
        self._parsed_relations: list[ExtractedRelation] = []
        self._seen_entity_ids: set[str] = set()
        self._seen_relation_keys: set[str] = set()
    
    def feed(self, chunk: str) -> tuple[list[ExtractedEntity], list[ExtractedRelation]]:
        """
        청크를 추가하고 새로 파싱된 엔티티/관계 반환
        
        Returns:
            (새로운 엔티티들, 새로운 관계들)
        """
        self._buffer += chunk
        new_entities: list[ExtractedEntity] = []
        new_relations: list[ExtractedRelation] = []
        
        # JSON 블록 찾기 시도
        json_content = self._extract_json_content()
        if not json_content:
            return new_entities, new_relations
        
        try:
            # 엔티티 파싱 시도
            entities = self._try_parse_entities(json_content)
            for entity in entities:
                if entity.id not in self._seen_entity_ids:
                    self._seen_entity_ids.add(entity.id)
                    self._parsed_entities.append(entity)
                    new_entities.append(entity)
            
            # 관계 파싱 시도
            relations = self._try_parse_relations(json_content)
            for relation in relations:
                rel_key = f"{relation.source}:{relation.target}:{relation.relation}"
                if rel_key not in self._seen_relation_keys:
                    self._seen_relation_keys.add(rel_key)
                    self._parsed_relations.append(relation)
                    new_relations.append(relation)
                    
        except Exception:
            pass  # 아직 완전한 JSON이 아님
        
        return new_entities, new_relations
    
    def get_result(self) -> ExtractionResult:
        """최종 결과 반환"""
        return ExtractionResult(
            entities=self._parsed_entities,
            relations=self._parsed_relations
        )
    
    def _extract_json_content(self) -> str:
        """버퍼에서 JSON 내용 추출"""
        # ```json ... ``` 블록 찾기
        match = re.search(r"```(?:json)?\s*(\{.*)", self._buffer, re.DOTALL)
        if match:
            return match.group(1)
        
        # 직접 { 로 시작하는 JSON 찾기
        match = re.search(r"(\{.*)", self._buffer, re.DOTALL)
        if match:
            return match.group(1)
        
        return ""
    
    def _try_parse_entities(self, json_content: str) -> list[ExtractedEntity]:
        """엔티티 배열 파싱 시도"""
        entities = []
        
        # "entities": [...] 패턴 찾기
        pattern = r'"entities"\s*:\s*\[(.*?)\]'
        match = re.search(pattern, json_content, re.DOTALL)
        if not match:
            # 아직 배열이 닫히지 않았을 수 있음 - 개별 엔티티 파싱
            pattern = r'"entities"\s*:\s*\[(.*)'
            match = re.search(pattern, json_content, re.DOTALL)
            if not match:
                return entities
        
        entities_str = match.group(1)
        
        # 개별 엔티티 객체 파싱
        entity_pattern = r'\{\s*"id"\s*:\s*"([^"]+)"\s*,\s*"label"\s*:\s*"([^"]+)"\s*,\s*"type"\s*:\s*"([^"]+)"\s*\}'
        for m in re.finditer(entity_pattern, entities_str):
            entity_id, label, entity_type = m.groups()
            if entity_type not in EntityType.__members__:
                entity_type = "UNKNOWN"
            entities.append(ExtractedEntity(
                id=entity_id,
                label=label,
                type=EntityType(entity_type)
            ))
        
        return entities
    
    def _try_parse_relations(self, json_content: str) -> list[ExtractedRelation]:
        """관계 배열 파싱 시도"""
        relations = []
        
        # "relations": [...] 패턴 찾기
        pattern = r'"relations"\s*:\s*\[(.*?)\]'
        match = re.search(pattern, json_content, re.DOTALL)
        if not match:
            pattern = r'"relations"\s*:\s*\[(.*)'
            match = re.search(pattern, json_content, re.DOTALL)
            if not match:
                return relations
        
        relations_str = match.group(1)
        
        # 개별 관계 객체 파싱
        relation_pattern = r'\{\s*"source"\s*:\s*"([^"]+)"\s*,\s*"target"\s*:\s*"([^"]+)"\s*,\s*"relation"\s*:\s*"([^"]+)"\s*\}'
        for m in re.finditer(relation_pattern, relations_str):
            source, target, relation = m.groups()
            relations.append(ExtractedRelation(
                source=source,
                target=target,
                relation=relation
            ))
        
        return relations


class VertexAIClient:
    """Vertex AI Gemini 클라이언트 (스트리밍 지원)"""

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

    async def extract_knowledge_streaming(
        self,
        text: str,
        existing_entities: list[GraphEntity] | None = None,
        existing_relations: list[GraphRelation] | None = None,
        feedback_context: str | None = None,
        on_partial: Callable[[list[ExtractedEntity], list[ExtractedRelation]], Any] | None = None,
    ) -> ExtractionResult:
        """
        스트리밍 방식으로 엔티티/관계 추출
        
        부분 결과가 파싱되면 즉시 on_partial 콜백 호출
        
        Args:
            text: 분석할 텍스트
            existing_entities: 기존 엔티티 목록
            existing_relations: 기존 관계 목록
            feedback_context: 피드백 컨텍스트
            on_partial: 부분 결과 콜백 (새 엔티티, 새 관계)
        """
        if not self._model:
            await self.initialize()

        prompt = create_extraction_prompt(
            text, existing_entities, existing_relations, feedback_context, use_compact=True
        )

        try:
            generation_config = GenerationConfig(
                temperature=0.1,
                max_output_tokens=1024,  # 간결한 응답용으로 축소
                top_p=0.8,
                top_k=40,
            )

            # 스트리밍 응답 처리
            parser = PartialJSONParser()
            
            # 동기 스트리밍을 비동기로 래핑
            def stream_generate():
                return self._model.generate_content(
                    prompt,
                    generation_config=generation_config,
                    stream=True,
                )
            
            response_stream = await asyncio.to_thread(stream_generate)
            
            # 스트리밍 청크 처리
            async def process_stream():
                for chunk in response_stream:
                    if chunk.text:
                        new_entities, new_relations = parser.feed(chunk.text)
                        
                        # 새로운 엔티티/관계가 파싱되면 콜백 호출
                        if (new_entities or new_relations) and on_partial:
                            try:
                                result = on_partial(new_entities, new_relations)
                                if asyncio.iscoroutine(result):
                                    await result
                            except Exception as e:
                                logger.warning("on_partial_callback_error", error=str(e))
                    
                    # 이벤트 루프에 제어 양보
                    await asyncio.sleep(0)
            
            await asyncio.to_thread(lambda: None)  # 초기화
            
            # 스트림을 동기적으로 처리하되 콜백은 비동기로
            for chunk in response_stream:
                if chunk.text:
                    new_entities, new_relations = parser.feed(chunk.text)
                    
                    if (new_entities or new_relations) and on_partial:
                        try:
                            result = on_partial(new_entities, new_relations)
                            if asyncio.iscoroutine(result):
                                await result
                        except Exception as e:
                            logger.warning("on_partial_callback_error", error=str(e))

            result = parser.get_result()
            
            logger.debug(
                "streaming_extraction_completed",
                text_length=len(text),
                entities_count=len(result.entities),
                relations_count=len(result.relations),
            )
            
            return result

        except Exception as e:
            logger.error("streaming_extraction_failed", error=str(e))
            # 폴백: 일반 추출
            return await self.extract_knowledge(
                text, existing_entities, existing_relations, feedback_context
            )

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

