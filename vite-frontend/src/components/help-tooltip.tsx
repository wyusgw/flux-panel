import type { ReactNode } from "react";
import { Tooltip } from "@heroui/tooltip";

const IconHelp = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 9a2.5 2.5 0 114.1 1.9c-.6.5-1.1 1-1.1 1.8V13" />
    <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

/**
 * 字段标签 + 圆点问号说明：悬停/点击问号显示字段说明，
 * 替代直接铺在输入框下方常驻显示的说明文字
 */
export const HelpTooltip = ({ children, content }: { children: ReactNode; content: string }) => (
  <span className="inline-flex items-center gap-1 leading-none">
    {children}
    <Tooltip content={content}>
      <span className="inline-flex items-center"><IconHelp /></span>
    </Tooltip>
  </span>
);
