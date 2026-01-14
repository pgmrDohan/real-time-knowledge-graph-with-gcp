/**
 * Zustand 기반 그래프 상태 관리
 * 노드 겹침 방지 알고리즘 포함
 */

import { create } from 'zustand';
import type { Node, Edge } from 'reactflow';
import type {
  GraphState,
  GraphDelta,
  GraphEntity,
  GraphRelation,
  ProcessingStage,
  STTPartialPayload,
  STTFinalPayload,
  RFNodeData,
  RFEdgeData,
} from '@rkg/shared-types';

// 엔티티 타입별 색상
const ENTITY_COLORS: Record<string, string> = {
  PERSON: '#ff6b6b',
  ORGANIZATION: '#4ecdc4',
  LOCATION: '#45b7d1',
  CONCEPT: '#96ceb4',
  EVENT: '#ffeaa7',
  PRODUCT: '#dfe6e9',
  TECHNOLOGY: '#a29bfe',
  DATE: '#fd79a8',
  METRIC: '#00b894',
  ACTION: '#e17055',
  UNKNOWN: '#636e72',
};

// 노드 크기 상수
const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;
const NODE_MARGIN = 40;
const REPULSION_FORCE = 100;

interface TranscriptEntry {
  id: string;
  text: string;
  isPartial: boolean;
  timestamp: number;
}

// 피드백 관련 타입
interface FeedbackRequest {
  sessionId: string;
  entitiesCount: number;
  relationsCount: number;
  durationSeconds: number;
}

interface GraphStoreState {
  // 그래프 상태
  graphState: GraphState | null;
  nodes: Node<RFNodeData>[];
  edges: Edge<RFEdgeData>[];

  // 처리 상태
  processingStage: ProcessingStage;

  // 트랜스크립트
  transcripts: TranscriptEntry[];
  currentPartialText: string;

  // 피드백
  showFeedbackDialog: boolean;
  feedbackRequest: FeedbackRequest | null;

  // 액션
  setGraphState: (state: GraphState) => void;
  applyDelta: (delta: GraphDelta) => void;
  setProcessingStage: (stage: ProcessingStage) => void;
  addPartialSTT: (payload: STTPartialPayload) => void;
  addFinalSTT: (payload: STTFinalPayload) => void;
  clearTranscripts: () => void;
  resetGraph: () => void;
  setShowFeedbackDialog: (show: boolean) => void;
  setFeedbackRequest: (request: FeedbackRequest | null) => void;
}

/**
 * Force-directed 레이아웃 알고리즘
 * 노드 간 겹침을 방지하고 관계 기반으로 배치
 */
function calculateForceDirectedLayout(
  entities: GraphEntity[],
  relations: GraphRelation[],
  existingPositions: Map<string, { x: number; y: number }>
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  // 기존 위치 복사 또는 초기 위치 생성
  entities.forEach((entity, index) => {
    const existing = existingPositions.get(entity.id);
    if (existing) {
      positions.set(entity.id, { ...existing });
    } else {
      // 새 노드는 나선형으로 배치
      const angle = index * 0.5;
      const radius = 150 + index * 30;
      positions.set(entity.id, {
        x: 400 + Math.cos(angle) * radius,
        y: 300 + Math.sin(angle) * radius,
      });
    }
  });

  // Force-directed 시뮬레이션 (간소화된 버전)
  const iterations = 50;
  const cooling = 0.95;
  let temperature = 100;

  for (let iter = 0; iter < iterations; iter++) {
    const forces = new Map<string, { fx: number; fy: number }>();

    // 모든 노드에 대해 초기 힘 설정
    entities.forEach((entity) => {
      forces.set(entity.id, { fx: 0, fy: 0 });
    });

    // 1. 노드 간 반발력 (겹침 방지)
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const pos1 = positions.get(entities[i].id)!;
        const pos2 = positions.get(entities[j].id)!;

        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;

        // 최소 거리 (노드 크기 + 마진)
        const minDistance = NODE_WIDTH + NODE_MARGIN;

        if (distance < minDistance) {
          const force = (REPULSION_FORCE * (minDistance - distance)) / distance;
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;

          const f1 = forces.get(entities[i].id)!;
          const f2 = forces.get(entities[j].id)!;

          f1.fx -= fx;
          f1.fy -= fy;
          f2.fx += fx;
          f2.fy += fy;
        }
      }
    }

    // 2. 연결된 노드 간 인력 (관계 기반)
    relations.forEach((relation) => {
      const sourcePos = positions.get(relation.source);
      const targetPos = positions.get(relation.target);

      if (sourcePos && targetPos) {
        const dx = targetPos.x - sourcePos.x;
        const dy = targetPos.y - sourcePos.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;

        // 이상적인 거리
        const idealDistance = NODE_WIDTH * 2;
        const force = (distance - idealDistance) * 0.1;

        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        const sourceForce = forces.get(relation.source);
        const targetForce = forces.get(relation.target);

        if (sourceForce && targetForce) {
          sourceForce.fx += fx;
          sourceForce.fy += fy;
          targetForce.fx -= fx;
          targetForce.fy -= fy;
        }
      }
    });

    // 3. 힘 적용
    entities.forEach((entity) => {
      const pos = positions.get(entity.id)!;
      const force = forces.get(entity.id)!;

      // 온도에 따라 이동량 제한
      const maxMove = temperature;
      const moveX = Math.max(-maxMove, Math.min(maxMove, force.fx));
      const moveY = Math.max(-maxMove, Math.min(maxMove, force.fy));

      pos.x += moveX;
      pos.y += moveY;

      // 경계 제한
      pos.x = Math.max(100, Math.min(1200, pos.x));
      pos.y = Math.max(100, Math.min(800, pos.y));
    });

    temperature *= cooling;
  }

  return positions;
}

