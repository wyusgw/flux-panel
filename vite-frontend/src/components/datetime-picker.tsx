import { useEffect, useRef, useState } from "react";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";

const pad = (value: number) => String(value).padStart(2, "0");
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const ITEM_HEIGHT = 28;

const format = (date: Date) =>
  `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

/** 解析 YYYY-MM-DD HH:mm:ss（时间部分可省略，省略时取 23:59:59），日期不存在（如 2 月 30 日）时返回 null */
const parse = (text: string): Date | null => {
  const match = text.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] === undefined ? 23 : Number(match[4]);
  const minute = match[5] === undefined ? 59 : Number(match[5]);
  const second = match[6] === undefined ? (match[4] === undefined ? 59 : 0) : Number(match[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  const date = new Date(year, month - 1, day, hour, minute, second);
  return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
};

const Chevron = ({ direction, double }: { direction: "left" | "right"; double?: boolean }) => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    {direction === "left"
      ? (double ? <path d="M12 6l-6 6 6 6M19 6l-6 6 6 6" /> : <path d="M15 6l-6 6 6 6" />)
      : (double ? <path d="M12 6l6 6-6 6M5 6l6 6-6 6" /> : <path d="M9 6l6 6-6 6" />)}
  </svg>
);

const IconCalendar = () => (
  <svg className="w-4 h-4 text-default-500" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

const IconClear = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="currentColor" />
    <path d="M9 9l6 6M15 9l-6 6" className="stroke-content1" fill="none" strokeWidth={1.8} strokeLinecap="round" />
  </svg>
);

/** 时 / 分 / 秒的一列：点选，打开时自动滚到当前选中项 */
function TimeColumn({ label, count, value, onChange }: { label: string; count: number; value: number; onChange: (value: number) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    // 让选中项大致落在列的中间；手机上列更矮，按实际高度算
    if (list) list.scrollTop = Math.max(0, value * ITEM_HEIGHT - (list.clientHeight - ITEM_HEIGHT) / 2);
    // 只在打开时和值变化时定位
  }, [value]);
  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={label}
      className="h-[140px] min-w-0 flex-1 overflow-y-auto sm:h-[252px] sm:w-14 sm:flex-none overscroll-contain py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {Array.from({ length: count }, (_, index) => (
        <button
          key={index}
          type="button"
          role="option"
          aria-selected={index === value}
          onClick={() => onChange(index)}
          className={`block w-full rounded-small text-center text-sm tabular-nums transition-colors ${index === value ? "bg-primary/15 font-semibold text-foreground" : "text-default-600 hover:bg-default-100"}`}
          style={{ height: ITEM_HEIGHT }}
        >
          {pad(index)}
        </button>
      ))}
    </div>
  );
}

/**
 * 日期时间选择：输入框可以直接输入 YYYY-MM-DD HH:mm:ss，也可以点开后选日期和时分秒；右侧带清除按钮，
 * 清空表示没有时间（调用方自行约定含义，例如“永不过期”）。弹层左边是月历，右边是时分秒三列，
 * 底部「此刻」填入当前时间，「确定」关闭弹层。没有选过时间时，点选日期默认取当天 23:59:59
 */
export function DateTimePicker({ value, onChange, ariaLabel, placeholder = "选择日期时间" }: {
  value: Date | null;
  onChange: (value: Date | null) => void;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  // 手动输入过程中的草稿；为 null 时输入框显示已生效的值
  const [draft, setDraft] = useState<string | null>(null);
  // 月历正在显示的月份（和选中的日期分开，翻月不改变选择）
  const [view, setView] = useState(() => value ?? new Date());

  const base = value ?? new Date(view.getFullYear(), view.getMonth(), 1, 23, 59, 59);
  const shown = draft ?? (value ? format(value) : "");

  const commit = (date: Date) => {
    setDraft(null);
    setView(date);
    onChange(date);
  };

  const shiftMonths = (months: number) => {
    const next = new Date(view.getFullYear(), view.getMonth() + months, 1);
    setView(next);
  };

  const pickDay = (year: number, month: number, day: number) => {
    const date = new Date(year, month, day, base.getHours(), base.getMinutes(), base.getSeconds());
    commit(date);
  };

  const pickTime = (part: "h" | "m" | "s", next: number) => {
    const date = new Date(base);
    if (part === "h") date.setHours(next);
    if (part === "m") date.setMinutes(next);
    if (part === "s") date.setSeconds(next);
    commit(date);
  };

  const handleInput = (text: string) => {
    setDraft(text);
    if (text.trim() === "") {
      onChange(null);
      return;
    }
    const parsed = parse(text);
    if (parsed) {
      setView(parsed);
      onChange(parsed);
    }
  };

  // 月历：补齐到整周，前后月份的日期用浅色显示，点一下就跳到那天
  const year = view.getFullYear();
  const month = view.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, month, 1 - firstWeekday + index);
    return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate(), inMonth: date.getMonth() === month };
  });
  const now = new Date();

  return (
    <Popover
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setView(value ?? new Date());
        // 关闭时输入框里没写完整的内容恢复成已生效的值
        if (!next) setDraft(null);
      }}
      placement="bottom-start"
      shouldCloseOnInteractOutside={() => true}
    >
      <PopoverTrigger>
        <div className="w-full">
          <Input
            aria-label={ariaLabel}
            variant="bordered"
            placeholder={placeholder}
            value={shown}
            onValueChange={handleInput}
            classNames={{ inputWrapper: "group" }}
            // 默认显示日历图标；已有值时，鼠标悬停或弹层打开后同一位置换成清除（叉）按钮
            endContent={(
              <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                <span className={value ? (open ? "opacity-0" : "group-hover:opacity-0") : ""}><IconCalendar /></span>
                {value && (
                  <button
                    type="button"
                    aria-label="清除"
                    // 不能把点击传给外层，否则会同时触发弹层的打开/关闭
                    onPointerDown={(event) => event.stopPropagation()}
                    onPointerUp={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setDraft(null);
                      onChange(null);
                    }}
                    className={`absolute inset-0 flex items-center justify-center rounded-full text-default-400 transition-opacity hover:text-default-600 ${open ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                  >
                    <IconClear />
                  </button>
                )}
              </span>
            )}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <div className="flex w-[min(300px,calc(100vw-32px))] flex-col sm:w-auto">
        <div className="flex flex-col sm:flex-row">
          <div className="w-full p-3 sm:w-[260px]">
            <div className="flex items-center justify-between pb-2 text-sm font-semibold">
              <div className="flex text-default-500">
                <button type="button" aria-label="上一年" className="p-1 hover:text-foreground" onClick={() => shiftMonths(-12)}><Chevron direction="left" double /></button>
                <button type="button" aria-label="上一月" className="p-1 hover:text-foreground" onClick={() => shiftMonths(-1)}><Chevron direction="left" /></button>
              </div>
              <span className="tabular-nums">{year}年 {month + 1}月</span>
              <div className="flex text-default-500">
                <button type="button" aria-label="下一月" className="p-1 hover:text-foreground" onClick={() => shiftMonths(1)}><Chevron direction="right" /></button>
                <button type="button" aria-label="下一年" className="p-1 hover:text-foreground" onClick={() => shiftMonths(12)}><Chevron direction="right" double /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 text-center text-xs text-default-500">
              {WEEKDAYS.map((name) => <div key={name} className="py-1.5">{name}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5 text-center text-sm tabular-nums">
              {cells.map((cell) => {
                const selected = !!value && value.getFullYear() === cell.year && value.getMonth() === cell.month && value.getDate() === cell.day;
                const today = now.getFullYear() === cell.year && now.getMonth() === cell.month && now.getDate() === cell.day;
                return (
                  <button
                    key={`${cell.year}-${cell.month}-${cell.day}`}
                    type="button"
                    onClick={() => pickDay(cell.year, cell.month, cell.day)}
                    className={`mx-auto h-8 w-8 rounded-small sm:h-7 sm:w-7 transition-colors ${selected ? "bg-primary text-primary-foreground" : `hover:bg-default-100 ${cell.inMonth ? "text-foreground" : "text-default-300"} ${today ? "ring-1 ring-primary" : ""}`}`}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="border-t border-default-200 sm:border-l sm:border-t-0">
            <div className="border-b border-default-200 px-3 py-2 text-center text-sm font-semibold tabular-nums">
              {format(base)}
            </div>
            <div className="flex px-1 pb-1">
              <TimeColumn label="时" count={24} value={base.getHours()} onChange={(next) => pickTime("h", next)} />
              <TimeColumn label="分" count={60} value={base.getMinutes()} onChange={(next) => pickTime("m", next)} />
              <TimeColumn label="秒" count={60} value={base.getSeconds()} onChange={(next) => pickTime("s", next)} />
            </div>
          </div>
        </div>
        <div className="flex w-full items-center justify-between border-t border-default-200 px-3 py-2">
          <button type="button" className="text-sm text-primary hover:opacity-80" onClick={() => commit(new Date())}>此刻</button>
          <Button size="sm" color="primary" className="h-6 min-w-0 px-3" onPress={() => setOpen(false)}>确定</Button>
        </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
