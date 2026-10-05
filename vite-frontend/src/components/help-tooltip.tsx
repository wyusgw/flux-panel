import { useState, type ReactNode } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";

const IconHelp = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 9a2.5 2.5 0 114.1 1.9c-.6.5-1.1 1-1.1 1.8V13" />
    <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

/**
 * 字段标签 + 圆点问号说明：点问号显示字段说明，替代直接铺在输入框下方常驻显示的说明文字。
 *
 * 这里用到的都是作为 Input/Select 的 label 传入的，而 HeroUI 给 label 套的样式在字段未获焦/未
 * 填值时是 pointer-events-none（floating label 还叠在输入框上时，避免label挡住点击输入框本身），
 * 会连带让问号图标也完全收不到鼠标/触摸事件。这里显式把 pointer-events 还原成 auto 来解决。
 *
 * 原本用的是 HeroUI 的 Tooltip，但翻它底层 @react-aria/tooltip 的 useTooltipTrigger 源码后发现
 * 这个组件的触发逻辑天生就跟"点按"作对：onPointerDown 会直接把 tooltip 关掉/挡住（onPressStart
 * 逻辑），而 onFocus 只在 isFocusVisible()（即通过键盘 Tab 聚焦）为真时才会显示——鼠标点击或手机
 * 点按触发的 focus 一律不算。也就是说 Tooltip 只支持真正的鼠标悬停和键盘 Tab，点击/触摸从设计上
 * 就打不开，不是缺个 pointer-events 就能修好的。改用 Popover：它是基于 usePress 的标准点按开合
 * 语义，鼠标点击和手机点按行为一致，这个代码库里 shop.tsx/forward.tsx 的确认弹窗本来就是用它。
 */
export const HelpTooltip = ({ children, content }: { children: ReactNode; content: string }) => {
  // 鼠标悬停即显示；点击则固定显示（手机没有悬停，靠点按），点空白处或再次点击关闭
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  return (
    <span className="inline-flex items-center gap-1 leading-none">
      {children}
      <Popover
        placement="top"
        showArrow
        isOpen={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setPinned(false);
        }}
      >
        <PopoverTrigger>
          <button
            type="button"
            aria-label="说明"
            className="inline-flex items-center pointer-events-auto"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => { if (!pinned) setOpen(false); }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const nextPinned = !pinned;
              setPinned(nextPinned);
              setOpen(nextPinned);
            }}
          >
            <IconHelp />
          </button>
        </PopoverTrigger>
        <PopoverContent>
          <p className="max-w-64 px-1 py-1 text-xs text-foreground">{content}</p>
        </PopoverContent>
      </Popover>
    </span>
  );
};
