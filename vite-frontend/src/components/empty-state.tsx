import { NoDataIcon } from "@/components/icons";

interface EmptyStateProps {
  text?: string;
  className?: string;
}

export const EmptyState = ({ text = "暂无数据", className = "py-16" }: EmptyStateProps) => (
  <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
    <NoDataIcon className="w-16 h-16 text-default-300" />
    <p className="text-sm text-default-500">{text}</p>
  </div>
);
