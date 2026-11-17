import { useEffect, useState, ReactNode } from 'react';

// 与 globals.css 里 .collapse-panel 的高度过渡时长一致
const COLLAPSE_DURATION_MS = 320;

/**
 * 平滑展开收起：内容一直挂载（输入不丢），高度和透明度一起过渡，样式见 globals.css 的 .collapse-panel。
 * 过渡期间裁剪溢出，展开完成后再放开，里面的下拉框才能超出面板。
 */
export function Collapse({ isOpen, className = '', children }: { isOpen: boolean; className?: string; children: ReactNode }) {
  const [settled, setSettled] = useState(isOpen);

  useEffect(() => {
    if (!isOpen) {
      setSettled(false);
      return;
    }
    const timer = window.setTimeout(() => setSettled(true), COLLAPSE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  return (
    <div className={`collapse-panel${isOpen ? ' is-open' : ''}${isOpen && settled ? ' is-settled' : ''}${className ? ` ${className}` : ''}`}>
      <div>
        <div>{children}</div>
      </div>
    </div>
  );
}
