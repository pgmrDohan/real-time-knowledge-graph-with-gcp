/**
 * 지식 그래프 시각화
 * React Flow 기반 인터랙티브 그래프
 */

import { useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  addEdge,
  BackgroundVariant,
  Node,
  NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useGraphStore } from '../store/graphStore';
import { EntityNode } from './EntityNode';
import { Network } from 'lucide-react';

// 커스텀 노드 타입
const nodeTypes: NodeTypes = {
  entityNode: EntityNode,
};

export function KnowledgeGraph() {
  const storeNodes = useGraphStore((state) => state.nodes);
  const storeEdges = useGraphStore((state) => state.edges);

  // React Flow 상태 (store와 동기화)
  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);

  // store 변경 시 로컬 상태 업데이트
  useMemo(() => {
    setNodes(storeNodes);
  }, [storeNodes, setNodes]);

  useMemo(() => {
    setEdges(storeEdges);
  }, [storeEdges, setEdges]);

  // 엣지 연결 (수동 추가 시)
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges]
  );

  const isEmpty = nodes.length === 0;

  return (
    <div className="w-full h-full relative">
      {isEmpty ? (
        // 빈 상태
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
          <div className="relative mb-4">
            <Network size={64} className="opacity-30" />
            <div className="absolute inset-0 animate-ping">
              <Network size={64} className="opacity-10" />
            </div>
          </div>
          <h3 className="text-lg font-medium mb-2">그래프가 비어있습니다</h3>
          <p className="text-sm text-center max-w-md leading-relaxed">
            오디오 캡처를 시작하면 실시간으로 추출된<br />
            엔티티와 관계가 여기에 표시됩니다.
          </p>
        </div>
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'smoothstep',
            style: { stroke: '#4a5568', strokeWidth: 1 },
          }}
          proOptions={{ hideAttribution: true }}
        >
          {/* 배경 그리드 */}
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#252530"
          />

          {/* 줌/팬 컨트롤 */}
          <Controls
            className="!bg-surface-800 !border-surface-600 !shadow-lg"
            showInteractive={false}
          />

          {/* 미니맵 */}
          <MiniMap
            className="!bg-surface-800 !border-surface-600"
            nodeColor={(node) => {
              const entityColor = (node.style as Record<string, string>)?.[
                '--entity-color'
              ];
              return entityColor || '#4a5568';
            }}
            maskColor="rgba(10, 10, 15, 0.8)"
          />
        </ReactFlow>
      )}

      {/* 통계 오버레이 */}
      {!isEmpty && (
        <div className="absolute top-4 right-4 bg-surface-800/90 backdrop-blur-sm rounded-lg p-3 border border-surface-600">
          <div className="text-xs text-gray-400 space-y-1">
            <div className="flex justify-between gap-4">
              <span>노드</span>
              <span className="text-neon-cyan font-mono">{nodes.length}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>관계</span>
              <span className="text-neon-magenta font-mono">{edges.length}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



