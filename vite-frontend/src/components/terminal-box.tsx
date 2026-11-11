import type { ReactNode } from "react";

// 终端命令行风格的输出框：固定深色底、等宽字体，不随亮色/暗色主题变化。
// 转发/隧道诊断（tcp-ping-diagnosis.tsx）与网络诊断（looking-glass.tsx）共用。
export const TERM_TEXT = 'text-[#c9d1d9]';
export const TERM_DIM = 'text-[#8b949e]';
export const TERM_ERR = 'text-[#ff7b72]';

export function TerminalBox({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`w-full min-w-0 font-mono text-xs leading-relaxed bg-[#0d1117] rounded-md px-3 py-2.5 overflow-x-auto whitespace-pre ${className}`}>
      {children}
    </div>
  );
}
