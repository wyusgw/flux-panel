import { FilterFilled } from "@/components/ant-icons";
import type { ReactNode, SyntheticEvent } from "react";
import { Button } from "@heroui/button";
import { Checkbox, CheckboxGroup } from "@heroui/checkbox";
import { Input } from "@heroui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@heroui/popover";

/** 表头列的样式：不换行，列之间有竖线，最后一列没有 */
export const HEADER_COLUMN_CLASS =
  "relative whitespace-nowrap after:absolute after:right-0 after:top-1/2 after:h-4 after:w-px after:-translate-y-1/2 after:bg-default-300 last:after:hidden";

/** 配合上面的列样式使用：表头 14px 白色粗体、高 54px，单元格 14px、高 64px，去掉表头和第一行之间的空隙 */
export const HEADER_TABLE_CLASS_NAMES = {
  thead: "after:hidden",
  th: "management-table-heading !text-sm !font-semibold !text-foreground h-[54px]",
  td: "management-table-cell !text-sm h-16",
  sortIcon: "hidden",
};

const FilterIcon = () => (
  <FilterFilled />
);

// 表头里的控件不能触发所在列的排序，弹出层的事件也会沿 React 树冒泡到表头，所以统一在这里拦住
const stopHeaderEvents = {
  onPointerDown: (event: SyntheticEvent) => event.stopPropagation(),
  onMouseDown: (event: SyntheticEvent) => event.stopPropagation(),
  onClick: (event: SyntheticEvent) => event.stopPropagation(),
  onKeyDown: (event: SyntheticEvent) => event.stopPropagation(),
};

type FilterProps = {
  label: string;
  onClear: () => void;
} & (
  | { type: 'text'; text: string; onTextChange: (value: string) => void }
  | { type: 'options'; options: { value: string; label: string }[]; selected: string[]; onSelectedChange: (values: string[]) => void }
);

/** 表头的筛选漏斗：text 输入搜索，options 勾选（可多选）；生效时漏斗变蓝 */
export const TableHeaderFilter = (props: FilterProps) => {
  const { label, onClear } = props;
  const active = props.type === 'text' ? !!props.text.trim() : props.selected.length > 0;
  return (
    <span className="inline-flex" {...stopHeaderEvents}>
      <Popover placement="bottom-start">
        <PopoverTrigger>
          <button
            type="button"
            aria-label={`筛选${label}`}
            title={`筛选${label}`}
            className={`inline-flex items-center justify-center rounded p-0.5 transition-colors ${active ? 'text-primary' : 'text-default-400 hover:text-default-600'}`}
          >
            <FilterIcon />
          </button>
        </PopoverTrigger>
        <PopoverContent>
          <div className="p-2 min-w-[160px] font-normal">
            {props.type === 'text' ? (
              <Input
                autoFocus
                size="sm"
                variant="bordered"
                autoComplete="off"
                aria-label={`搜索${label}`}
                placeholder={`搜索${label}`}
                value={props.text}
                onChange={(event) => props.onTextChange(event.target.value)}
              />
            ) : (
              <div className="max-h-56 overflow-y-auto">
                <CheckboxGroup aria-label={`筛选${label}`} size="sm" value={props.selected} onValueChange={props.onSelectedChange}>
                  {props.options.map(option => <Checkbox key={option.value} value={option.value}>{option.label}</Checkbox>)}
                </CheckboxGroup>
              </div>
            )}
            <Button size="sm" variant="light" className="mt-2 w-full" isDisabled={!active} onPress={onClear}>清除筛选</Button>
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
};

/** 表头内容：标题靠左，筛选等控件靠右 */
export const HeaderCell = ({ label, children }: { label: string; children?: ReactNode }) => (
  <div className="flex items-center justify-between gap-2.5">
    <span>{label}</span>
    {children}
  </div>
);
