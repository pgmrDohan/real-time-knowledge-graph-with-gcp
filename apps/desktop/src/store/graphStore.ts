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

interface TranslateResult {
  entities: Array<{ id: string; label: string; type: string }>;
  relations: Array<{ source: string; target: string; relation: string }>;
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

  // 번역
  showTranslateDialog: boolean;
  isTranslating: boolean;

  // 내보내기
  showExportDialog: boolean;

  // 액션
  setGraphState: (state: GraphState) => void;
  applyDelta: (delta: GraphDelta) => void;
  setProcessingStage: (stage: ProcessingStage) => void;
  addPartialSTT: (payload: STTPartialPayload) => void;
  addFinalSTT: (payload: STTFinalPayload) => void;
  clearTranscripts: () => void;
  resetGraph: () => void;
  reorganizeGraph: () => void;
  setShowFeedbackDialog: (show: boolean) => void;
  setFeedbackRequest: (request: FeedbackRequest | null) => void;
  setShowTranslateDialog: (show: boolean) => void;
  setIsTranslating: (isTranslating: boolean) => void;
  applyTranslation: (result: TranslateResult) => void;
  setShowExportDialog: (show: boolean) => void;
}

/**
 * 연결된 컴포넌트(클러스터) 찾기
 */
function findConnectedComponents(
  entities: GraphEntity[],
  relations: GraphRelation[]
): GraphEntity[][] {
  const entityIds = new Set(entities.map(e => e.id));
  const adjacency = new Map<string, Set<string>>();
  
  // 인접 리스트 생성
  entities.forEach(e => adjacency.set(e.id, new Set()));
  relations.forEach(r => {
    if (entityIds.has(r.source) && entityIds.has(r.target)) {
      adjacency.get(r.source)?.add(r.target);
      adjacency.get(r.target)?.add(r.source);
    }
  });
  
  const visited = new Set<string>();
  const components: GraphEntity[][] = [];
  
  // BFS로 연결된 컴포넌트 찾기
  entities.forEach(entity => {
    if (visited.has(entity.id)) return;
    
    const component: GraphEntity[] = [];
    const queue = [entity.id];
    
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      
      visited.add(nodeId);
      const node = entities.find(e => e.id === nodeId);
      if (node) component.push(node);
      
      adjacency.get(nodeId)?.forEach(neighbor => {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      });
    }
    
    if (component.length > 0) {
      components.push(component);
    }
  });
  
  // 크기 순으로 정렬 (큰 컴포넌트 먼저)
  return components.sort((a, b) => b.length - a.length);
}

/**
 * 클러스터 기반 균형 레이아웃
 * - 연결된 컴포넌트별로 dagre 적용
 * - 컴포넌트들을 그리드 형태로 배치
 * - 가로/세로 비율 유지
 */
function calculateDagreLayout(
  entities: GraphEntity[],
  relations: GraphRelation[],
  existingPositions: Map<string, { x: number; y: number }>
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  
  if (entities.length === 0) {
    return positions;
  }

  // 연결된 컴포넌트 찾기
  const components = findConnectedComponents(entities, relations);
  
  // 각 컴포넌트의 레이아웃 계산
  const componentLayouts: Array<{
    positions: Map<string, { x: number; y: number }>;
    width: number;
    height: number;
    entities: GraphEntity[];
  }> = [];
  
  // 고립 노드(크기 1)와 연결된 컴포넌트 분리
  const isolatedNodes: GraphEntity[] = [];
  const connectedComponents: GraphEntity[][] = [];
  
  components.forEach(component => {
    if (component.length === 1) {
      isolatedNodes.push(component[0]);
    } else {
      connectedComponents.push(component);
    }
  });
  
  // 연결된 컴포넌트들 레이아웃 계산
  connectedComponents.forEach(component => {
    // 해당 컴포넌트의 관계만 필터링
    const componentIds = new Set(component.map(e => e.id));
    const componentRelations = relations.filter(
      r => componentIds.has(r.source) && componentIds.has(r.target)
    );
    
    // 컴포넌트 크기에 따라 레이아웃 방향 결정
    // 작은 컴포넌트는 가로, 큰 컴포넌트는 랜덤하게 방향 변경
    const direction = component.length > 5 ? (component.length % 2 === 0 ? 'LR' : 'TB') : 'LR';
    
    const layout = calculateSingleComponentLayout(
      component, 
      componentRelations, 
      existingPositions,
      direction as 'TB' | 'LR'
    );
    
    componentLayouts.push(layout);
  });
  
  // 컴포넌트들을 그리드 형태로 배치
  arrangeComponentsInGrid(componentLayouts, positions, existingPositions);
  
  // 고립 노드들은 오른쪽 영역에 별도 배치
  arrangeIsolatedNodes(isolatedNodes, positions, existingPositions);
  
  // 긴 엣지 최소화를 위한 후처리
  optimizeLongEdges(positions, relations);
  
  return positions;
}

