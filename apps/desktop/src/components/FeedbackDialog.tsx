/**
 * 피드백 다이얼로그 컴포넌트
 * 세션 종료 시 사용자 만족도 수집
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, X, Send, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';

interface FeedbackDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (rating: number, comment: string | null) => void;
  sessionInfo: {
    entitiesCount: number;
    relationsCount: number;
    durationSeconds: number;
  } | null;
}

export function FeedbackDialog({
  isOpen,
  onClose,
  onSubmit,
  sessionInfo,
}: FeedbackDialogProps) {
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) return;

    setIsSubmitting(true);
    try {
      await onSubmit(rating, comment.trim() || null);
    } finally {
      setIsSubmitting(false);
      setRating(0);
      setComment('');
    }
  };

  const handleSkip = () => {
    setRating(0);
    setComment('');
    onClose();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}분 ${secs}초` : `${secs}초`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={handleSkip}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="relative w-full max-w-md mx-4 bg-surface-800 border border-surface-600 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="relative px-6 pt-6 pb-4">
              <button
                onClick={handleSkip}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-200 hover:bg-surface-700 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-neon-cyan/10 rounded-lg">
                  <MessageSquare size={20} className="text-neon-cyan" />
                </div>
                <h2 className="text-lg font-semibold text-gray-100">
                  세션 피드백
                </h2>
              </div>

              <p className="text-sm text-gray-400">
                생성된 지식 그래프에 대한 만족도를 평가해주세요.
                피드백은 AI 모델 개선에 활용됩니다.
              </p>
            </div>

            {/* 세션 요약 */}
            {sessionInfo && (
              <div className="mx-6 mb-4 p-3 bg-surface-700/50 rounded-lg border border-surface-600">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-lg font-bold text-neon-cyan">
                      {sessionInfo.entitiesCount}
                    </div>
                    <div className="text-xs text-gray-500">엔티티</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-neon-magenta">
                      {sessionInfo.relationsCount}
                    </div>
                    <div className="text-xs text-gray-500">관계</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-neon-yellow">
                      {formatDuration(sessionInfo.durationSeconds)}
                    </div>
                    <div className="text-xs text-gray-500">세션 시간</div>
                  </div>
                </div>
              </div>
            )}

            {/* 별점 */}
            <div className="px-6 mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-3">
                만족도
              </label>
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    onMouseEnter={() => setHoveredRating(value)}
                    onMouseLeave={() => setHoveredRating(0)}
                    className="p-1 transition-transform hover:scale-110"
                  >
                    <Star
                      size={32}
                      className={clsx(
                        'transition-colors',
                        (hoveredRating || rating) >= value
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-600'
                      )}
                    />
                  </button>
                ))}
              </div>
              <div className="text-center mt-2 text-sm text-gray-500">
                {rating === 1 && '매우 불만족'}
                {rating === 2 && '불만족'}
                {rating === 3 && '보통'}
                {rating === 4 && '만족'}
                {rating === 5 && '매우 만족'}
              </div>
            </div>

            {/* 코멘트 */}
            <div className="px-6 mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                추가 의견 (선택)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="개선이 필요한 점이나 좋았던 점을 알려주세요..."
                className="w-full h-24 px-3 py-2 bg-surface-900 border border-surface-600 rounded-lg text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-neon-cyan/50 focus:border-neon-cyan/50"
                maxLength={500}
              />
              <div className="text-right text-xs text-gray-600 mt-1">
                {comment.length}/500
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={handleSkip}
                className="flex-1 px-4 py-2.5 bg-surface-700 hover:bg-surface-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
              >
                건너뛰기
              </button>
              <button
                onClick={handleSubmit}
                disabled={rating === 0 || isSubmitting}
                className={clsx(
                  'flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2',
                  rating > 0 && !isSubmitting
                    ? 'bg-neon-cyan text-surface-900 hover:bg-neon-cyan/90'
                    : 'bg-surface-700 text-gray-500 cursor-not-allowed'
                )}
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-surface-900/30 border-t-surface-900 rounded-full animate-spin" />
                ) : (
                  <>
                    <Send size={14} />
                    제출하기
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

