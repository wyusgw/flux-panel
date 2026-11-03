import type { ReactNode } from 'react';

const VALUE_TONE_CLASS = {
  default: 'text-foreground',
  success: 'text-success-600',
  warning: 'text-warning-600',
  danger: 'text-danger-600'
} as const;

/**
 * 统计格（仪表盘「数据一览」、队列监控概览共用）：左边小号灰色标题 + 大号数值（可带一行补充说明），
 * 右边可选放一张迷你曲线；不画格子分隔线，靠留白区分；传 onClick 时整格可点击。
 * 通常放在两栏网格里：<div className="grid grid-cols-2">…</div>
 */
export const StatCell = ({ label, value, valueTone = 'default', hint, hintTone, chart, onClick }: {
  label: string;
  value: ReactNode;
  valueTone?: keyof typeof VALUE_TONE_CLASS;
  hint?: string;
  hintTone?: 'danger';
  chart?: ReactNode;
  onClick?: () => void;
}) => {
  const body = (
    <>
      <div className="min-w-0">
        <p className="text-xs text-default-500">{label}</p>
        <p className={`mt-2 text-2xl font-medium whitespace-nowrap ${VALUE_TONE_CLASS[valueTone]}`}>{value}</p>
        {hint && <p className={`mt-1 text-xs ${hintTone === 'danger' ? 'text-danger-600' : 'text-default-500'}`}>{hint}</p>}
      </div>
      {chart}
    </>
  );
  const cls = 'px-6 py-7 min-h-[112px] flex items-center justify-between gap-4';
  return onClick
    ? <button type="button" onClick={onClick} className={`${cls} text-left hover:bg-default-50 transition-colors`}>{body}</button>
    : <div className={cls}>{body}</div>;
};