/**
 * 단일 컴포넌트 레이아웃 계산
 */
function calculateSingleComponentLayout(
  entities: GraphEntity[],
  relations: GraphRelation[],
  existingPositions: Map<string, { x: number; y: number }>,
  direction: 'TB' | 'LR'
): {
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
  entities: GraphEntity[];
} {
  const positions = new Map<string, { x: number; y: number }>();
  
  if (entities.length === 1) {
    // 단일 노드는 그냥 배치
    const existing = existingPositions.get(entities[0].id);
    positions.set(entities[0].id, existing || { x: 0, y: 0 });
    return { positions, width: NODE_WIDTH, height: NODE_HEIGHT, entities };
  }
  
  // Dagre 그래프 생성
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: NODE_SPACING_X * 0.8,  // 약간 조밀하게
    ranksep: NODE_SPACING_Y * 0.8,
    marginx: 30,
    marginy: 30,
    ranker: 'tight-tree',  // 더 컴팩트한 레이아웃
  });
  g.setDefaultEdgeLabel(() => ({}));

  // 노드 추가
  entities.forEach((entity) => {
    g.setNode(entity.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  });

  // 엣지 추가
  relations.forEach((relation) => {
    if (g.hasNode(relation.source) && g.hasNode(relation.target)) {
      g.setEdge(relation.source, relation.target);
    }
  });

  // 레이아웃 계산
  dagre.layout(g);

  // 결과 추출 및 경계 계산
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  g.nodes().forEach((nodeId) => {
    const node = g.node(nodeId);
    if (node) {
      positions.set(nodeId, { x: node.x, y: node.y });
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    }
  });
  
  // 원점 기준으로 정규화
  positions.forEach((pos, id) => {
    positions.set(id, {
      x: pos.x - minX,
      y: pos.y - minY,
    });
  });
  
  const width = maxX - minX + NODE_WIDTH;
  const height = maxY - minY + NODE_HEIGHT;
  
  return { positions, width, height, entities };
}

/**
 * 컴포넌트들을 그리드 형태로 배치
 * 가로/세로 비율을 유지하면서 균형있게 배치
 */
function arrangeComponentsInGrid(
  componentLayouts: Array<{
    positions: Map<string, { x: number; y: number }>;
    width: number;
    height: number;
    entities: GraphEntity[];
  }>,
  finalPositions: Map<string, { x: number; y: number }>,
  existingPositions: Map<string, { x: number; y: number }>
): void {
  if (componentLayouts.length === 0) return;
  
  // 목표 가로/세로 비율 (16:9에 가깝게)
  const targetAspectRatio = 1.5;
  
  // 총 면적 계산
  let totalArea = 0;
  componentLayouts.forEach(layout => {
    totalArea += (layout.width + NODE_SPACING_X) * (layout.height + NODE_SPACING_Y);
  });
  
  // 목표 영역 크기 계산
  const targetHeight = Math.sqrt(totalArea / targetAspectRatio);
  const targetWidth = targetHeight * targetAspectRatio;
  
  // 그리드 열 수 결정 (2-4열)
  const cols = Math.max(2, Math.min(4, Math.ceil(Math.sqrt(componentLayouts.length))));
  
  // 각 열의 현재 Y 위치
  const columnHeights = new Array(cols).fill(0);
  const columnX: number[] = [];
  
  // 열 X 위치 계산
  let currentX = 0;
  for (let i = 0; i < cols; i++) {
    columnX.push(currentX);
    currentX += targetWidth / cols + NODE_SPACING_X;
  }
  
  // 컴포넌트들을 열에 배치 (가장 낮은 열에 배치)
  componentLayouts.forEach((layout) => {
    // 가장 낮은 열 찾기
    let minColIdx = 0;
    let minHeight = columnHeights[0];
    for (let i = 1; i < cols; i++) {
      if (columnHeights[i] < minHeight) {
        minHeight = columnHeights[i];
        minColIdx = i;
      }
    }
    
    const offsetX = columnX[minColIdx];
    const offsetY = columnHeights[minColIdx];
    
    // 컴포넌트 내 노드들 배치
    layout.positions.forEach((pos, entityId) => {
      const existing = existingPositions.get(entityId);
      const newPos = {
        x: pos.x + offsetX,
        y: pos.y + offsetY,
      };
      
      // 기존 위치가 있으면 부드럽게 이동
      if (existing) {
        finalPositions.set(entityId, {
          x: existing.x * 0.3 + newPos.x * 0.7,
          y: existing.y * 0.3 + newPos.y * 0.7,
        });
      } else {
        finalPositions.set(entityId, newPos);
      }
    });
    
    // 열 높이 업데이트
    columnHeights[minColIdx] += layout.height + NODE_SPACING_Y * 1.5;
  });
}

