import { NoDataIcon } from "@/components/icons";

interface EmptyStateProps {
  text?: string;
  className?: string;
  /** 紧凑尺寸：图标和文字更小，用于下拉框等空间有限的位置 */
  compact?: boolean;
}

export const EmptyState = ({ text = "暂无数据", className, compact = false }: EmptyStateProps) => (
  <div className={`flex flex-col items-center justify-center gap-2 ${className ?? (compact ? 'py-3' : 'py-12')}`}>
    <NoDataIcon className={`${compact ? 'w-12' : 'w-16'} h-auto`} />
    <p className={`${compact ? 'text-xs' : 'text-sm'} text-default-400 dark:text-[#595959]`}>{text}</p>
  </div>
);
