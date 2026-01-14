/**
 * @rkg/graph-utils
 * 지식 그래프 유틸리티 - 상태 관리, 병합, 변환
 */

import type {
  GraphState,
  GraphDelta,
  GraphEntity,
  GraphRelation,
  ExtractionResult,
  ExtractedEntity,
  ExtractedRelation,
  RFNodeData,
  RFEdgeData,
} from '@rkg/shared-types';
import { generateId, createTimestamp } from '@rkg/shared-types';

// ============================================
// 그래프 상태 관리
// ============================================

/**
 * 빈 그래프 상태 생성
 */
export function createEmptyGraphState(): GraphState {
  return {
    version: 0,
    entities: [],
    relations: [],
    lastUpdated: createTimestamp(),
  };
}

/**
 * 그래프 상태 복제 (불변성 유지)
 */
export function cloneGraphState(state: GraphState): GraphState {
  return {
    version: state.version,
    entities: state.entities.map((e) => ({ ...e })),
    relations: state.relations.map((r) => ({ ...r })),
    lastUpdated: state.lastUpdated,
  };
}

// ============================================
// 추출 결과 → 그래프 변환
// ============================================

/**
 * 추출 결과를 그래프 델타로 변환
 * 기존 그래프와 비교하여 실제 변경사항만 추출
 */
export function extractionToGraphDelta(
  extraction: ExtractionResult,
  currentState: GraphState
): GraphDelta {
  const now = createTimestamp();
  const entityIdMap = new Map<string, string>(); // 임시ID → 최종ID 매핑

  const addedEntities: GraphEntity[] = [];
  const updatedEntities: GraphEntity[] = [];
  const addedRelations: GraphRelation[] = [];

  // 1. 엔티티 처리
  for (const extracted of extraction.entities) {
    const existing = findSimilarEntity(extracted, currentState.entities);

    if (existing) {
      // 기존 엔티티 재사용
      entityIdMap.set(extracted.id, existing.id);

      // 라벨이 더 구체적이면 업데이트
      if (extracted.label.length > existing.label.length) {
        updatedEntities.push({
          ...existing,
          label: extracted.label,
          updatedAt: now,
        });
      }
    } else {
      // 새 엔티티 생성
      const newId = generateId();
      entityIdMap.set(extracted.id, newId);

      addedEntities.push({
        id: newId,
        label: extracted.label,
        type: extracted.type,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // 2. 관계 처리
  for (const extracted of extraction.relations) {
    const sourceId = entityIdMap.get(extracted.source) || extracted.source;
    const targetId = entityIdMap.get(extracted.target) || extracted.target;

    // 유효성 검증: 양쪽 엔티티가 존재해야 함
    const sourceExists =
      currentState.entities.some((e) => e.id === sourceId) ||
      addedEntities.some((e) => e.id === sourceId);
    const targetExists =
      currentState.entities.some((e) => e.id === targetId) ||
      addedEntities.some((e) => e.id === targetId);

    if (!sourceExists || !targetExists) {
      console.warn(`관계 스킵: 엔티티 미존재 (${sourceId} -> ${targetId})`);
      continue;
    }

    // 중복 관계 확인
    const isDuplicate = currentState.relations.some(
      (r) =>
        r.source === sourceId &&
        r.target === targetId &&
        normalizeRelation(r.relation) === normalizeRelation(extracted.relation)
    );

    if (!isDuplicate) {
      addedRelations.push({
        id: generateId(),
        source: sourceId,
        target: targetId,
        relation: extracted.relation,
        createdAt: now,
      });
    }
  }

  return {
    addedEntities,
    addedRelations,
    updatedEntities,
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: currentState.version,
    toVersion: currentState.version + 1,
  };
}

/**
 * 델타를 그래프 상태에 적용
 */
export function applyDeltaToGraph(state: GraphState, delta: GraphDelta): GraphState {
  const newState = cloneGraphState(state);

  // 버전 검증
  if (delta.fromVersion !== state.version) {
    console.warn(
      `버전 불일치: 현재 ${state.version}, 델타 요구 ${delta.fromVersion}`
    );
  }

  // 엔티티 추가
  newState.entities.push(...delta.addedEntities);

  // 엔티티 업데이트
  for (const updated of delta.updatedEntities) {
    const idx = newState.entities.findIndex((e) => e.id === updated.id);
    if (idx !== -1) {
      newState.entities[idx] = updated;
    }
  }

  // 엔티티 삭제
  newState.entities = newState.entities.filter(
    (e) => !delta.removedEntityIds.includes(e.id)
  );

  // 관계 추가
  newState.relations.push(...delta.addedRelations);

  // 관계 삭제
  newState.relations = newState.relations.filter(
    (r) => !delta.removedRelationIds.includes(r.id)
  );

  // 버전 및 타임스탬프 업데이트
  newState.version = delta.toVersion;
  newState.lastUpdated = createTimestamp();

  return newState;
}

// ============================================
// 유사도 및 중복 검출
// ============================================

/**
 * 유사한 기존 엔티티 찾기
 */
export function findSimilarEntity(
  extracted: ExtractedEntity,
  existingEntities: GraphEntity[]
): GraphEntity | undefined {
  const normalizedLabel = normalizeLabel(extracted.label);

  // 1. 정확한 라벨 매칭
  const exactMatch = existingEntities.find(
    (e) => normalizeLabel(e.label) === normalizedLabel
  );
  if (exactMatch) return exactMatch;

  // 2. 동일 ID 매칭 (기존 ID 재사용 시)
  const idMatch = existingEntities.find((e) => e.id === extracted.id);
  if (idMatch) return idMatch;

  // 3. 부분 매칭 (한 쪽이 다른 쪽을 포함)
  const partialMatch = existingEntities.find((e) => {
    const existingNorm = normalizeLabel(e.label);
    return (
      existingNorm.includes(normalizedLabel) ||
      normalizedLabel.includes(existingNorm)
    );
  });
  if (partialMatch && partialMatch.type === extracted.type) {
    return partialMatch;
  }

  // 4. 레벤슈타인 거리 기반 유사도 (임계값: 80%)
  for (const entity of existingEntities) {
    if (entity.type !== extracted.type) continue;
    const similarity = calculateSimilarity(
      normalizedLabel,
      normalizeLabel(entity.label)
    );
    if (similarity > 0.8) {
      return entity;
    }
  }

  return undefined;
}

/**
 * 라벨 정규화
 */
export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, '') // 공백 제거
    .replace(/[^\w가-힣]/g, ''); // 특수문자 제거
}

/**
 * 관계 정규화
 */
export function normalizeRelation(relation: string): string {
  return relation
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w가-힣_]/g, '');
}