/**
 * 고립 노드 배치 (연결이 없는 노드)
 * 연결된 그래프와 별도로 오른쪽 영역에 그리드 형태로 배치
 */
function arrangeIsolatedNodes(
  isolatedNodes: GraphEntity[],
  positions: Map<string, { x: number; y: number }>,
  existingPositions: Map<string, { x: number; y: number }>
): void {
  if (isolatedNodes.length === 0) return;
  
  // 기존 노드들의 경계 찾기
  let maxX = 0;
  positions.forEach((pos) => {
    maxX = Math.max(maxX, pos.x);
  });
  
  // 고립 노드들을 정사각형에 가까운 그리드로 배치
  const cols = Math.ceil(Math.sqrt(isolatedNodes.length));
  const startX = maxX + NODE_SPACING_X * 2;  // 기존 그래프 오른쪽에 배치
  
  isolatedNodes.forEach((entity, index) => {
    const existing = existingPositions.get(entity.id);
    if (existing) {
      // 기존 위치 유지
      positions.set(entity.id, existing);
    } else {
      const row = Math.floor(index / cols);
      const col = index % cols;
      positions.set(entity.id, {
        x: startX + col * (NODE_WIDTH + NODE_SPACING_X * 0.5),
        y: row * (NODE_HEIGHT + NODE_SPACING_Y * 0.5),
      });
    }
  });
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
 * 노드 간 상대 위치에 따라 최적의 핸들 위치 계산
 * 선이 보기 좋게 연결되도록 상하좌우 중 최적 위치 선정
 */
function calculateOptimalHandles(
  sourcePos: { x: number; y: number },
  targetPos: { x: number; y: number }
): { sourceHandle: string; targetHandle: string } {
  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // 수평 방향이 더 지배적인 경우
  if (absDx > absDy * 0.5) {
    if (dx > 0) {
      // target이 오른쪽에 있음
      return { sourceHandle: 'right', targetHandle: 'left' };
    } else {
      // target이 왼쪽에 있음
      return { sourceHandle: 'left', targetHandle: 'right' };
    }
  }
  // 수직 방향이 더 지배적인 경우
  else {
    if (dy > 0) {
      // target이 아래에 있음
      return { sourceHandle: 'bottom', targetHandle: 'top' };
    } else {
      // target이 위에 있음
      return { sourceHandle: 'top', targetHandle: 'bottom' };
    }
  }
}

/**
 * 엣지 스타일 설정 (개선된 버전)
 * - 모든 엣지를 부드러운 곡선으로 처리
 * - 노드 간 상대 위치에 따라 최적의 핸들 위치 계산
 */
function styleEdges(
  nodes: Node<RFNodeData>[],
  edges: Edge<RFEdgeData>[]
): Edge<RFEdgeData>[] {
  const nodePositions = new Map(nodes.map((n) => [n.id, n.position]));

  return edges.map((edge) => {
    const sourcePos = nodePositions.get(edge.source);
    const targetPos = nodePositions.get(edge.target);

    if (!sourcePos || !targetPos) return edge;

    // 최적의 핸들 위치 계산
    const { sourceHandle, targetHandle } = calculateOptimalHandles(sourcePos, targetPos);

    return {
      ...edge,
      type: 'default', // 부드러운 곡선 (React Flow의 default가 bezier)
      sourceHandle,
      targetHandle,
      style: {
        ...edge.style,
        strokeWidth: edge.data?.isNew ? 2 : 1,
      },
    };
  });
}

/**
 * 긴 엣지 최소화를 위한 레이아웃 후처리
 * 연결된 노드들이 너무 멀리 떨어져 있으면 더 가깝게 조정
 */
function optimizeLongEdges(
  positions: Map<string, { x: number; y: number }>,
  relations: GraphRelation[],
  maxEdgeLength: number = NODE_SPACING_X * 3
): void {
  const MAX_ITERATIONS = 5;
  
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let adjusted = false;
    
    for (const relation of relations) {
      const sourcePos = positions.get(relation.source);
      const targetPos = positions.get(relation.target);
      
      if (!sourcePos || !targetPos) continue;
      
      const dx = targetPos.x - sourcePos.x;
      const dy = targetPos.y - sourcePos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // 엣지가 너무 길면 조정
      if (distance > maxEdgeLength) {
        // 중점 방향으로 양쪽 노드를 20%씩 이동
        const ratio = 0.2;
        const midX = (sourcePos.x + targetPos.x) / 2;
        const midY = (sourcePos.y + targetPos.y) / 2;
        
        // source를 중점 방향으로 이동
        sourcePos.x = sourcePos.x + (midX - sourcePos.x) * ratio;
        sourcePos.y = sourcePos.y + (midY - sourcePos.y) * ratio;
        
        // target을 중점 방향으로 이동
        targetPos.x = targetPos.x + (midX - targetPos.x) * ratio;
        targetPos.y = targetPos.y + (midY - targetPos.y) * ratio;
        
        adjusted = true;
      }
    }
    
    // 더 이상 조정할 것이 없으면 종료
    if (!adjusted) break;
  }
  
  // 노드 간 겹침 해결
  resolveNodeOverlaps(positions);
}

