/**
 * 커스텀 타이틀 바
 * macOS 스타일의 윈도우 컨트롤
 */

import { Minus, Square, X, Maximize2 } from 'lucide-react';

export function TitleBar() {
  const isMac = window.electronAPI?.platform === 'darwin';

  const handleMinimize = () => window.electronAPI?.minimizeWindow();
  const handleMaximize = () => window.electronAPI?.maximizeWindow();
  const handleClose = () => window.electronAPI?.closeWindow();

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

      {/* 타이틀 */}
      <div className="flex-1 text-center">
        <h1 className="text-sm font-medium text-gray-400 select-none">
          <span className="text-neon-cyan">●</span>
          {' '}실시간 지식 그래프
        </h1>
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



