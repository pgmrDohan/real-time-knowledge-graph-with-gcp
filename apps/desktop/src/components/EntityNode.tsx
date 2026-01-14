/**
 * 엔티티 노드 컴포넌트
 * 지식 그래프의 개별 노드 렌더링
 */

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import {
  User,
  Building2,
  MapPin,
  Lightbulb,
  Calendar,
  Package,
  Cpu,
  TrendingUp,
  Zap,
  HelpCircle,
  PartyPopper,
} from 'lucide-react';
import type { RFNodeData, EntityType } from '@rkg/shared-types';

// 엔티티 타입별 아이콘
const ENTITY_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  PERSON: User,
  ORGANIZATION: Building2,
  LOCATION: MapPin,
  CONCEPT: Lightbulb,
  EVENT: PartyPopper,
  PRODUCT: Package,
  TECHNOLOGY: Cpu,
  DATE: Calendar,
  METRIC: TrendingUp,
  ACTION: Zap,
  UNKNOWN: HelpCircle,
};

// 엔티티 타입별 색상
const ENTITY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  PERSON: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400' },
  ORGANIZATION: { bg: 'bg-teal-500/10', border: 'border-teal-500/30', text: 'text-teal-400' },
  LOCATION: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
  CONCEPT: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400' },
  EVENT: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400' },
  PRODUCT: { bg: 'bg-gray-500/10', border: 'border-gray-500/30', text: 'text-gray-400' },
  TECHNOLOGY: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
  DATE: { bg: 'bg-pink-500/10', border: 'border-pink-500/30', text: 'text-pink-400' },
  METRIC: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400' },
  ACTION: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
  UNKNOWN: { bg: 'bg-gray-600/10', border: 'border-gray-600/30', text: 'text-gray-500' },
};

// 타입 한글명
const TYPE_LABELS: Record<string, string> = {
  PERSON: '인물',
  ORGANIZATION: '조직',
  LOCATION: '장소',
  CONCEPT: '개념',
  EVENT: '이벤트',
  PRODUCT: '제품',
  TECHNOLOGY: '기술',
  DATE: '날짜',
  METRIC: '지표',
  ACTION: '행동',
  UNKNOWN: '미분류',
};

function EntityNodeComponent({ data }: NodeProps<RFNodeData>) {
  const { entity, isNew, isUpdated } = data;
  const Icon = ENTITY_ICONS[entity.type] || ENTITY_ICONS.UNKNOWN;
  const colors = ENTITY_COLORS[entity.type] || ENTITY_COLORS.UNKNOWN;

  return (
    <motion.div
      initial={isNew ? { scale: 0, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={clsx(
        'relative px-4 py-3 rounded-xl border backdrop-blur-sm',
        'min-w-[120px] max-w-[200px]',
        colors.bg,
        colors.border,
        isNew && 'ring-2 ring-neon-cyan/50 ring-offset-2 ring-offset-surface-900',
        isUpdated && 'ring-2 ring-neon-yellow/50'
      )}
    >
      {/* 입력/출력 핸들 */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-surface-600 !border-none"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-surface-600 !border-none"
      />

      {/* 새 노드 뱃지 */}
      {isNew && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-2 -right-2 px-1.5 py-0.5 bg-neon-cyan text-surface-900 text-[10px] font-bold rounded-full"
        >
          NEW
        </motion.div>
      )}

      {/* 콘텐츠 */}
      <div className="flex items-start gap-2">
        {/* 아이콘 */}
        <div className={clsx('p-1.5 rounded-lg', colors.bg)}>
          <Icon size={14} className={colors.text} />
        </div>

        {/* 텍스트 */}
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-medium text-gray-200 truncate"
            title={entity.label}
          >
            {entity.label}
          </p>
          <p className={clsx('text-[10px] mt-0.5', colors.text)}>
            {TYPE_LABELS[entity.type] || entity.type}
          </p>
        </div>
      </div>

      {/* 글로우 효과 (새 노드) */}
      {isNew && (
        <motion.div
          className="absolute inset-0 rounded-xl pointer-events-none"
          animate={{
            boxShadow: [
              '0 0 0 0 rgba(0, 255, 255, 0)',
              '0 0 20px 5px rgba(0, 255, 255, 0.3)',
              '0 0 0 0 rgba(0, 255, 255, 0)',
            ],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
}

export const EntityNode = memo(EntityNodeComponent);



