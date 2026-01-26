/**
 * 커스텀 타이틀 바
 * macOS 스타일의 윈도우 컨트롤 + 번역/내보내기 버튼
 */

import { Minus, Square, X, Languages, Download, LayoutGrid } from 'lucide-react';
import { useGraphStore } from '../store/graphStore';

export function TitleBar() {
  const isMac = window.electronAPI?.platform === 'darwin';
  const { graphState, setShowTranslateDialog, setShowExportDialog, reorganizeGraph } = useGraphStore();
  
  const hasGraph = graphState && graphState.entities.length > 0;

  const handleMinimize = () => window.electronAPI?.minimizeWindow();
  const handleMaximize = () => window.electronAPI?.maximizeWindow();
  const handleClose = () => window.electronAPI?.closeWindow();
  const handleTranslate = () => setShowTranslateDialog(true);
  const handleExport = () => setShowExportDialog(true);
  const handleReorganize = () => reorganizeGraph();

  return (
    <header className="titlebar-drag h-10 bg-surface-800/80 backdrop-blur-sm border-b border-surface-700 flex items-center justify-between px-4">
      {/* macOS: 좌측에 윈도우 컨트롤 */}
      {isMac && (
        <div className="titlebar-no-drag flex items-center gap-2">
          <button
            onClick={handleClose}
            className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors"
            aria-label="닫기"
          />
          <button
            onClick={handleMinimize}
            className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 transition-colors"
            aria-label="최소화"
          />
          <button
            onClick={handleMaximize}
            className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 transition-colors"
            aria-label="최대화"
          />
        </div>
      )}

      {/* 타이틀 + 번역 버튼 */}
      <div className="flex-1 flex items-center justify-center gap-3">
        <h1 className="text-sm font-medium text-gray-400 select-none">
          <span className="text-neon-cyan">●</span>
          {' '}실시간 지식 그래프
        </h1>
        
        {/* 그래프 도구 버튼들 */}
        {hasGraph && (
          <div className="titlebar-no-drag flex items-center gap-1">
            {/* 번역 버튼 */}
            <button
              onClick={handleTranslate}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-400 hover:text-neon-magenta hover:bg-surface-700/80 rounded-md transition-colors border border-transparent hover:border-surface-600"
              aria-label="그래프 번역"
            >
              <Languages size={13} />
              <span>번역</span>
            </button>
            
            {/* 정리 버튼 */}
            <button
              onClick={handleReorganize}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-400 hover:text-neon-cyan hover:bg-surface-700/80 rounded-md transition-colors border border-transparent hover:border-surface-600"
              aria-label="그래프 정리"
            >
              <LayoutGrid size={13} />
              <span>정리</span>
            </button>
            
            {/* 내보내기 버튼 */}
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-400 hover:text-neon-yellow hover:bg-surface-700/80 rounded-md transition-colors border border-transparent hover:border-surface-600"
              aria-label="그래프 내보내기"
            >
              <Download size={13} />
              <span>내보내기</span>
            </button>
          </div>
        )}
      </div>

      {/* Windows: 우측에 윈도우 컨트롤 */}
      {!isMac && (
        <div className="titlebar-no-drag flex items-center">
          <button
            onClick={handleMinimize}
            className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-700 transition-colors"
            aria-label="최소화"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={handleMaximize}
            className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-700 transition-colors"
            aria-label="최대화"
          >
            <Square size={12} />
          </button>
          <button
            onClick={handleClose}
            className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-600 transition-colors"
            aria-label="닫기"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* macOS: 우측 빈 공간 (균형용) */}
      {isMac && <div className="w-14" />}
    </header>
  );
}