/**
 * 문자열 유사도 계산 (레벤슈타인 기반)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * 레벤슈타인 거리 계산
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1, // 삭제
          dp[i][j - 1] + 1, // 삽입
          dp[i - 1][j - 1] + 1 // 교체
        );
      }
    }
  }

  return dp[m][n];
}

// ============================================
// React Flow 변환
// ============================================

/**
 * 그래프 상태를 React Flow 노드로 변환
 */
export function toReactFlowNodes(
  state: GraphState,
  delta?: GraphDelta
): Array<{ id: string; type: string; position: { x: number; y: number }; data: RFNodeData }> {
  const addedIds = new Set(delta?.addedEntities.map((e) => e.id) || []);
  const updatedIds = new Set(delta?.updatedEntities.map((e) => e.id) || []);

  return state.entities.map((entity, index) => {
    // 간단한 그리드 레이아웃 (실제로는 force-directed 등 사용)
    const position = calculateNodePosition(index, state.entities.length);

    return {
      id: entity.id,
      type: 'entityNode',
      position,
      data: {
        entity,
        isNew: addedIds.has(entity.id),
        isUpdated: updatedIds.has(entity.id),
      },
    };
  });
}

/**
 * 그래프 상태를 React Flow 엣지로 변환
 */
export function toReactFlowEdges(
  state: GraphState,
  delta?: GraphDelta
): Array<{
  id: string;
  source: string;
  target: string;
  label: string;
  animated: boolean;
  data: RFEdgeData;
}> {
  const addedIds = new Set(delta?.addedRelations.map((r) => r.id) || []);

  return state.relations.map((relation) => ({
    id: relation.id,
    source: relation.source,
    target: relation.target,
    label: relation.relation,
    animated: addedIds.has(relation.id),
    data: {
      relation,
      isNew: addedIds.has(relation.id),
    },
  }));
}

/**
 * 노드 위치 계산 (원형 레이아웃)
 */
function calculateNodePosition(
  index: number,
  total: number
): { x: number; y: number } {
  const centerX = 400;
  const centerY = 300;
  const radius = Math.min(200, 50 + total * 20);

  const angle = (2 * Math.PI * index) / Math.max(total, 1);

  return {
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle),
  };
}

// ============================================
// 그래프 통계
// ============================================

export interface GraphStats {
  entityCount: number;
  relationCount: number;
  entityTypeCounts: Record<string, number>;
  avgRelationsPerEntity: number;
  isolatedEntityCount: number;
}

/**
 * 그래프 통계 계산
 */
export function calculateGraphStats(state: GraphState): GraphStats {
  const entityTypeCounts: Record<string, number> = {};
  const entityRelationCounts = new Map<string, number>();

  // 엔티티 유형별 카운트
  for (const entity of state.entities) {
    entityTypeCounts[entity.type] = (entityTypeCounts[entity.type] || 0) + 1;
    entityRelationCounts.set(entity.id, 0);
  }

  // 관계 카운트
  for (const relation of state.relations) {
    entityRelationCounts.set(
      relation.source,
      (entityRelationCounts.get(relation.source) || 0) + 1
    );
    entityRelationCounts.set(
      relation.target,
      (entityRelationCounts.get(relation.target) || 0) + 1
    );
  }

  // 고립된 엔티티 카운트
  let isolatedCount = 0;
  let totalRelations = 0;
  for (const count of entityRelationCounts.values()) {
    if (count === 0) isolatedCount++;
    totalRelations += count;
  }

  return {
    entityCount: state.entities.length,
    relationCount: state.relations.length,
    entityTypeCounts,
    avgRelationsPerEntity:
      state.entities.length > 0 ? totalRelations / state.entities.length : 0,
    isolatedEntityCount: isolatedCount,
  };
}

// ============================================
// 직렬화/역직렬화
// ============================================

/**
 * 그래프 상태를 JSON 문자열로 직렬화
 */
export function serializeGraphState(state: GraphState): string {
  return JSON.stringify(state);
}

/**
 * JSON 문자열에서 그래프 상태 역직렬화
 */
export function deserializeGraphState(json: string): GraphState | null {
  try {
    const parsed = JSON.parse(json) as GraphState;

    // 기본 검증
    if (
      typeof parsed.version !== 'number' ||
      !Array.isArray(parsed.entities) ||
      !Array.isArray(parsed.relations)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

// ============================================
// 내보내기
// ============================================

export type { GraphState, GraphDelta, GraphEntity, GraphRelation };