/**
 * 노드 겹침 해결
 */
function resolveNodeOverlaps(
  positions: Map<string, { x: number; y: number }>
): void {
  const posArray = Array.from(positions.entries());
  const minDistanceX = NODE_WIDTH + 30;
  const minDistanceY = NODE_HEIGHT + 20;
  
  for (let i = 0; i < posArray.length; i++) {
    for (let j = i + 1; j < posArray.length; j++) {
      const [, pos1] = posArray[i];
      const [, pos2] = posArray[j];
      
      const dx = Math.abs(pos2.x - pos1.x);
      const dy = Math.abs(pos2.y - pos1.y);
      
      // 겹치는 경우
      if (dx < minDistanceX && dy < minDistanceY) {
        // 밀어내기
        const pushX = (minDistanceX - dx) / 2 + 10;
        const pushY = (minDistanceY - dy) / 2 + 10;
        
        if (pos1.x < pos2.x) {
          pos1.x -= pushX;
          pos2.x += pushX;
        } else {
          pos1.x += pushX;
          pos2.x -= pushX;
        }
        
        if (pos1.y < pos2.y) {
          pos1.y -= pushY;
          pos2.y += pushY;
        } else {
          pos1.y += pushY;
          pos2.y -= pushY;
        }
      }
    }
  }
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
    type: 'default', // 부드러운 곡선 (React Flow의 default가 bezier)
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
  showTranslateDialog: false,
  isTranslating: false,
  showExportDialog: false,

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

  // 그래프 레이아웃 재정렬 (Dagre 알고리즘 재실행)
  reorganizeGraph: () => {
    const currentState = get().graphState;
    if (!currentState || currentState.entities.length === 0) return;

    // Dagre 레이아웃 새로 계산 (기존 위치 무시)
    const positions = calculateDagreLayout(
      currentState.entities,
      currentState.relations,
      new Map() // 빈 맵 전달 → 기존 위치 무시하고 완전히 새로 계산
    );

    const nodes = currentState.entities.map((entity) => {
      const pos = positions.get(entity.id) || { x: 400, y: 300 };
      return entityToNode(entity, pos);
    });
    const edges = currentState.relations.map((relation) => relationToEdge(relation));
    const styledEdges = styleEdges(nodes, edges);

    set({ nodes, edges: styledEdges });
  },

  // 피드백 다이얼로그 표시
  setShowFeedbackDialog: (show) => set({ showFeedbackDialog: show }),

  // 피드백 요청 설정
  setFeedbackRequest: (request) =>
    set({
      feedbackRequest: request,
      showFeedbackDialog: request !== null,
    }),

  // 번역 다이얼로그 표시
  setShowTranslateDialog: (show) => set({ showTranslateDialog: show }),

  // 번역 중 상태 설정
  setIsTranslating: (isTranslating) => set({ isTranslating }),

  // 번역 결과 적용
  applyTranslation: (result) => {
    const currentState = get().graphState;
    if (!currentState) return;

    // 번역된 엔티티 적용
    const translatedEntities = currentState.entities.map((entity) => {
      const translated = result.entities.find((e) => e.id === entity.id);
      return translated
        ? { ...entity, label: translated.label }
        : entity;
    });

    // 번역된 관계 적용
    const translatedRelations = currentState.relations.map((relation) => {
      const translated = result.relations.find(
        (r) => r.source === relation.source && r.target === relation.target
      );
      return translated
        ? { ...relation, relation: translated.relation }
        : relation;
    });

    // 기존 노드 위치 유지
    const existingPositions = new Map(
      get().nodes.map((n) => [n.id, n.position])
    );

    // 새 상태 적용
    const newState = {
      ...currentState,
      entities: translatedEntities,
      relations: translatedRelations,
    };

    // 노드/엣지 재생성 (위치 유지)
    const nodes = translatedEntities.map((entity) => {
      const pos = existingPositions.get(entity.id) || { x: 400, y: 300 };
      return entityToNode(entity, pos);
    });
    const edges = translatedRelations.map((relation) => relationToEdge(relation));
    const styledEdges = styleEdges(nodes, edges);

    set({
      graphState: newState,
      nodes,
      edges: styledEdges,
      isTranslating: false,
      showTranslateDialog: false,
    });
  },

  // 내보내기 다이얼로그 표시
  setShowExportDialog: (show) => set({ showExportDialog: show }),
}));
