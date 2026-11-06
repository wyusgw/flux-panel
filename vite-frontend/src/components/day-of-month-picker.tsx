import { useState } from "react";
import { Input } from "@heroui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";

const IconCalendar = () => (
  <svg className="w-4 h-4 text-default-500" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

/**
 * 每月第几日的选择：可以直接在输入框里手动输入 1-31，也可以点右侧日历图标弹出日历网格点选。
 * 日历网格只显示当前月份实际存在的日期（如 2 月只到 28/29，小月只到 30），不显示多余的日期；
 * 手动输入不受当月天数限制（月末重置的场景需要能设 29-31 日），超过本月天数时提示本月按月末处理。
 * value 为空时视为 defaultDay（站点设置里「留空按默认处理」的约定）。
 */
export function DayOfMonthPicker({
  value,
  onChange,
  defaultDay = 1,
  isChanged = false,
  size = 'md',
  label,
  description,
}: {
  value: string;
  onChange: (value: string) => void;
  defaultDay?: number;
  isChanged?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** 表单里与相邻输入框（如时间输入框）保持同样的浮动标签与说明文字样式时传入 */
  label?: string;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  // 手动输入过程中的草稿；为 null 时输入框显示已生效的日期
  const [draft, setDraft] = useState<string | null>(null);
  const parsed = parseInt(value, 10);
  const selected = parsed >= 1 && parsed <= 31 ? parsed : defaultDay;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const handleInput = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    setDraft(digits);
    const n = parseInt(digits, 10);
    // 输入到合法的 1-31 就立即生效；输入中途的 0、空串先不提交，失焦时恢复为已生效的日期
    if (n >= 1 && n <= 31) onChange(String(n));
  };

  return (
    <Input
      size={size}
      label={label}
      description={description}
      // 输入的日期本月不存在（如 11 月输入 31）：红字提示，但输入仍然保留并生效，到时按本月月底重置
      isInvalid={selected > daysInMonth}
      errorMessage={`${now.getMonth() + 1} 月没有 ${selected} 日，本月将在月底（${now.getMonth() + 1} 月 ${daysInMonth} 日）重置`}
      variant="bordered"
      inputMode="numeric"
      autoComplete="off"
      value={draft ?? String(selected)}
      onValueChange={handleInput}
      onBlur={() => setDraft(null)}
      // 带标签的表单样式与时间输入框一致：标签在上、数值在下左对齐、日历图标在右；无标签时保持「每月 N 日」的紧凑样式
      startContent={label ? undefined : <span className="text-sm text-default-500 whitespace-nowrap">每月</span>}
      classNames={{
        input: label ? 'font-medium' : 'text-center',
        inputWrapper: isChanged ? 'border-warning-300 data-[hover=true]:border-warning-400' : '',
      }}
      endContent={
        <div className="flex items-center gap-1">
          {!label && <span className="text-sm text-default-500">日</span>}
          <Popover placement="bottom-end" isOpen={open} onOpenChange={setOpen}>
            <PopoverTrigger>
              <button type="button" aria-label="选择日期" className="p-1 rounded-md hover:bg-default-100">
                <IconCalendar />
              </button>
            </PopoverTrigger>
            <PopoverContent>
              <div className="p-2">
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        setDraft(null);
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
        </div>
      }
    />
  );
}
