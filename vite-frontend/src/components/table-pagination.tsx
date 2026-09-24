import { Select, SelectItem } from "@heroui/select";
import { Button } from "@heroui/button";

interface TablePaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

export const TablePagination = ({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50]
}: TablePaginationProps) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex items-center justify-end gap-3 px-4 py-3 text-sm text-default-500 flex-wrap">
      <span>共 {total} 条</span>
      <div className="flex items-center gap-1">
        <Button
          isIconOnly
          size="sm"
          variant="light"
          isDisabled={page <= 1}
          onPress={() => onPageChange(page - 1)}
          aria-label="上一页"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.5 15l-5-5 5-5" />
          </svg>
        </Button>
        <span className="min-w-[28px] h-7 px-2 flex items-center justify-center rounded-md bg-primary/10 text-primary font-medium">
          {page}
        </span>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          isDisabled={page >= totalPages}
          onPress={() => onPageChange(page + 1)}
          aria-label="下一页"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7.5 5l5 5-5 5" />
          </svg>
        </Button>
      </div>
      <Select
        size="sm"
        className="w-28"
        aria-label="每页条数"
        selectedKeys={[String(pageSize)]}
        onSelectionChange={(keys) => {
          const value = Array.from(keys)[0];
          if (value) onPageSizeChange(Number(value));
        }}
      >
        {pageSizeOptions.map((size) => (
          <SelectItem key={String(size)}>{`${size} 条/页`}</SelectItem>
        ))}
      </Select>
    </div>
  );
};