/**
 * 엣지 경로 최적화 (겹침 방지)
 * 직선 경로가 다른 노드와 겹치는 경우 곡선으로 변경
 */
function optimizeEdgePaths(
  nodes: Node<RFNodeData>[],
  edges: Edge<RFEdgeData>[]
): Edge<RFEdgeData>[] {
  const nodePositions = new Map(nodes.map((n) => [n.id, n.position]));

  return edges.map((edge) => {
    const sourcePos = nodePositions.get(edge.source);
    const targetPos = nodePositions.get(edge.target);

    if (!sourcePos || !targetPos) return edge;

    // 다른 노드와의 충돌 검사
    let hasCollision = false;
    for (const node of nodes) {
      if (node.id === edge.source || node.id === edge.target) continue;

      const nodePos = node.position;

      // 선분과 사각형 충돌 검사 (간소화)
      if (lineIntersectsRect(sourcePos, targetPos, nodePos, NODE_WIDTH, NODE_HEIGHT)) {
        hasCollision = true;
        break;
      }
    }

    if (hasCollision) {
      // 충돌 시 곡선 엣지 사용
      return {
        ...edge,
        type: 'smoothstep',
        style: {
          ...edge.style,
          strokeDasharray: edge.data?.isNew ? undefined : '5,5',
        },
      };
    }

    return edge;
  });
}

/**
 * 선분과 사각형 충돌 검사
 */
function lineIntersectsRect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  rectPos: { x: number; y: number },
  width: number,
  height: number
): boolean {
  // 사각형 경계
  const left = rectPos.x - width / 2 - 20;
  const right = rectPos.x + width / 2 + 20;
  const top = rectPos.y - height / 2 - 10;
  const bottom = rectPos.y + height / 2 + 10;

  // 선분의 중점이 사각형 내부에 있는지 확인
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;

  return midX >= left && midX <= right && midY >= top && midY <= bottom;
}

// 엔티티를 React Flow 노드로 변환
function entityToNode(
  entity: GraphEntity,
  position: { x: number; y: number },
  isNew = false
): Node<RFNodeData> {
  return {
    id: entity.id,
    type: 'entityNode',
    position,
    data: {
      entity,
      isNew,
      isUpdated: false,
    },
    style: {
      '--entity-color': ENTITY_COLORS[entity.type] || ENTITY_COLORS.UNKNOWN,
    } as React.CSSProperties,
  };
}

// 관계를 React Flow 엣지로 변환
function relationToEdge(relation: GraphRelation, isNew = false): Edge<RFEdgeData> {
  return {
    id: relation.id,
    source: relation.source,
    target: relation.target,
    label: relation.relation,
    type: 'smoothstep',
    animated: isNew,
    style: {
      stroke: isNew ? '#00ffff' : '#4a5568',
      strokeWidth: isNew ? 2 : 1,
    },
    labelStyle: {
      fill: '#a0aec0',
      fontSize: 11,
      fontWeight: 500,
    },
    labelBgStyle: {
      fill: '#1a1a25',
      fillOpacity: 0.8,
    },
    data: {
      relation,
      isNew,
    },
  };
}

