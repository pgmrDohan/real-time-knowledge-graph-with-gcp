import { useEffect } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { TitleBar } from './components/TitleBar';
import { ControlPanel } from './components/ControlPanel';
import { KnowledgeGraph } from './components/KnowledgeGraph';
import { TranscriptPanel } from './components/TranscriptPanel';
import { StatusBar } from './components/StatusBar';
import { FeedbackDialog } from './components/FeedbackDialog';
import { TranslateDialog } from './components/TranslateDialog';
import { ExportDialog } from './components/ExportDialog';
import { useWebSocket } from './hooks/useWebSocket';
import { useAudioCapture } from './hooks/useAudioCapture';
import { useGraphStore } from './store/graphStore';
import { useDemoMode } from './demo/useDemoMode';

export function App() {
  // 데모 모드 훅
  const {
    isDemoMode,
    isDemoRunning,
    setDemoMode,
    startDemoCapture,
    stopDemoCapture,
    demoTranslate,
    isConnected: demoIsConnected,
  } = useDemoMode();

  const {
    connect,
    disconnect,
    isConnected: realIsConnected,
    sendAudioChunk,
    startSession,
    endSession,
    submitFeedback,
    translateGraph: realTranslateGraph,
  } = useWebSocket();
  const { isCapturing: realIsCapturing, startCapture, stopCapture, error: captureError } =
    useAudioCapture(sendAudioChunk);

  // 데모 모드에 따라 상태 선택
  const isConnected = isDemoMode ? demoIsConnected : realIsConnected;
  const isCapturing = isDemoMode ? isDemoRunning : realIsCapturing;

  const processingStage = useGraphStore((state) => state.processingStage);
  const showFeedbackDialog = useGraphStore((state) => state.showFeedbackDialog);
  const feedbackRequest = useGraphStore((state) => state.feedbackRequest);
  const setShowFeedbackDialog = useGraphStore(
    (state) => state.setShowFeedbackDialog
  );
  const setFeedbackRequest = useGraphStore((state) => state.setFeedbackRequest);
  const resetGraph = useGraphStore((state) => state.resetGraph);
  
  // 번역 관련 상태
  const showTranslateDialog = useGraphStore((state) => state.showTranslateDialog);
  const setShowTranslateDialog = useGraphStore((state) => state.setShowTranslateDialog);
  const isTranslating = useGraphStore((state) => state.isTranslating);
  const setIsTranslating = useGraphStore((state) => state.setIsTranslating);
  const graphState = useGraphStore((state) => state.graphState);
  
  // 내보내기 관련 상태
  const showExportDialog = useGraphStore((state) => state.showExportDialog);
  const setShowExportDialog = useGraphStore((state) => state.setShowExportDialog);

  // 컴포넌트 마운트 시 WebSocket 연결 (데모 모드가 아닐 때만)
  useEffect(() => {
    if (!isDemoMode) {
      connect();
      return () => {
        disconnect();
      };
    }
  }, [connect, disconnect, isDemoMode]);

  // 키보드 단축키로 데모 모드 토글 (Ctrl+Shift+D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setDemoMode(!isDemoMode);
        console.log(`[Demo Mode] ${!isDemoMode ? 'Enabled' : 'Disabled'}`);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDemoMode, setDemoMode]);

  // 세션이 완료된 상태인지 (그래프가 있고, 캡처 중이 아닌 상태)
  const hasGraphData = graphState && (graphState.entities.length > 0 || graphState.relations.length > 0);
  const isSessionComplete = !isCapturing && hasGraphData;

  const handleToggleCapture = async () => {
    if (isDemoMode) {
      // 데모 모드: 가짜 캡처
      if (isDemoRunning) {
        stopDemoCapture();
      } else {
        startDemoCapture();
      }
    } else {
      // 실제 모드
      if (isCapturing) {
        // 캡처 중지: 세션만 종료하고 그래프는 유지
        stopCapture();
        endSession(false);  // clearSession=false → 그래프 유지
      } else {
        // 새로 시작: 기존 그래프가 있으면 초기화
        if (hasGraphData) {
          endSession(true);  // 서버 세션 클리어
          resetGraph();      // 클라이언트 그래프 초기화
        }
        await startCapture();
        // 세션 시작 메시지 전송
        startSession();
      }
    }
  };

  const handleFeedbackSubmit = (rating: number, comment: string | null) => {
    submitFeedback(rating, comment);
    setShowFeedbackDialog(false);
    setFeedbackRequest(null);
  };

  const handleFeedbackClose = () => {
    setShowFeedbackDialog(false);
    setFeedbackRequest(null);
  };

  const handleTranslate = (targetLanguage: string) => {
    if (isDemoMode) {
      // 데모 모드: 가짜 번역
      demoTranslate(targetLanguage);
    } else {
      // 실제 모드
      setIsTranslating(true);
      realTranslateGraph(targetLanguage);
    }
  };

  const handleTranslateClose = () => {
    setShowTranslateDialog(false);
  };

  const handleExportClose = () => {
    setShowExportDialog(false);
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
            isSessionComplete={isSessionComplete}
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

      {/* 피드백 다이얼로그 */}
      <FeedbackDialog
        isOpen={showFeedbackDialog}
        onClose={handleFeedbackClose}
        onSubmit={handleFeedbackSubmit}
        sessionInfo={feedbackRequest}
      />

      {/* 번역 다이얼로그 */}
      <TranslateDialog
        isOpen={showTranslateDialog}
        onClose={handleTranslateClose}
        onTranslate={handleTranslate}
        isTranslating={isTranslating}
        graphInfo={{
          entitiesCount: graphState?.entities.length || 0,
          relationsCount: graphState?.relations.length || 0,
        }}
      />

      {/* 내보내기 다이얼로그 */}
      <ExportDialog
        isOpen={showExportDialog}
        onClose={handleExportClose}
        graphInfo={{
          entitiesCount: graphState?.entities.length || 0,
          relationsCount: graphState?.relations.length || 0,
        }}
        graphData={graphState ? {
          entities: graphState.entities.map(e => ({ id: e.id, label: e.label, type: e.type })),
          relations: graphState.relations.map(r => ({ id: r.id, source: r.source, target: r.target, relation: r.relation })),
        } : null}
      />
    </div>
  );
}
