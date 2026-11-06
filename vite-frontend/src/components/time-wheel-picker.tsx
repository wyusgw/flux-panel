import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@heroui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";

const ITEM_HEIGHT = 36;
const VISIBLE_ITEMS = 5;

const pad = (value: number) => String(value).padStart(2, "0");

/** 一列滚轮：滑动后停在哪一项就选中哪一项，也可以直接点某一项或用方向键 */
function WheelColumn({ label, count, value, onChange }: {
  label: string;
  count: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout>>();
  const latestValue = useRef(value);
  latestValue.current = value;

  // 打开时直接定位，不播放滚动动画
  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = value * ITEM_HEIGHT;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 点选、方向键时滚到对应位置
  useEffect(() => {
    const list = listRef.current;
    if (!list || Math.round(list.scrollTop / ITEM_HEIGHT) === value) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({ top: value * ITEM_HEIGHT, behavior: reduceMotion ? "auto" : "smooth" });
  }, [value]);

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const handleScroll = () => {
    clearTimeout(settleTimer.current);
    // 滚动过程中不更新，停下来才算选中
    settleTimer.current = setTimeout(() => {
      if (!listRef.current) return;
      const index = Math.round(listRef.current.scrollTop / ITEM_HEIGHT);
      const next = Math.max(0, Math.min(count - 1, index));
      if (next !== latestValue.current) onChange(next);
    }, 120);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    onChange(Math.max(0, Math.min(count - 1, value + (event.key === "ArrowDown" ? 1 : -1))));
  };

  const padding = ((VISIBLE_ITEMS - 1) / 2) * ITEM_HEIGHT;

  return (
    <div className="flex-1 min-w-0">
      <div className="pb-1.5 text-center text-xs text-default-500">{label}</div>
      <div
        ref={listRef}
        role="listbox"
        aria-label={label}
        tabIndex={0}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        className="relative overflow-y-auto overscroll-contain snap-y snap-mandatory rounded-medium outline-none focus-visible:ring-2 focus-visible:ring-primary [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ height: VISIBLE_ITEMS * ITEM_HEIGHT, paddingTop: padding, paddingBottom: padding }}
      >
        {Array.from({ length: count }, (_, index) => (
          <button
            key={index}
            type="button"
            role="option"
            aria-selected={index === value}
            tabIndex={-1}
            onClick={() => onChange(index)}
            className={`block w-full snap-center text-center text-sm tabular-nums transition-colors ${index === value ? "font-semibold text-foreground" : "text-default-400 hover:text-default-600"}`}
            style={{ height: ITEM_HEIGHT }}
          >
            {pad(index)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 时刻选择：显示为 00:00（时:分），点开后在两列滚轮上滑动或点选
 */
export function TimeWheelPicker({ value, onChange, ariaLabel }: {
  value: string;
  onChange: (time: string) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText) || 0;
  const minute = Number(minuteText) || 0;

  return (
    <Popover isOpen={open} onOpenChange={setOpen} placement="bottom">
      <PopoverTrigger>
        <Button variant="bordered" aria-label={ariaLabel} className="w-full justify-between font-normal">
          <span className="tabular-nums text-foreground">{`${pad(hour)}:${pad(minute)}`}</span>
          <svg className="w-4 h-4 text-default-500" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
          </svg>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-3">
        <div className="relative flex gap-2 w-44">
          {/* 选中项的高亮条：位于每列正中，上面留出列标题的高度 */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 rounded-medium bg-default-100 pointer-events-none"
            style={{ top: 22 + ((VISIBLE_ITEMS - 1) / 2) * ITEM_HEIGHT, height: ITEM_HEIGHT }}
          />
          <WheelColumn label="时" count={24} value={hour} onChange={(next) => onChange(`${pad(next)}:${pad(minute)}`)} />
          <WheelColumn label="分" count={60} value={minute} onChange={(next) => onChange(`${pad(hour)}:${pad(next)}`)} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
