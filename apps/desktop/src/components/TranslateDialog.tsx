/**
 * 번역 다이얼로그 컴포넌트
 * 그래프 전체를 선택한 언어로 번역
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Languages, Check, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

interface TranslateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onTranslate: (targetLanguage: string) => void;
  isTranslating: boolean;
  graphInfo: {
    entitiesCount: number;
    relationsCount: number;
  };
}

const LANGUAGES = [
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
];

export function TranslateDialog({
  isOpen,
  onClose,
  onTranslate,
  isTranslating,
  graphInfo,
}: TranslateDialogProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');

  const handleTranslate = () => {
    if (!selectedLanguage || isTranslating) return;
    onTranslate(selectedLanguage);
  };

  const handleClose = () => {
    if (isTranslating) return;
    setSelectedLanguage('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="relative w-full max-w-sm mx-4 bg-surface-800/90 backdrop-blur-sm border border-surface-600 rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="relative px-4 pt-4 pb-3 border-b border-surface-700">
              <button
                onClick={handleClose}
                disabled={isTranslating}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white hover:bg-surface-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-2 mb-2">
                <Languages size={16} className="text-neon-magenta" />
                <h2 className="text-sm font-medium text-gray-300">
                  그래프 번역
                </h2>
              </div>

              <p className="text-xs text-gray-400 leading-relaxed">
                전체 그래프를 선택한 언어로 번역합니다.
              </p>
            </div>

            {/* 그래프 정보 */}
            <div className="mx-4 mt-4 p-3 bg-surface-700/50 rounded-lg border border-surface-600">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-sm font-medium text-neon-cyan font-mono">
                    {graphInfo.entitiesCount}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">엔티티</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-neon-magenta font-mono">
                    {graphInfo.relationsCount}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">관계</div>
                </div>
              </div>
            </div>

            {/* 언어 선택 */}
            <div className="px-4 mt-4 mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-3">
                번역 언어 선택
              </label>
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => setSelectedLanguage(lang.code)}
                    disabled={isTranslating}
                    className={clsx(
                      'flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      selectedLanguage === lang.code
                        ? 'bg-neon-magenta/10 border-neon-magenta/50 text-neon-magenta'
                        : 'bg-surface-700/50 border-surface-600 text-gray-300 hover:border-surface-500 hover:bg-surface-700'
                    )}
                  >
                    <span className="text-base">{lang.flag}</span>
                    <span className="text-sm">{lang.name}</span>
                    {selectedLanguage === lang.code && (
                      <Check size={14} className="ml-auto text-neon-magenta" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-3 px-4 pb-4 border-t border-surface-700 pt-4">
              <button
                onClick={handleClose}
                disabled={isTranslating}
                className="flex-1 px-4 py-2.5 bg-surface-700 hover:bg-surface-600 text-gray-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleTranslate}
                disabled={!selectedLanguage || isTranslating || graphInfo.entitiesCount === 0}
                className={clsx(
                  'flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  selectedLanguage && !isTranslating
                    ? 'bg-neon-magenta/10 text-neon-magenta border border-neon-magenta/30 hover:bg-neon-magenta/20'
                    : 'bg-surface-700 text-gray-500 border border-surface-600'
                )}
              >
                {isTranslating ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    번역 중...
                  </>
                ) : (
                  <>
                    <Languages size={14} />
                    번역하기
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

