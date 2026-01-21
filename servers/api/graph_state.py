"""
그래프 상태 관리 모듈
서버 사이드 권위적 그래프 상태 관리
"""

import asyncio
import time
import uuid
from typing import Any

from logger import get_logger
from models import (
    EntityType,
    ExtractionResult,
    ExtractedEntity,
    GraphDelta,
    GraphEntity,
    GraphRelation,
    GraphState,
)
from redis_client import RedisManager, get_redis

logger = get_logger(__name__)


class GraphStateManager:
    """그래프 상태 관리자"""

    def __init__(self, redis: RedisManager) -> None:
        self._redis = redis
        self._local_cache: dict[str, GraphState] = {}
        self._lock = asyncio.Lock()

    async def get_state(self, session_id: str) -> GraphState:
        """세션의 현재 그래프 상태 조회"""
        # 로컬 캐시 확인
        if session_id in self._local_cache:
            return self._local_cache[session_id]

        # Redis에서 로드
        data = await self._redis.load_graph_state(session_id)
        if data:
            state = GraphState(**data)
            self._local_cache[session_id] = state
            return state

        # 새 상태 생성
        state = self._create_empty_state()
        self._local_cache[session_id] = state
        await self._save_state(session_id, state)
        return state

    async def apply_extraction(
        self, session_id: str, extraction: ExtractionResult
    ) -> GraphDelta:
        """추출 결과를 그래프에 적용하고 델타 반환"""
        async with self._lock:
            current_state = await self.get_state(session_id)
            now = int(time.time() * 1000)

            # ID 매핑 (추출된 임시 ID → 최종 ID)
            id_map: dict[str, str] = {}

            added_entities: list[GraphEntity] = []
            updated_entities: list[GraphEntity] = []
            added_relations: list[GraphRelation] = []

            # 1. 엔티티 처리
            for extracted in extraction.entities:
                existing = self._find_similar_entity(extracted, current_state.entities)

                if existing:
                    # 기존 엔티티 재사용
                    id_map[extracted.id] = existing.id

                    # 라벨이 더 구체적이면 업데이트
                    if len(extracted.label) > len(existing.label):
                        updated_entity = GraphEntity(
                            id=existing.id,
                            label=extracted.label,
                            type=existing.type,
                            createdAt=existing.created_at,
                            updatedAt=now,
                            metadata=existing.metadata,
                        )
                        updated_entities.append(updated_entity)

                        # 기존 엔티티 교체
                        for i, e in enumerate(current_state.entities):
                            if e.id == existing.id:
                                current_state.entities[i] = updated_entity
                                break
                else:
                    # 새 엔티티 생성
                    new_id = str(uuid.uuid4())
                    id_map[extracted.id] = new_id

                    new_entity = GraphEntity(
                        id=new_id,
                        label=extracted.label,
                        type=extracted.type,
                        createdAt=now,
                        updatedAt=now,
                    )
                    added_entities.append(new_entity)
                    current_state.entities.append(new_entity)

            # 2. 관계 처리
            for extracted in extraction.relations:
                # ID 매핑 시도
                source_id = id_map.get(extracted.source, extracted.source)
                target_id = id_map.get(extracted.target, extracted.target)

                # ID로 엔티티 찾기
                source_entity = next((e for e in current_state.entities if e.id == source_id), None)
                target_entity = next((e for e in current_state.entities if e.id == target_id), None)

                # ID로 못 찾으면 라벨로 매칭 시도 (LLM이 라벨을 ID로 사용할 수 있음)
                if not source_entity:
                    source_entity = next(
                        (e for e in current_state.entities 
                         if self._normalize_label(e.label) == self._normalize_label(extracted.source)),
                        None
                    )
                    if source_entity:
                        source_id = source_entity.id
                        
                if not target_entity:
                    target_entity = next(
                        (e for e in current_state.entities 
                         if self._normalize_label(e.label) == self._normalize_label(extracted.target)),
                        None
                    )
                    if target_entity:
                        target_id = target_entity.id

                # 유효성 검증
                if not source_entity or not target_entity:
                    logger.warning(
                        "relation_skipped_missing_entity",
                        source=extracted.source,
                        target=extracted.target,
                        source_found=source_entity is not None,
                        target_found=target_entity is not None,
                    )
                    continue

                # 중복 확인 (강화: 같은 source-target 쌍이면 관계 내용이 달라도 유사하면 스킵)
                is_duplicate = False
                for r in current_state.relations:
                    if r.source == source_id and r.target == target_id:
                        # 같은 source-target 쌍이면 관계가 유사한지 확인
                        existing_rel = self._normalize_relation(r.relation)
                        new_rel = self._normalize_relation(extracted.relation)
                        if existing_rel == new_rel:
                            is_duplicate = True
                            break
                        # 유사도 70% 이상이면 중복으로 처리
                        if self._calculate_similarity(existing_rel, new_rel) > 0.7:
                            is_duplicate = True
                            break
                    # 역방향 관계도 확인
                    if r.source == target_id and r.target == source_id:
                        existing_rel = self._normalize_relation(r.relation)
                        new_rel = self._normalize_relation(extracted.relation)
                        if self._calculate_similarity(existing_rel, new_rel) > 0.7:
                            is_duplicate = True
                            break

                if is_duplicate:
                    continue

                # 새 관계 생성
                new_relation = GraphRelation(
                    id=str(uuid.uuid4()),
                    source=source_id,
                    target=target_id,
                    relation=extracted.relation,
                    createdAt=now,
                )
                added_relations.append(new_relation)
                current_state.relations.append(new_relation)

            # 3. 상태 업데이트
            new_version = current_state.version + 1
            delta = GraphDelta(
                addedEntities=added_entities,
                addedRelations=added_relations,
                updatedEntities=updated_entities,
                removedEntityIds=[],
                removedRelationIds=[],
                fromVersion=current_state.version,
                toVersion=new_version,
            )

            current_state.version = new_version
            current_state.last_updated = now

            # Redis에 저장
            await self._save_state(session_id, current_state)

            # 스냅샷 저장 (10버전마다)
            if new_version % 10 == 0:
                await self._redis.save_graph_snapshot(
                    session_id, new_version, current_state.model_dump(by_alias=True)
                )

            logger.info(
                "graph_updated",
                session_id=session_id,
                version=new_version,
                added_entities=len(added_entities),
                added_relations=len(added_relations),
                updated_entities=len(updated_entities),
            )

            return delta

    async def get_full_state_for_client(self, session_id: str) -> dict[str, Any]:
        """클라이언트 전송용 전체 상태"""
        state = await self.get_state(session_id)
        return state.model_dump(by_alias=True)

    async def reset_state(self, session_id: str) -> None:
        """세션 상태 초기화"""
        async with self._lock:
            new_state = self._create_empty_state()
            self._local_cache[session_id] = new_state
            await self._save_state(session_id, new_state)
            logger.info("graph_state_reset", session_id=session_id)

    def _create_empty_state(self) -> GraphState:
        """빈 그래프 상태 생성"""
        now = int(time.time() * 1000)
        return GraphState(
            version=0,
            entities=[],
            relations=[],
            lastUpdated=now,
        )

    def _find_similar_entity(
        self, extracted: ExtractedEntity, existing: list[GraphEntity]
    ) -> GraphEntity | None:
        """유사한 기존 엔티티 찾기 (강화된 중복 검출)"""
        normalized_label = self._normalize_label(extracted.label)
        
        if not normalized_label:
            return None

        # 1. 정확한 라벨 매칭 (유형 무관)
        for entity in existing:
            if self._normalize_label(entity.label) == normalized_label:
                return entity

        # 2. 정확한 라벨 매칭 (원본 비교)
        for entity in existing:
            if entity.label.strip().lower() == extracted.label.strip().lower():
                return entity

        # 3. 부분 매칭 - 한쪽이 다른 쪽을 포함 (3글자 이상일 때만)
        if len(normalized_label) >= 3:
            for entity in existing:
                entity_normalized = self._normalize_label(entity.label)
                if len(entity_normalized) >= 3:
                    if (
                        entity_normalized in normalized_label
                        or normalized_label in entity_normalized
                    ):
                        return entity

        # 4. 유사도 기반 매칭 (같은 유형, 70% 이상)
        for entity in existing:
            if entity.type != extracted.type:
                continue
            similarity = self._calculate_similarity(
                normalized_label, self._normalize_label(entity.label)
            )
            if similarity > 0.7:
                return entity

        # 5. 높은 유사도 매칭 (유형 무관, 90% 이상)
        for entity in existing:
            similarity = self._calculate_similarity(
                normalized_label, self._normalize_label(entity.label)
            )
            if similarity > 0.9:
                return entity

        return None

    def _normalize_label(self, label: str) -> str:
        """라벨 정규화"""
        import re

        return re.sub(r"[^\w가-힣]", "", label.lower())

    def _normalize_relation(self, relation: str) -> str:
        """관계 정규화"""
        import re

        return re.sub(r"[^\w가-힣]", "_", relation.lower())

    def _calculate_similarity(self, s1: str, s2: str) -> float:
        """레벤슈타인 유사도 계산"""
        if not s1 or not s2:
            return 0.0

        m, n = len(s1), len(s2)
        dp = [[0] * (n + 1) for _ in range(m + 1)]

        for i in range(m + 1):
            dp[i][0] = i
        for j in range(n + 1):
            dp[0][j] = j

        for i in range(1, m + 1):
            for j in range(1, n + 1):
                if s1[i - 1] == s2[j - 1]:
                    dp[i][j] = dp[i - 1][j - 1]
                else:
                    dp[i][j] = min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1

        max_len = max(m, n)
        return (max_len - dp[m][n]) / max_len

    async def _save_state(self, session_id: str, state: GraphState) -> None:
        """상태를 Redis에 저장"""
        await self._redis.save_graph_state(
            session_id, state.model_dump(by_alias=True)
        )


# 전역 인스턴스
_graph_manager: GraphStateManager | None = None


async def get_graph_manager() -> GraphStateManager:
    """그래프 매니저 의존성"""
    global _graph_manager
    if _graph_manager is None:
        redis = await get_redis()
        _graph_manager = GraphStateManager(redis)
    return _graph_manager


