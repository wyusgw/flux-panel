import { ReactElement, ReactNode, useEffect, useRef, useState } from "react";
import { Dropdown, DropdownTrigger } from "@heroui/dropdown";

const OPEN_DELAY_MS = 100;
const CLOSE_DELAY_MS = 200;
const CONTENT_CLASS = "hover-dropdown-content";

interface HoverDropdownProps {
  /** 触发按钮 */
  trigger: ReactElement;
  /** DropdownMenu */
  children: ReactElement;
  /** 菜单打开时调用，可用来提前加载数据 */
  onOpen?: () => void;
}

/**
 * 鼠标悬停或点击都能打开的下拉菜单。
 * 悬停打开时，鼠标移开触发按钮和菜单后自动收起；点击后固定，再次点击或点击其他地方才收起。
 * 触屏没有悬停，只响应点击。
 */
export const HoverDropdown = ({ trigger, children, onOpen }: HoverDropdownProps): ReactNode => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const openedByHover = useRef(false);
  const triggerPressed = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const clearTimer = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  };

  useEffect(() => clearTimer, []);

  // 菜单渲染在页面最外层，不是按钮的子元素，所以用全局指针位置判断鼠标是否还在按钮或菜单上
  useEffect(() => {
    if (!open) return;
    const onMove = (event: PointerEvent) => {
      if (!openedByHover.current || event.pointerType !== 'mouse') return;
      const target = event.target as Element | null;
      const inside = !!target && (!!wrapperRef.current?.contains(target) || !!target.closest(`.${CONTENT_CLASS}`));
      if (inside) {
        clearTimer();
      } else if (timer.current === undefined) {
        timer.current = window.setTimeout(() => {
          timer.current = undefined;
          openedByHover.current = false;
          setOpen(false);
        }, CLOSE_DELAY_MS);
      }
    };
    document.addEventListener('pointermove', onMove);
    return () => document.removeEventListener('pointermove', onMove);
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    clearTimer();
    // 悬停已打开时点击按钮：保持打开并固定，不要被点击切换成关闭
    if (!next && triggerPressed.current && openedByHover.current) {
      openedByHover.current = false;
      return;
    }
    if (next) {
      openedByHover.current = false;
      onOpen?.();
    }
    setOpen(next);
  };

  return (
    <span
      ref={wrapperRef}
      className="inline-flex"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse' || open) return;
        clearTimer();
        timer.current = window.setTimeout(() => {
          timer.current = undefined;
          openedByHover.current = true;
          onOpen?.();
          setOpen(true);
        }, OPEN_DELAY_MS);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse' && !open) clearTimer();
      }}
      onPointerDownCapture={(event) => {
        // 菜单的事件也会沿 React 树冒泡到这里，只记录真正按在按钮上的情况
        triggerPressed.current = !!wrapperRef.current?.contains(event.target as Node);
        if (triggerPressed.current && !open) clearTimer();
      }}
      // 下拉菜单在松开之后才切换开关，所以标记要留到这次点击处理完
      onPointerUpCapture={() => { window.setTimeout(() => { triggerPressed.current = false; }, 50); }}
    >
      <Dropdown placement="bottom-start" offset={8} isOpen={open} onOpenChange={handleOpenChange} classNames={{ content: CONTENT_CLASS }}>
        <DropdownTrigger>{trigger}</DropdownTrigger>
        {children}
      </Dropdown>
    </span>
  );
};
