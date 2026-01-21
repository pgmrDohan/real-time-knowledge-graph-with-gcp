/**
 * Zustand 기반 그래프 상태 관리
 * Dagre 기반 자동 레이아웃 + 무한 캔버스
 */

import { create } from 'zustand';
import dagre from 'dagre';
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
const NODE_SPACING_X = 250;  // 노드 간 가로 간격
const NODE_SPACING_Y = 120;  // 노드 간 세로 간격

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
 * Dagre 기반 자동 레이아웃 알고리즘
 * - 연결된 노드를 가까이 배치
 * - 노드 간 겹침 방지
 * - 무한 캔버스 지원 (경계 제한 없음)
 */
function calculateDagreLayout(
  entities: GraphEntity[],
  relations: GraphRelation[],
  existingPositions: Map<string, { x: number; y: number }>,
  direction: 'TB' | 'LR' = 'LR'  // TB: 위→아래, LR: 왼쪽→오른쪽
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  
  if (entities.length === 0) {
    return positions;
  }

  // Dagre 그래프 생성
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: NODE_SPACING_X,  // 같은 rank 내 노드 간 간격
    ranksep: NODE_SPACING_Y,  // rank 간 간격
    marginx: 50,
    marginy: 50,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // 노드 추가
  entities.forEach((entity) => {
    g.setNode(entity.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      label: entity.label,
    });
  });

  // 엣지 추가 (관계)
  relations.forEach((relation) => {
    // source와 target이 모두 존재하는지 확인
    if (g.hasNode(relation.source) && g.hasNode(relation.target)) {
      g.setEdge(relation.source, relation.target);
    }
  });

  // 레이아웃 계산
  dagre.layout(g);

  // 결과 추출
  g.nodes().forEach((nodeId) => {
    const node = g.node(nodeId);
    if (node) {
      // 기존 위치가 있고, 해당 노드의 연결이 변하지 않았으면 기존 위치 유지 고려
      const existing = existingPositions.get(nodeId);
      
      // 새 노드이거나 관계가 변경된 노드는 새 위치 사용
      // 기존 노드는 부드럽게 이동 (기존 위치와 새 위치의 중간)
      if (existing) {
        // 기존 위치에서 새 위치로 부드럽게 이동 (80% 새 위치)
        positions.set(nodeId, {
          x: existing.x * 0.2 + node.x * 0.8,
          y: existing.y * 0.2 + node.y * 0.8,
        });
      } else {
        positions.set(nodeId, { x: node.x, y: node.y });
      }
    }
  });

  // 연결되지 않은 노드들 처리 (고립 노드)
  const connectedNodes = new Set<string>();
  relations.forEach((r) => {
    connectedNodes.add(r.source);
    connectedNodes.add(r.target);
  });

  // 고립 노드들은 별도 영역에 배치
  const isolatedNodes = entities.filter((e) => !connectedNodes.has(e.id));
  if (isolatedNodes.length > 0) {
    // 기존 노드들의 최대 Y 위치 찾기
    let maxY = 0;
    positions.forEach((pos) => {
      maxY = Math.max(maxY, pos.y);
    });

    // 고립 노드들을 그리드 형태로 배치
    const cols = Math.ceil(Math.sqrt(isolatedNodes.length));
    isolatedNodes.forEach((entity, index) => {
      const existing = existingPositions.get(entity.id);
      if (existing) {
        positions.set(entity.id, existing);
      } else {
        const row = Math.floor(index / cols);
        const col = index % cols;
        positions.set(entity.id, {
          x: 100 + col * NODE_SPACING_X,
          y: maxY + NODE_SPACING_Y * 2 + row * NODE_SPACING_Y,
        });
      }
    });
  }

  return positions;
}

/**
 * 증분 레이아웃: 새 노드만 위치 계산
 * 기존 노드 위치는 최대한 유지하면서 새 노드만 적절히 배치
 */
function calculateIncrementalLayout(
  entities: GraphEntity[],
  relations: GraphRelation[],
  existingPositions: Map<string, { x: number; y: number }>,
  newEntityIds: Set<string>
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  // 기존 노드 위치 복사
  entities.forEach((entity) => {
    const existing = existingPositions.get(entity.id);
    if (existing && !newEntityIds.has(entity.id)) {
      positions.set(entity.id, { ...existing });
    }
  });

  // 새 노드 위치 계산
  const newEntities = entities.filter((e) => newEntityIds.has(e.id));
  
  newEntities.forEach((newEntity) => {
    // 연결된 기존 노드 찾기
    const connectedRelations = relations.filter(
      (r) => r.source === newEntity.id || r.target === newEntity.id
    );
    
    if (connectedRelations.length > 0) {
      // 연결된 노드들의 평균 위치 근처에 배치
      let sumX = 0, sumY = 0, count = 0;
      
      connectedRelations.forEach((rel) => {
        const otherId = rel.source === newEntity.id ? rel.target : rel.source;
        const otherPos = positions.get(otherId);
        if (otherPos) {
          sumX += otherPos.x;
          sumY += otherPos.y;
          count++;
        }
      });
      
      if (count > 0) {
        // 평균 위치에서 약간 오프셋
        const avgX = sumX / count;
        const avgY = sumY / count;
        const angle = Math.random() * Math.PI * 2;
        const distance = NODE_SPACING_X * 0.8;
        
        positions.set(newEntity.id, {
          x: avgX + Math.cos(angle) * distance,
          y: avgY + Math.sin(angle) * distance,
        });
      } else {
        // 연결된 노드가 아직 위치가 없으면 기본 위치
        positions.set(newEntity.id, { x: 400, y: 300 });
      }
    } else {
      // 연결이 없는 새 노드는 우측 하단에 배치
      let maxX = 0, maxY = 0;
      positions.forEach((pos) => {
        maxX = Math.max(maxX, pos.x);
        maxY = Math.max(maxY, pos.y);
      });
      
      positions.set(newEntity.id, {
        x: maxX + NODE_SPACING_X,
        y: maxY > 0 ? maxY : 300,
      });
    }
  });

  // 충돌 해결: 새 노드가 기존 노드와 겹치면 이동
  newEntities.forEach((newEntity) => {
    const newPos = positions.get(newEntity.id)!;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      let hasCollision = false;
      
      for (const [otherId, otherPos] of positions) {
        if (otherId === newEntity.id) continue;
        
        const dx = Math.abs(newPos.x - otherPos.x);
        const dy = Math.abs(newPos.y - otherPos.y);
        
        if (dx < NODE_WIDTH + 20 && dy < NODE_HEIGHT + 20) {
          hasCollision = true;
          // 충돌 시 이동
          const angle = Math.atan2(newPos.y - otherPos.y, newPos.x - otherPos.x);
          newPos.x += Math.cos(angle) * 50;
          newPos.y += Math.sin(angle) * 50;
          break;
        }
      }
      
      if (!hasCollision) break;
      attempts++;
    }
  });

  return positions;
}

