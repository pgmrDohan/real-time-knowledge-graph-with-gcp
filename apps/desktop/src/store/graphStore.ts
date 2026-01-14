/**
 * Zustand 기반 그래프 상태 관리
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

interface TranscriptEntry {
  id: string;
  text: string;
  isPartial: boolean;
  timestamp: number;
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
  
  // 액션
  setGraphState: (state: GraphState) => void;
  applyDelta: (delta: GraphDelta) => void;
  setProcessingStage: (stage: ProcessingStage) => void;
  addPartialSTT: (payload: STTPartialPayload) => void;
  addFinalSTT: (payload: STTFinalPayload) => void;
  clearTranscripts: () => void;
  resetGraph: () => void;
}

// 노드 위치 계산 (그리드 + 오프셋 레이아웃)
function calculateNodePosition(index: number, total: number): { x: number; y: number } {
  // 그리드 기반 레이아웃 (겹침 방지)
  const cols = Math.ceil(Math.sqrt(total));
  const row = Math.floor(index / cols);
  const col = index % cols;
  
  const cellWidth = 220;  // 노드 간 수평 간격
  const cellHeight = 120; // 노드 간 수직 간격
  const startX = 100;
  const startY = 100;
  
  // 행마다 약간의 오프셋 추가 (지그재그 패턴)
  const offsetX = (row % 2) * (cellWidth / 2);
  
  return {
    x: startX + col * cellWidth + offsetX,
    y: startY + row * cellHeight,
  };
}

// 엔티티를 React Flow 노드로 변환
function entityToNode(
  entity: GraphEntity,
  index: number,
  total: number,
  isNew = false
): Node<RFNodeData> {
  const position = calculateNodePosition(index, total);
  
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
function relationToEdge(
  relation: GraphRelation,
  isNew = false
): Edge<RFEdgeData> {
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

  // 전체 그래프 상태 설정
  setGraphState: (state) => {
    const nodes = state.entities.map((entity, index) =>
      entityToNode(entity, index, state.entities.length)
    );
    const edges = state.relations.map((relation) => relationToEdge(relation));

    set({ graphState: state, nodes, edges });
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
    newEntities = newEntities.filter(
      (e) => !delta.removedEntityIds.includes(e.id)
    );

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

    // 노드/엣지 업데이트 (기존 위치 유지)
    const currentNodes = get().nodes;
    const addedIds = new Set(delta.addedEntities.map((e) => e.id));
    const updatedIds = new Set(delta.updatedEntities.map((e) => e.id));

    const nodes = newEntities.map((entity, index) => {
      const existingNode = currentNodes.find((n) => n.id === entity.id);
      
      if (existingNode && !addedIds.has(entity.id)) {
        // 기존 노드: 위치 유지, 데이터만 업데이트
        return {
          ...existingNode,
          data: {
            entity,
            isNew: false,
            isUpdated: updatedIds.has(entity.id),
          },
        };
      }
      
      // 새 노드
      return entityToNode(entity, index, newEntities.length, true);
    });

    const addedRelationIds = new Set(delta.addedRelations.map((r) => r.id));
    const edges = newRelations.map((relation) =>
      relationToEdge(relation, addedRelationIds.has(relation.id))
    );

    set({ graphState: newState, nodes, edges });

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
}));


