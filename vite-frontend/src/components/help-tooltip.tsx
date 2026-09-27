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
 *
 * 这里用到的都是作为 Input/Select 的 label 传入的，而 HeroUI 给 label 套的样式在字段未获焦/未
 * 填值时是 pointer-events-none（floating label 还叠在输入框上时，避免label挡住点击输入框本身），
 * 会连带让问号图标也完全收不到鼠标/触摸事件——桌面悬停、点击，或是手机上点按，都没有反应，
 * 因为事件根本没有进来，不是 Tooltip 组件本身的问题。这里显式把 pointer-events 还原成 auto 来解决。
 * 另外触摸屏没有"悬停"这个状态，所以把触发元素换成真正可聚焦的 <button>——HeroUI Tooltip
 * 本来就同时支持 hover 和 focus 触发，点按可聚焦元素在手机浏览器上会正常触发 focus。
 * 同时挡掉点击默认行为，避免点在这个按钮上时，外层 <label> 把焦点/点击转发给它关联的
 * 输入框或下拉选单（表现为点问号却弹出了键盘或下拉菜单）。
 */
export const HelpTooltip = ({ children, content }: { children: ReactNode; content: string }) => (
  <span className="inline-flex items-center gap-1 leading-none">
    {children}
    <Tooltip content={content}>
      <button
        type="button"
        aria-label="说明"
        className="inline-flex items-center pointer-events-auto"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <IconHelp />
      </button>
    </Tooltip>
  </span>
);
