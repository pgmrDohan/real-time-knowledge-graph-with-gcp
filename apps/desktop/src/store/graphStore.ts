/**
 * Zustand 기반 그래프 상태 관리
 * d3-force 기반 자동 레이아웃 + 무한 캔버스
 */

import { create } from 'zustand';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceCenter,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
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
const NODE_WIDTH = 150;
const NODE_HEIGHT = 60;

// d3-force 레이아웃 파라미터
const FORCE_CONFIG = {
  // 연결된 노드 간 이상적인 거리
  linkDistance: 250,
  // 연결 강도 (0~1, 낮을수록 유연)
  linkStrength: 0.4,
  // 반발력 강도 (음수: 반발, 양수: 인력)
  chargeStrength: -1500,
  // 최대 반발 거리
  chargeDistanceMax: 800,
  // 충돌 반경 (노드 크기 기반)
  collideRadius: Math.max(NODE_WIDTH, NODE_HEIGHT) * 1.2,
  // 충돌 강도
  collideStrength: 1.0,
  // 시뮬레이션 반복 횟수
  iterations: 400,
  // 중심 좌표
  centerX: 400,
  centerY: 300,
};

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

// d3-force 시뮬레이션용 노드 타입
interface ForceNode extends SimulationNodeDatum {
  id: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

// d3-force 시뮬레이션용 링크 타입
interface ForceLink extends SimulationLinkDatum<ForceNode> {
  source: string | ForceNode;
  target: string | ForceNode;
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
 * d3-force 기반 레이아웃 계산
 * - 자동으로 노드 겹침 방지
 * - 연결된 노드들을 적절한 거리로 유지
 * - 전체 그래프를 컴팩트하게 배치
 */
function calculateForceLayout(
  entities: GraphEntity[],
  relations: GraphRelation[],
  existingPositions: Map<string, { x: number; y: number }>
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  
  if (entities.length === 0) {
    return positions;
  }

  // 단일 노드는 중앙에 배치
  if (entities.length === 1) {
    positions.set(entities[0].id, { 
      x: FORCE_CONFIG.centerX, 
      y: FORCE_CONFIG.centerY 
    });
    return positions;
  }

  // 연결된 컴포넌트 찾기
  const components = findConnectedComponents(entities, relations);
  
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
  
  // 각 연결된 컴포넌트에 대해 d3-force 시뮬레이션 실행
  const componentResults: Array<{
    positions: Map<string, { x: number; y: number }>;
    width: number;
    height: number;
  }> = [];
  
  connectedComponents.forEach((component) => {
    const componentIds = new Set(component.map(e => e.id));
    const componentRelations = relations.filter(
      r => componentIds.has(r.source) && componentIds.has(r.target)
    );
    
    const result = runForceSimulation(component, componentRelations, existingPositions);
    componentResults.push(result);
  });
  
  // 컴포넌트들을 그리드 형태로 배치
  arrangeComponentsInGrid(componentResults, positions);
  
  // 고립 노드들을 별도로 배치
  arrangeIsolatedNodes(isolatedNodes, positions);
  
  // 전체 중앙 정렬
  centerAllPositions(positions);
  
  return positions;
}

// 호환성을 위한 alias
const calculateDagreLayout = calculateForceLayout;

/**
 * d3-force 시뮬레이션 실행
 * - 허브 노드(연결 많은 노드)를 중심에 배치
 * - 결정적(deterministic) 초기화로 일관된 결과
 */
function runForceSimulation(
  entities: GraphEntity[],
  relations: GraphRelation[],
  existingPositions: Map<string, { x: number; y: number }>
): {
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
} {
  const positions = new Map<string, { x: number; y: number }>();
  
  // 각 노드의 연결 수(degree) 계산
  const degrees = new Map<string, number>();
  entities.forEach(e => degrees.set(e.id, 0));
  relations.forEach(r => {
    degrees.set(r.source, (degrees.get(r.source) || 0) + 1);
    degrees.set(r.target, (degrees.get(r.target) || 0) + 1);
  });
  
  // 노드를 degree 순으로 정렬 (허브 노드 먼저)
  const sortedEntities = [...entities].sort((a, b) => {
    return (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0);
  });
  
  // 노드 수에 따라 파라미터 조정
  const nodeCount = entities.length;
  const scaleFactor = Math.max(0.6, Math.min(1.0, 20 / nodeCount));
  
  // 초기 반경 계산 (노드 수에 비례)
  const baseRadius = Math.sqrt(nodeCount) * FORCE_CONFIG.linkDistance * 0.4;
  
  // 결정적 초기 위치 계산 (허브 중심, 나선형 배치)
  const initialPositions = new Map<string, { x: number; y: number }>();
  
  sortedEntities.forEach((entity, index) => {
    const existing = existingPositions.get(entity.id);
    if (existing) {
      initialPositions.set(entity.id, existing);
    } else {
      // 나선형 배치 (황금각 사용으로 균등 분포)
      const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~137.5도
      const angle = index * goldenAngle;
      const radius = baseRadius * Math.sqrt(index / nodeCount);
      
      initialPositions.set(entity.id, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    }
  });
  
  // 시뮬레이션용 노드 생성
  const nodes: ForceNode[] = entities.map((entity) => {
    const pos = initialPositions.get(entity.id)!;
    return {
      id: entity.id,
      x: pos.x,
      y: pos.y,
    };
  });
  
  // 시뮬레이션용 링크 생성
  const links: ForceLink[] = relations.map((rel) => ({
    source: rel.source,
    target: rel.target,
  }));
  
  // 노드 ID로 빠르게 찾기 위한 맵
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  
  // d3-force 시뮬레이션 생성
  const simulation = forceSimulation<ForceNode>(nodes)
    // 연결된 노드 간 거리 유지
    .force('link', forceLink<ForceNode, ForceLink>(links)
      .id(d => d.id)
      .distance((link) => {
        // 허브 노드 연결은 더 긴 거리
        const sourceNode = typeof link.source === 'string' ? nodeMap.get(link.source) : link.source;
        const targetNode = typeof link.target === 'string' ? nodeMap.get(link.target) : link.target;
        if (!sourceNode || !targetNode) return FORCE_CONFIG.linkDistance * scaleFactor;
        
        const sourceDegree = degrees.get(sourceNode.id) || 1;
        const targetDegree = degrees.get(targetNode.id) || 1;
        const maxDegree = Math.max(sourceDegree, targetDegree);
        
        // 허브 노드일수록 연결 거리 증가
        return FORCE_CONFIG.linkDistance * scaleFactor * (1 + maxDegree * 0.1);
      })
      .strength((link) => {
        // 연결이 많은 노드 간에는 링크 강도 감소 (유연하게)
        const sourceNode = typeof link.source === 'string' ? nodeMap.get(link.source) : link.source;
        const targetNode = typeof link.target === 'string' ? nodeMap.get(link.target) : link.target;
        if (!sourceNode || !targetNode) return FORCE_CONFIG.linkStrength;
        
        const sourceDegree = degrees.get(sourceNode.id) || 1;
        const targetDegree = degrees.get(targetNode.id) || 1;
        return FORCE_CONFIG.linkStrength / Math.sqrt(Math.min(sourceDegree, targetDegree));
      })
    )
    // 모든 노드 간 반발력
    .force('charge', forceManyBody<ForceNode>()
      .strength((d) => {
        // 허브 노드는 더 강한 반발력
        const degree = degrees.get(d.id) || 1;
        return FORCE_CONFIG.chargeStrength * scaleFactor * (1 + degree * 0.2);
      })
      .distanceMax(FORCE_CONFIG.chargeDistanceMax)
    )
    // 노드 충돌 방지 (겹침 방지)
    .force('collide', forceCollide<ForceNode>()
      .radius((d) => {
        // 허브 노드는 더 큰 충돌 반경
        const degree = degrees.get(d.id) || 1;
        return FORCE_CONFIG.collideRadius * scaleFactor * (1 + degree * 0.05);
      })
      .strength(FORCE_CONFIG.collideStrength)
      .iterations(4)
    )
    // 수평/수직 분포 (정사각형에 가깝게)
    .force('x', forceX<ForceNode>(0).strength(0.03))
    .force('y', forceY<ForceNode>(0).strength(0.03))
    // 중심으로 모으기
    .force('center', forceCenter<ForceNode>(0, 0));
  
  // 시뮬레이션 실행 (동기적으로)
  simulation.stop();
  for (let i = 0; i < FORCE_CONFIG.iterations; i++) {
    simulation.tick();
  }
  
  // 결과 추출
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  nodes.forEach((node) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    positions.set(node.id, { x, y });
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
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
  
  return { positions, width, height };
}

/**
 * 컴포넌트들을 그리드 형태로 배치
 */
function arrangeComponentsInGrid(
  componentResults: Array<{
    positions: Map<string, { x: number; y: number }>;
    width: number;
    height: number;
  }>,
  finalPositions: Map<string, { x: number; y: number }>
): void {
  if (componentResults.length === 0) return;
  
  // 단일 컴포넌트는 그대로 사용
  if (componentResults.length === 1) {
    componentResults[0].positions.forEach((pos, id) => {
      finalPositions.set(id, pos);
    });
    return;
  }
  
  // 총 면적 계산
  let totalArea = 0;
  componentResults.forEach(result => {
    totalArea += (result.width + 100) * (result.height + 100);
  });
  
  // 정사각형에 가까운 목표 크기
  const targetWidth = Math.sqrt(totalArea) * 1.3;
  
  // 크기 순으로 정렬 (큰 것 먼저)
  const sorted = [...componentResults].sort((a, b) => 
    (b.width * b.height) - (a.width * a.height)
  );
  
  // 행 기반 배치
  let currentX = 0;
  let currentY = 0;
  let rowHeight = 0;
  const gap = 120;
  
  sorted.forEach((result) => {
    // 현재 행에 맞지 않으면 다음 행으로
    if (currentX + result.width > targetWidth && currentX > 0) {
      currentX = 0;
      currentY += rowHeight + gap;
      rowHeight = 0;
    }
    
    // 컴포넌트 배치
    result.positions.forEach((pos, id) => {
      finalPositions.set(id, {
        x: pos.x + currentX,
        y: pos.y + currentY,
      });
    });
    
    currentX += result.width + gap;
    rowHeight = Math.max(rowHeight, result.height);
  });
}

/**
 * 고립 노드들을 그리드로 배치
 */
function arrangeIsolatedNodes(
  isolatedNodes: GraphEntity[],
  positions: Map<string, { x: number; y: number }>
): void {
  if (isolatedNodes.length === 0) return;
  
  // 기존 노드들의 경계 찾기
  let minX = 0, maxX = 0;
  let minY = 0, maxY = 0;
  let hasExisting = false;
  
  positions.forEach((pos) => {
    if (!hasExisting) {
      minX = maxX = pos.x;
      minY = maxY = pos.y;
      hasExisting = true;
    } else {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
    }
  });
  
  // 고립 노드들을 그리드로 배치
  const cols = Math.ceil(Math.sqrt(isolatedNodes.length));
  const startX = hasExisting ? minX : 0;
  const startY = hasExisting ? maxY + 150 : 0;
  const spacing = 180;
  
  isolatedNodes.forEach((entity, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    positions.set(entity.id, {
      x: startX + col * spacing,
      y: startY + row * spacing,
    });
  });
}

/**
 * 전체 위치를 캔버스 중앙으로 정렬
 */
function centerAllPositions(positions: Map<string, { x: number; y: number }>): void {
  if (positions.size === 0) return;
  
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  positions.forEach(pos => {
    minX = Math.min(minX, pos.x);
    maxX = Math.max(maxX, pos.x);
    minY = Math.min(minY, pos.y);
    maxY = Math.max(maxY, pos.y);
  });
  
  const centerX = (maxX + minX) / 2;
  const centerY = (maxY + minY) / 2;
  
  // 캔버스 중심으로 이동
  positions.forEach((pos, id) => {
    positions.set(id, {
      x: pos.x - centerX + FORCE_CONFIG.centerX,
      y: pos.y - centerY + FORCE_CONFIG.centerY,
    });
  });
}

/**
 * 기존 레이아웃 최적화 (정리 버튼용)
 * - 기존 배치를 최대한 유지
 * - 겹치는 노드만 밀어내기
 * - 연결된 노드 간 거리 약간 조정
 */
function optimizeExistingLayout(
  entities: GraphEntity[],
  relations: GraphRelation[],
  existingPositions: Map<string, { x: number; y: number }>
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  
  // 기존 위치 복사
  entities.forEach((entity) => {
    const existing = existingPositions.get(entity.id);
    if (existing) {
      positions.set(entity.id, { ...existing });
    } else {
      positions.set(entity.id, { x: FORCE_CONFIG.centerX, y: FORCE_CONFIG.centerY });
    }
  });
  
  if (entities.length <= 1) {
    return positions;
  }
  
  // 시뮬레이션용 노드 생성 (기존 위치 사용)
  const nodes: ForceNode[] = entities.map((entity) => {
    const pos = positions.get(entity.id)!;
    return {
      id: entity.id,
      x: pos.x,
      y: pos.y,
    };
  });
  
  // 시뮬레이션용 링크 생성
  const links: ForceLink[] = relations.map((rel) => ({
    source: rel.source,
    target: rel.target,
  }));
  
  // 짧은 시뮬레이션으로 겹침만 해결 (기존 배치 최대한 유지)
  const simulation = forceSimulation<ForceNode>(nodes)
    // 연결된 노드 간 거리 (약한 힘으로)
    .force('link', forceLink<ForceNode, ForceLink>(links)
      .id(d => d.id)
      .distance(FORCE_CONFIG.linkDistance * 0.8)
      .strength(0.1)  // 약한 힘으로 기존 배치 유지
    )
    // 약한 반발력 (겹침 방지용)
    .force('charge', forceManyBody<ForceNode>()
      .strength(-200)  // 약한 반발력
      .distanceMax(300)
    )
    // 강한 충돌 방지 (겹침 해결 핵심)
    .force('collide', forceCollide<ForceNode>()
      .radius(FORCE_CONFIG.collideRadius * 1.1)
      .strength(1.0)
      .iterations(5)
    )
    // 중심 유지 (기존 배치의 중심 유지)
    .force('x', forceX<ForceNode>((d) => {
      const existing = existingPositions.get(d.id);
      return existing?.x ?? 0;
    }).strength(0.3))  // 기존 X 위치로 끌어당김
    .force('y', forceY<ForceNode>((d) => {
      const existing = existingPositions.get(d.id);
      return existing?.y ?? 0;
    }).strength(0.3));  // 기존 Y 위치로 끌어당김
  
  // 짧은 시뮬레이션 (겹침 해결에 충분)
  simulation.stop();
  for (let i = 0; i < 150; i++) {
    simulation.tick();
  }
  
  // 결과 추출
  nodes.forEach((node) => {
    positions.set(node.id, { x: node.x ?? 0, y: node.y ?? 0 });
  });
  
  // 중앙 정렬
  centerAllPositions(positions);
  
  return positions;
}

/**
 * 증분 레이아웃: 새 노드만 위치 계산 (d3-force 기반)
 * 기존 노드 위치는 고정하고 새 노드만 힘 기반으로 배치
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

  // 새 노드가 없으면 기존 위치 반환
  if (newEntityIds.size === 0) {
    return positions;
  }

  // 새 노드들의 초기 위치 계산 (연결된 노드 근처)
  const newEntities = entities.filter((e) => newEntityIds.has(e.id));
  
  newEntities.forEach((newEntity) => {
    const connectedRelations = relations.filter(
      (r) => r.source === newEntity.id || r.target === newEntity.id
    );
    
    if (connectedRelations.length > 0) {
      // 연결된 노드들의 평균 위치 계산
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
        // 평균 위치에서 약간 떨어진 곳에 초기 배치
        const avgX = sumX / count;
        const avgY = sumY / count;
        const angle = Math.random() * Math.PI * 2;
        const distance = FORCE_CONFIG.linkDistance * 0.7;
        
        positions.set(newEntity.id, {
          x: avgX + Math.cos(angle) * distance,
          y: avgY + Math.sin(angle) * distance,
        });
      } else {
        positions.set(newEntity.id, { 
          x: FORCE_CONFIG.centerX, 
          y: FORCE_CONFIG.centerY 
        });
      }
    } else {
      // 연결이 없으면 기존 그래프 하단에 배치
      let maxY = FORCE_CONFIG.centerY;
      positions.forEach((pos) => {
        maxY = Math.max(maxY, pos.y);
      });
      
      positions.set(newEntity.id, {
        x: FORCE_CONFIG.centerX + (Math.random() - 0.5) * 100,
        y: maxY + 150,
      });
    }
  });

  // 새 노드에 대해 mini force simulation 실행 (기존 노드는 고정)
  const nodes: ForceNode[] = entities.map((entity) => {
    const pos = positions.get(entity.id) || { x: 0, y: 0 };
    return {
      id: entity.id,
      x: pos.x,
      y: pos.y,
      // 기존 노드는 고정
      fx: newEntityIds.has(entity.id) ? undefined : pos.x,
      fy: newEntityIds.has(entity.id) ? undefined : pos.y,
    };
  });
  
  const links: ForceLink[] = relations.map((rel) => ({
    source: rel.source,
    target: rel.target,
  }));
  
  // 짧은 시뮬레이션으로 새 노드만 조정
  const simulation = forceSimulation<ForceNode>(nodes)
    .force('link', forceLink<ForceNode, ForceLink>(links)
      .id(d => d.id)
      .distance(FORCE_CONFIG.linkDistance * 0.8)
      .strength(0.5)
    )
    .force('charge', forceManyBody<ForceNode>()
      .strength(-400)
      .distanceMax(300)
    )
    .force('collide', forceCollide<ForceNode>()
      .radius(FORCE_CONFIG.collideRadius)
      .strength(1)
      .iterations(2)
    );
  
  simulation.stop();
  for (let i = 0; i < 100; i++) {
    simulation.tick();
  }
  
  // 결과 추출
  nodes.forEach((node) => {
    positions.set(node.id, { x: node.x ?? 0, y: node.y ?? 0 });
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

  // 전체 그래프 상태 설정 (d3-force 레이아웃)
  setGraphState: (state) => {
    const positions = calculateForceLayout(
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
        // 많은 변경이 있으면 전체 d3-force 레이아웃
        positions = calculateForceLayout(
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

  // 그래프 레이아웃 재정렬 (기존 배치 유지하면서 겹침 해결)
  reorganizeGraph: () => {
    const currentState = get().graphState;
    if (!currentState || currentState.entities.length === 0) return;

    // 기존 노드 위치 가져오기
    const currentNodes = get().nodes;
    const existingPositions = new Map(
      currentNodes.map((n) => [n.id, n.position])
    );

    // 기존 위치를 기반으로 겹침만 해결하는 최적화 실행
    const positions = optimizeExistingLayout(
      currentState.entities,
      currentState.relations,
      existingPositions
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
