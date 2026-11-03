import { NoDataIcon } from "@/components/icons";

interface EmptyStateProps {
  text?: string;
  className?: string;
  /** 紧凑尺寸：图标和文字更小，用于下拉框等空间有限的位置 */
  compact?: boolean;
}

export const EmptyState = ({ text = "暂无数据", className, compact = false }: EmptyStateProps) => (
  <div className={`flex flex-col items-center justify-center ${compact ? 'gap-1' : 'gap-3'} ${className ?? (compact ? 'py-3' : 'py-16')}`}>
    <NoDataIcon className={`${compact ? 'w-10 h-10' : 'w-16 h-16'} text-default-300`} />
    <p className={`${compact ? 'text-xs' : 'text-sm'} text-default-500`}>{text}</p>
  </div>
);
