import { useEffect } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { TitleBar } from './components/TitleBar';
import { ControlPanel } from './components/ControlPanel';
import { KnowledgeGraph } from './components/KnowledgeGraph';
import { TranscriptPanel } from './components/TranscriptPanel';
import { StatusBar } from './components/StatusBar';
import { useWebSocket } from './hooks/useWebSocket';
import { useAudioCapture } from './hooks/useAudioCapture';
import { useGraphStore } from './store/graphStore';

export function App() {
  const { connect, disconnect, isConnected, sendAudioChunk } = useWebSocket();
  const { isCapturing, startCapture, stopCapture, error: captureError } = useAudioCapture(sendAudioChunk);
  const processingStage = useGraphStore((state) => state.processingStage);

  // 컴포넌트 마운트 시 WebSocket 연결
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  const handleToggleCapture = async () => {
    if (isCapturing) {
      stopCapture();
    } else {
      await startCapture();
    }
  };

  return (
    <div className="flex flex-col h-screen gradient-bg">
      {/* 타이틀 바 */}
      <TitleBar />

      {/* 메인 콘텐츠 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 좌측: 컨트롤 + 트랜스크립트 */}
        <aside className="w-80 flex flex-col border-r border-surface-700">
          <ControlPanel
            isConnected={isConnected}
            isCapturing={isCapturing}
            onToggleCapture={handleToggleCapture}
          />
          <TranscriptPanel />
        </aside>

        {/* 메인: 지식 그래프 */}
        <main className="flex-1 relative">
          <ReactFlowProvider>
            <KnowledgeGraph />
          </ReactFlowProvider>
        </main>
      </div>

      {/* 상태 바 */}
      <StatusBar
        isConnected={isConnected}
        isCapturing={isCapturing}
        processingStage={processingStage}
      />
    </div>
  );
}