export const useGraphStore = create<GraphStoreState>((set, get) => ({
  // 초기 상태
  graphState: null,
  nodes: [],
  edges: [],
  processingStage: 'IDLE',
  transcripts: [],
  currentPartialText: '',
  showFeedbackDialog: false,
  feedbackRequest: null,

  // 전체 그래프 상태 설정
  setGraphState: (state) => {
    const positions = calculateForceDirectedLayout(
      state.entities,
      state.relations,
      new Map()
    );

    const nodes = state.entities.map((entity) =>
      entityToNode(entity, positions.get(entity.id)!)
    );
    const edges = state.relations.map((relation) => relationToEdge(relation));
    const optimizedEdges = optimizeEdgePaths(nodes, edges);

    set({ graphState: state, nodes, edges: optimizedEdges });
  },

  // 델타 적용
  applyDelta: (delta) => {
    const currentState = get().graphState;
    if (!currentState) return;

    // 새 엔티티 목록 생성
    let newEntities = [...currentState.entities];

    // 업데이트된 엔티티 적용
    for (const updated of delta.updatedEntities) {
      const idx = newEntities.findIndex((e) => e.id === updated.id);
      if (idx !== -1) {
        newEntities[idx] = updated;
      }
    }

    // 새 엔티티 추가
    newEntities = [...newEntities, ...delta.addedEntities];

    // 삭제된 엔티티 제거
    newEntities = newEntities.filter((e) => !delta.removedEntityIds.includes(e.id));

    // 새 관계 목록 생성
    let newRelations = [...currentState.relations, ...delta.addedRelations];
    newRelations = newRelations.filter(
      (r) => !delta.removedRelationIds.includes(r.id)
    );

    // 새 상태
    const newState: GraphState = {
      version: delta.toVersion,
      entities: newEntities,
      relations: newRelations,
      lastUpdated: Date.now(),
    };

    // 기존 노드 위치 보존
    const currentNodes = get().nodes;
    const existingPositions = new Map(
      currentNodes.map((n) => [n.id, n.position])
    );

    // Force-directed 레이아웃 계산
    const positions = calculateForceDirectedLayout(
      newEntities,
      newRelations,
      existingPositions
    );

    const addedIds = new Set(delta.addedEntities.map((e) => e.id));
    const updatedIds = new Set(delta.updatedEntities.map((e) => e.id));

    const nodes = newEntities.map((entity) => {
      const isNew = addedIds.has(entity.id);
      const isUpdated = updatedIds.has(entity.id);
      const position = positions.get(entity.id)!;

      return {
        ...entityToNode(entity, position, isNew),
        data: {
          entity,
          isNew,
          isUpdated,
        },
      };
    });

    const addedRelationIds = new Set(delta.addedRelations.map((r) => r.id));
    const edges = newRelations.map((relation) =>
      relationToEdge(relation, addedRelationIds.has(relation.id))
    );
    const optimizedEdges = optimizeEdgePaths(nodes, edges);

    set({ graphState: newState, nodes, edges: optimizedEdges });

    // 애니메이션 후 isNew 플래그 제거
    setTimeout(() => {
      set((state) => ({
        nodes: state.nodes.map((n) => ({
          ...n,
          data: { ...n.data, isNew: false, isUpdated: false },
        })),
        edges: state.edges.map((e) => ({
          ...e,
          animated: false,
          style: { ...e.style, stroke: '#4a5568', strokeWidth: 1 },
          data: { ...e.data, isNew: false },
        })),
      }));
    }, 2000);
  },

  // 처리 상태 설정
  setProcessingStage: (stage) => set({ processingStage: stage }),

  // 부분 STT 결과 추가
  addPartialSTT: (payload) => {
    set({ currentPartialText: payload.text });
  },

  // 최종 STT 결과 추가
  addFinalSTT: (payload) => {
    set((state) => ({
      transcripts: [
        ...state.transcripts,
        {
          id: payload.segmentId,
          text: payload.text,
          isPartial: false,
          timestamp: Date.now(),
        },
      ],
      currentPartialText: '',
    }));
  },

  // 트랜스크립트 초기화
  clearTranscripts: () => set({ transcripts: [], currentPartialText: '' }),

  // 그래프 초기화
  resetGraph: () =>
    set({
      graphState: null,
      nodes: [],
      edges: [],
      transcripts: [],
      currentPartialText: '',
    }),

  // 피드백 다이얼로그 표시
  setShowFeedbackDialog: (show) => set({ showFeedbackDialog: show }),

  // 피드백 요청 설정
  setFeedbackRequest: (request) =>
    set({
      feedbackRequest: request,
      showFeedbackDialog: request !== null,
    }),
}));
