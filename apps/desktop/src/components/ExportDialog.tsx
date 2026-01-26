/**
 * 내보내기 다이얼로그 컴포넌트
 * 그래프를 PNG, PDF, Mermaid 형식으로 내보내기
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Image, FileText, Code, Check, Loader2, Copy } from 'lucide-react';
import { clsx } from 'clsx';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

type ExportFormat = 'png' | 'pdf' | 'mermaid';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  graphInfo: {
    entitiesCount: number;
    relationsCount: number;
  };
  graphData: {
    entities: Array<{ id: string; label: string; type: string }>;
    relations: Array<{ id: string; source: string; target: string; relation: string }>;
  } | null;
}

const EXPORT_FORMATS: Array<{
  id: ExportFormat;
  name: string;
  description: string;
  icon: typeof Image;
}> = [
  {
    id: 'png',
    name: 'PNG 이미지',
    description: '고해상도 이미지로 저장',
    icon: Image,
  },
  {
    id: 'pdf',
    name: 'PDF 문서',
    description: '인쇄 가능한 문서로 저장',
    icon: FileText,
  },
  {
    id: 'mermaid',
    name: 'Mermaid 코드',
    description: '다이어그램 코드로 복사',
    icon: Code,
  },
];

export function ExportDialog({
  isOpen,
  onClose,
  graphInfo,
  graphData,
}: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | ''>('');
  const [isExporting, setIsExporting] = useState(false);
  const [mermaidCode, setMermaidCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateMermaidCode = (): string => {
    if (!graphData) return '';

    const lines: string[] = ['graph LR'];
    
    // 엔티티 정의 (노드)
    graphData.entities.forEach((entity) => {
      const safeLabel = entity.label.replace(/"/g, "'").replace(/\[/g, '(').replace(/\]/g, ')');
      const nodeShape = getNodeShape(entity.type);
      lines.push(`    ${entity.id}${nodeShape.open}"${safeLabel}"${nodeShape.close}`);
    });

    // 관계 정의 (엣지)
    graphData.relations.forEach((relation) => {
      const safeRelation = relation.relation.replace(/"/g, "'");
      lines.push(`    ${relation.source} -->|${safeRelation}| ${relation.target}`);
    });

    return lines.join('\n');
  };

  const getNodeShape = (type: string): { open: string; close: string } => {
    // Mermaid 노드 모양 매핑
    switch (type) {
      case 'PERSON':
        return { open: '([', close: '])' }; // 스타디움 모양
      case 'ORGANIZATION':
        return { open: '[[', close: ']]' }; // 서브루틴 모양
      case 'LOCATION':
        return { open: '{{', close: '}}' }; // 육각형
      case 'EVENT':
        return { open: '>', close: ']' }; // 비대칭
      case 'DATE':
        return { open: '[/', close: '/]' }; // 평행사변형
      default:
        return { open: '[', close: ']' }; // 기본 사각형
    }
  };

  const handleExport = async () => {
    if (!selectedFormat || isExporting) return;

    setIsExporting(true);

    try {
      switch (selectedFormat) {
        case 'png':
          await exportToPng();
          break;
        case 'pdf':
          await exportToPdf();
          break;
        case 'mermaid':
          const code = generateMermaidCode();
          setMermaidCode(code);
          setIsExporting(false);
          return; // 모달 닫지 않음
      }
      
      onClose();
    } catch (error) {
      console.error('Export failed:', error);
      alert('내보내기에 실패했습니다.');
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPng = async () => {
    const element = document.querySelector('.react-flow') as HTMLElement;
    if (!element) throw new Error('Graph element not found');

    const dataUrl = await toPng(element, {
      backgroundColor: '#0f0f17',
      pixelRatio: 2,
      skipFonts: true, // 외부 폰트 스킵 (CSP 문제 방지)
      filter: (node) => {
        // React Flow 컨트롤과 미니맵 제외
        if (node.classList?.contains('react-flow__controls')) return false;
        if (node.classList?.contains('react-flow__minimap')) return false;
        return true;
      },
    });

    // 다운로드
    const link = document.createElement('a');
    link.download = `knowledge-graph-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  const exportToPdf = async () => {
    const element = document.querySelector('.react-flow') as HTMLElement;
    if (!element) throw new Error('Graph element not found');

    const dataUrl = await toPng(element, {
      backgroundColor: '#0f0f17',
      pixelRatio: 2,
      skipFonts: true, // 외부 폰트 스킵 (CSP 문제 방지)
      filter: (node) => {
        if (node.classList?.contains('react-flow__controls')) return false;
        if (node.classList?.contains('react-flow__minimap')) return false;
        return true;
      },
    });

    // PDF 생성
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [element.offsetWidth, element.offsetHeight],
    });

    pdf.addImage(dataUrl, 'PNG', 0, 0, element.offsetWidth, element.offsetHeight);
    pdf.save(`knowledge-graph-${Date.now()}.pdf`);
  };

  const handleCopyMermaid = async () => {
    if (!mermaidCode) return;
    
    try {
      await navigator.clipboard.writeText(mermaidCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  const handleClose = () => {
    if (isExporting) return;
    setSelectedFormat('');
    setMermaidCode(null);
    setCopied(false);
    onClose();
  };

  const handleBack = () => {
    setMermaidCode(null);
    setSelectedFormat('');
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
            className={clsx(
              'relative mx-4 bg-surface-800/90 backdrop-blur-sm border border-surface-600 rounded-xl shadow-2xl overflow-hidden',
              mermaidCode ? 'w-full max-w-2xl' : 'w-full max-w-sm'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="relative px-4 pt-4 pb-3 border-b border-surface-700">
              <button
                onClick={handleClose}
                disabled={isExporting}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white hover:bg-surface-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-2 mb-2">
                <Download size={16} className="text-neon-yellow" />
                <h2 className="text-sm font-medium text-gray-300">
                  {mermaidCode ? 'Mermaid 코드' : '그래프 내보내기'}
                </h2>
              </div>

              <p className="text-xs text-gray-400 leading-relaxed">
                {mermaidCode
                  ? '아래 코드를 복사하여 Mermaid 지원 도구에서 사용하세요.'
                  : '그래프를 다양한 형식으로 내보냅니다.'}
              </p>
            </div>

            {/* Mermaid 코드 표시 */}
            {mermaidCode ? (
              <>
                <div className="p-4">
                  <div className="relative">
                    <pre className="p-4 bg-surface-900 rounded-lg border border-surface-600 text-xs text-gray-300 overflow-auto max-h-80 font-mono">
                      {mermaidCode}
                    </pre>
                    <button
                      onClick={handleCopyMermaid}
                      className={clsx(
                        'absolute top-2 right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                        copied
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-surface-700 text-gray-300 border border-surface-600 hover:bg-surface-600'
                      )}
                    >
                      {copied ? (
                        <>
                          <Check size={12} />
                          복사됨
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          복사
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 px-4 pb-4 border-t border-surface-700 pt-4">
                  <button
                    onClick={handleBack}
                    className="flex-1 px-4 py-2.5 bg-surface-700 hover:bg-surface-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
                  >
                    뒤로
                  </button>
                  <button
                    onClick={handleClose}
                    className="flex-1 px-4 py-2.5 bg-neon-yellow/10 text-neon-yellow border border-neon-yellow/30 hover:bg-neon-yellow/20 rounded-lg text-sm font-medium transition-colors"
                  >
                    완료
                  </button>
                </div>
              </>
            ) : (
              <>
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

                {/* 형식 선택 */}
                <div className="px-4 mt-4 mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    내보내기 형식
                  </label>
                  <div className="space-y-2">
                    {EXPORT_FORMATS.map((format) => {
                      const Icon = format.icon;
                      return (
                        <button
                          key={format.id}
                          type="button"
                          onClick={() => setSelectedFormat(format.id)}
                          disabled={isExporting}
                          className={clsx(
                            'w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                            selectedFormat === format.id
                              ? 'bg-neon-yellow/10 border-neon-yellow/50 text-neon-yellow'
                              : 'bg-surface-700/50 border-surface-600 text-gray-300 hover:border-surface-500 hover:bg-surface-700'
                          )}
                        >
                          <Icon size={18} className={selectedFormat === format.id ? 'text-neon-yellow' : 'text-gray-400'} />
                          <div className="flex-1">
                            <div className="text-sm font-medium">{format.name}</div>
                            <div className="text-xs text-gray-500">{format.description}</div>
                          </div>
                          {selectedFormat === format.id && (
                            <Check size={16} className="text-neon-yellow" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 버튼 */}
                <div className="flex gap-3 px-4 pb-4 border-t border-surface-700 pt-4">
                  <button
                    onClick={handleClose}
                    disabled={isExporting}
                    className="flex-1 px-4 py-2.5 bg-surface-700 hover:bg-surface-600 text-gray-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleExport}
                    disabled={!selectedFormat || isExporting || graphInfo.entitiesCount === 0}
                    className={clsx(
                      'flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      selectedFormat && !isExporting
                        ? 'bg-neon-yellow/10 text-neon-yellow border border-neon-yellow/30 hover:bg-neon-yellow/20'
                        : 'bg-surface-700 text-gray-500 border border-surface-600'
                    )}
                  >
                    {isExporting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        내보내는 중...
                      </>
                    ) : (
                      <>
                        <Download size={14} />
                        내보내기
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

