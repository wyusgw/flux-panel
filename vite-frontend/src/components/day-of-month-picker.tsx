import { useState } from "react";
import { Button } from "@heroui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";

const IconCalendar = () => (
  <svg className="w-4 h-4 text-default-500" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

/**
 * 每月第几日的日历式选择：点击后弹出 1-31 的日历网格，选中即生效。
 * value 为空时视为 defaultDay（站点设置里「留空按默认处理」的约定）。
 */
export function DayOfMonthPicker({
  value,
  onChange,
  defaultDay = 1,
  isChanged = false,
}: {
  value: string;
  onChange: (value: string) => void;
  defaultDay?: number;
  isChanged?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const parsed = parseInt(value, 10);
  const selected = parsed >= 1 && parsed <= 31 ? parsed : defaultDay;

  return (
    <Popover placement="bottom-start" isOpen={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button
          variant="bordered"
          className={`w-full justify-between font-normal ${isChanged ? 'border-warning-300' : ''}`}
          endContent={<IconCalendar />}
        >
          每月 {selected} 日
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="p-2">
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => {
                  onChange(String(day));
                  setOpen(false);
                }}
                className={`w-9 h-9 rounded-lg text-sm transition-colors ${
                  day === selected
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-foreground hover:bg-default-100'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
