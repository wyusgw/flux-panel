import type { SortDescriptor } from "@heroui/table";

/** 排序图标：上下两个三角始终显示，当前排序方向高亮 */
export const SortCarets = ({ direction }: { direction?: SortDescriptor['direction'] }) => (
  <svg className="w-2.5 h-3.5 flex-shrink-0" viewBox="0 0 10 14" aria-hidden="true">
    <path d="M5 0l4.2 5.5H.8z" fill="currentColor" className={direction === 'ascending' ? 'text-primary' : 'text-default-400'} />
    <path d="M5 14L.8 8.5h8.4z" fill="currentColor" className={direction === 'descending' ? 'text-primary' : 'text-default-400'} />
  </svg>
);

/** 可排序列的表头内容：标题 + 排序图标。表格 classNames 要设置 sortIcon: "hidden" 隐藏自带的图标 */
export const SortableHeader = ({ label, columnKey, sort }: { label: string; columnKey: string; sort?: SortDescriptor }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
    {label}
    <SortCarets direction={sort?.column === columnKey ? sort.direction : undefined} />
  </span>
);

/** 排序三态：升序 → 降序 → 取消。把表格 onSortChange 给的值换算成下一个状态，undefined 表示恢复默认顺序 */
export const nextSort = (current: SortDescriptor | undefined, next: SortDescriptor): SortDescriptor | undefined =>
  current?.column === next.column && current?.direction === 'descending' ? undefined : next;
