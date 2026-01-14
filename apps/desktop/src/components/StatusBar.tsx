/**
 * 상태 바
 * 시스템 상태 및 처리 파이프라인 표시
 */

import { motion } from 'framer-motion';
import {
  Radio,
  Mic,
  Brain,
  GitBranch,
  Check,
  Loader2,
  Circle,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { ProcessingStage } from '@rkg/shared-types';

interface StatusBarProps {
  isConnected: boolean;
  isCapturing: boolean;
  processingStage: ProcessingStage;
}

const STAGES: Array<{
  id: ProcessingStage;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { id: 'RECEIVING', label: '수신', icon: Radio },
  { id: 'STT_PROCESSING', label: 'STT', icon: Mic },
  { id: 'NLP_ANALYZING', label: 'NLP', icon: Brain },
  { id: 'EXTRACTING', label: '추출', icon: GitBranch },
  { id: 'UPDATING_GRAPH', label: '그래프', icon: Check },
];

export function StatusBar({
  isConnected,
  isCapturing,
  processingStage,
}: StatusBarProps) {
  const currentStageIndex = STAGES.findIndex((s) => s.id === processingStage);

  return (
    <footer className="h-8 bg-surface-800/80 backdrop-blur-sm border-t border-surface-700 flex items-center px-4 text-xs">
      {/* 연결 상태 */}
      <div className="flex items-center gap-1.5">
        <span
          className={clsx(
            'w-2 h-2 rounded-full',
            isConnected ? 'bg-neon-green animate-pulse' : 'bg-gray-600'
          )}
        />
        <span className={isConnected ? 'text-neon-green' : 'text-gray-500'}>
          {isConnected ? '연결됨' : '연결 안됨'}
        </span>
      </div>

      <div className="mx-4 w-px h-4 bg-surface-600" />

      {/* 캡처 상태 */}
      <div className="flex items-center gap-1.5">
        <Mic
          size={12}
          className={isCapturing ? 'text-red-400' : 'text-gray-500'}
        />
        <span className={isCapturing ? 'text-red-400' : 'text-gray-500'}>
          {isCapturing ? '캡처 중' : '대기'}
        </span>
      </div>

      <div className="mx-4 w-px h-4 bg-surface-600" />

      {/* 파이프라인 상태 */}
      <div className="flex items-center gap-1">
        {STAGES.map((stage, index) => {
          const isActive = stage.id === processingStage;
          const isPast = currentStageIndex > index;
          const Icon = stage.icon;

          return (
            <div key={stage.id} className="flex items-center">
              <motion.div
                className={clsx(
                  'flex items-center gap-1 px-2 py-0.5 rounded transition-colors',
                  isActive && 'bg-neon-cyan/10 text-neon-cyan',
                  isPast && 'text-neon-green',
                  !isActive && !isPast && 'text-gray-600'
                )}
                animate={isActive ? { scale: [1, 1.05, 1] } : {}}
                transition={{ duration: 0.5, repeat: isActive ? Infinity : 0 }}
              >
                {isActive ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : isPast ? (
                  <Check size={10} />
                ) : (
                  <Icon size={10} />
                )}
                <span className="hidden sm:inline">{stage.label}</span>
              </motion.div>

              {/* 연결선 */}
              {index < STAGES.length - 1 && (
                <div
                  className={clsx(
                    'w-4 h-px mx-0.5',
                    isPast ? 'bg-neon-green' : 'bg-surface-600'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 버전 정보 */}
      <div className="ml-auto text-gray-600">v1.0.0</div>
    </footer>
  );
}