/**
 * 엣지 스타일 설정
 * - 연결된 노드 간 거리에 따라 스타일 조정
 * - 겹치는 엣지는 곡선으로 처리
 */
function styleEdges(
  nodes: Node<RFNodeData>[],
  edges: Edge<RFEdgeData>[]
): Edge<RFEdgeData>[] {
  const nodePositions = new Map(nodes.map((n) => [n.id, n.position]));

  // 같은 source-target 쌍의 엣지 그룹화 (양방향 포함)
  const edgePairs = new Map<string, Edge<RFEdgeData>[]>();
  edges.forEach((edge) => {
    const key = [edge.source, edge.target].sort().join('-');
    if (!edgePairs.has(key)) {
      edgePairs.set(key, []);
    }
    edgePairs.get(key)!.push(edge);
  });

  return edges.map((edge) => {
    const sourcePos = nodePositions.get(edge.source);
    const targetPos = nodePositions.get(edge.target);

    if (!sourcePos || !targetPos) return edge;

    // 거리 계산
    const dx = targetPos.x - sourcePos.x;
    const dy = targetPos.y - sourcePos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // 같은 노드 쌍 사이에 여러 엣지가 있는지 확인
    const pairKey = [edge.source, edge.target].sort().join('-');
    const pairEdges = edgePairs.get(pairKey) || [];
    const hasMultipleEdges = pairEdges.length > 1;

    // 먼 거리 또는 다중 엣지인 경우 곡선 사용
    const useCurve = distance > NODE_SPACING_X * 2 || hasMultipleEdges;

    return {
      ...edge,
      type: useCurve ? 'smoothstep' : 'default',
      style: {
        ...edge.style,
        strokeWidth: edge.data?.isNew ? 2 : 1,
      },
    };
  });
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

  // 전체 그래프 상태 설정 (Dagre 레이아웃)
  setGraphState: (state) => {
    const positions = calculateDagreLayout(
      state.entities,
      state.relations,
      new Map()
    );

    const nodes = state.entities.map((entity) => {
      const pos = positions.get(entity.id) || { x: 400, y: 300 };
      return entityToNode(entity, pos);
    });
    const edges = state.relations.map((relation) => relationToEdge(relation));
    const styledEdges = styleEdges(nodes, edges);

    set({ graphState: state, nodes, edges: styledEdges });
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

    const addedIds = new Set(delta.addedEntities.map((e) => e.id));
    const updatedIds = new Set(delta.updatedEntities.map((e) => e.id));

    // 새 엔티티가 있으면 증분 레이아웃, 아니면 기존 위치 유지
    let positions: Map<string, { x: number; y: number }>;
    
    if (addedIds.size > 0 || delta.addedRelations.length > 0) {
      // 새 노드/관계가 있으면 레이아웃 재계산
      if (addedIds.size > 5 || newEntities.length > 20) {
        // 많은 변경이 있으면 전체 Dagre 레이아웃
        positions = calculateDagreLayout(
          newEntities,
          newRelations,
          existingPositions
        );
      } else {
        // 적은 변경이면 증분 레이아웃 (기존 위치 최대한 유지)
        positions = calculateIncrementalLayout(
          newEntities,
          newRelations,
          existingPositions,
          addedIds
        );
      }
    } else {
      // 변경 없으면 기존 위치 유지
      positions = existingPositions;
    }

    const nodes = newEntities.map((entity) => {
      const isNew = addedIds.has(entity.id);
      const isUpdated = updatedIds.has(entity.id);
      const position = positions.get(entity.id) || { x: 400, y: 300 };

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
    const styledEdges = styleEdges(nodes, edges);

    set({ graphState: newState, nodes, edges: styledEdges });

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
          data: e.data ? { ...e.data, isNew: false } : e.data,
        })) as Edge<RFEdgeData>[],
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
    set((state) => {
      // 중복 체크: 이미 동일한 segmentId가 있으면 추가하지 않음
      const exists = state.transcripts.some((t) => t.id === payload.segmentId);
      if (exists) {
        return { currentPartialText: '' };
      }
      return {
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
      };
    });
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
