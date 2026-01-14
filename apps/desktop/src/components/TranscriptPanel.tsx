/**
 * 트랜스크립트 패널
 * STT 결과 실시간 표시
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Loader2 } from 'lucide-react';
import { useGraphStore } from '../store/graphStore';

export function TranscriptPanel() {
  const transcripts = useGraphStore((state) => state.transcripts);
  const currentPartialText = useGraphStore((state) => state.currentPartialText);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 새 트랜스크립트 추가 시 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts, currentPartialText]);

  const isEmpty = transcripts.length === 0 && !currentPartialText;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-surface-700 flex items-center gap-2">
        <MessageSquare size={16} className="text-neon-cyan" />
        <span className="text-sm font-medium text-gray-300">실시간 자막</span>
        {transcripts.length > 0 && (
          <span className="ml-auto text-xs text-gray-500">
            {transcripts.length}개
          </span>
        )}
      </div>

      {/* 트랜스크립트 목록 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <MessageSquare size={32} className="mb-2 opacity-50" />
            <p className="text-sm">아직 인식된 내용이 없습니다</p>
            <p className="text-xs mt-1">오디오 캡처를 시작하세요</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {/* 완료된 트랜스크립트 */}
            {transcripts.map((transcript) => (
              <motion.div
                key={transcript.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-surface-700/50 border border-surface-600"
              >
                <p className="text-sm text-gray-200 leading-relaxed">
                  {transcript.text}
                </p>
                <span className="text-xs text-gray-500 mt-1 block">
                  {formatTime(transcript.timestamp)}
                </span>
              </motion.div>
            ))}

            {/* 현재 진행 중인 부분 텍스트 */}
            {currentPartialText && (
              <motion.div
                key="partial"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-3 rounded-lg bg-neon-cyan/5 border border-neon-cyan/20"
              >
                <div className="flex items-start gap-2">
                  <Loader2
                    size={14}
                    className="text-neon-cyan animate-spin mt-0.5 flex-shrink-0"
                  />
                  <p className="text-sm text-neon-cyan/80 leading-relaxed">
                    {currentPartialText}
                    <span className="animate-pulse">▊</span>
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}



