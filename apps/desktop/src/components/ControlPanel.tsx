/**
 * 컨트롤 패널
 * 오디오 캡처 제어 및 상태 표시
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Wifi, WifiOff, Volume2, RotateCcw, CheckCircle } from 'lucide-react';
import { clsx } from 'clsx';

interface ControlPanelProps {
  isConnected: boolean;
  isCapturing: boolean;
  isSessionComplete: boolean;  // 세션 완료 상태 (그래프 있음 + 캡처 안함)
  onToggleCapture: () => void;
}

export function ControlPanel({
  isConnected,
  isCapturing,
  isSessionComplete,
  onToggleCapture,
}: ControlPanelProps) {
  return (
    <div className="p-4 border-b border-surface-700">
      {/* 연결 상태 */}
      <div className="flex items-center gap-2 mb-4">
        <span
          className={clsx(
            'flex items-center gap-2 text-sm',
            isConnected ? 'text-neon-green' : 'text-gray-500'
          )}
        >
          {isConnected ? (
            <>
              <Wifi size={14} className="animate-pulse" />
              서버 연결됨
            </>
          ) : (
            <>
              <WifiOff size={14} />
              연결 안됨
            </>
          )}
        </span>
      </div>

      {/* 캡처 버튼 */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onToggleCapture}
        disabled={!isConnected}
        className={clsx(
          'w-full py-4 rounded-xl font-medium transition-all',
          'flex items-center justify-center gap-3',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          isCapturing
            ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30'
            : isSessionComplete
              ? 'bg-surface-600/50 text-gray-300 border border-surface-500 hover:bg-surface-600 hover:text-white'
              : 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 hover:bg-neon-cyan/20'
        )}
      >
        <AnimatePresence mode="wait">
          {isCapturing ? (
            <motion.div
              key="capturing"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="flex items-center gap-3"
            >
              <div className="relative">
                <MicOff size={20} />
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-red-400"
                  animate={{ scale: [1, 1.5, 1], opacity: [1, 0, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              </div>
              <span>캡처 중지</span>
            </motion.div>
          ) : isSessionComplete ? (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="flex items-center gap-3"
            >
              <RotateCcw size={20} />
              <span>새로 시작</span>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="flex items-center gap-3"
            >
              <Mic size={20} />
              <span>오디오 캡처 시작</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* 캡처/완료 상태 표시 */}
      <AnimatePresence mode="wait">
        {isCapturing ? (
          <motion.div
            key="capturing-status"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 p-3 rounded-lg bg-surface-700/50 border border-surface-600"
          >
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Volume2 size={14} className="text-neon-green" />
              <span>시스템 오디오 캡처 중...</span>
            </div>
            
            {/* 오디오 레벨 바 */}
            <div className="mt-2 h-1 bg-surface-600 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-neon-green to-neon-cyan"
                animate={{
                  width: ['20%', '80%', '40%', '90%', '30%'],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            </div>
          </motion.div>
        ) : isSessionComplete ? (
          <motion.div
            key="complete-status"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 p-3 rounded-lg bg-neon-green/5 border border-neon-green/20"
          >
            <div className="flex items-center gap-2 text-sm text-neon-green">
              <CheckCircle size={14} />
              <span>분석 완료</span>
            </div>
            <p className="mt-2 text-xs text-gray-400 leading-relaxed">
              그래프를 번역하거나 다양한 형식으로 내보낼 수 있습니다.
              우측 상단 메뉴를 이용하세요.
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* 안내 문구 */}
      <p className="mt-4 text-xs text-gray-500 leading-relaxed">
        {isSessionComplete 
          ? '새로 시작하면 현재 그래프가 초기화되고 새로운 분석을 시작합니다.'
          : '시스템 오디오를 캡처하여 실시간으로 분석합니다. 온라인 회의, 강의, 팟캐스트 등의 음성을 지식 그래프로 변환합니다.'
        }
      </p>
    </div>
  );
}



