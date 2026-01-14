/**
 * 컨트롤 패널
 * 오디오 캡처 제어 및 상태 표시
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Wifi, WifiOff, Volume2 } from 'lucide-react';
import { clsx } from 'clsx';

interface ControlPanelProps {
  isConnected: boolean;
  isCapturing: boolean;
  onToggleCapture: () => void;
}

export function ControlPanel({
  isConnected,
  isCapturing,
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

      {/* 캡처 상태 표시 */}
      <AnimatePresence>
        {isCapturing && (
          <motion.div
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
        )}
      </AnimatePresence>

      {/* 안내 문구 */}
      <p className="mt-4 text-xs text-gray-500 leading-relaxed">
        시스템 오디오를 캡처하여 실시간으로 분석합니다.
        온라인 회의, 강의, 팟캐스트 등의 음성을 지식 그래프로 변환합니다.
      </p>
    </div>
  );
}



