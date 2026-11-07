import { ReactNode, useState } from "react";
import { Button } from "@heroui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@heroui/popover";

import { ToastWarningIcon } from "@/components/toast-icons";

/** 按钮上方的气泡确认 */
export const PopConfirm = ({ title, onConfirm, children }: { title: string; onConfirm: () => void; children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover isOpen={open} onOpenChange={setOpen} placement="top" showArrow>
      <PopoverTrigger>{children}</PopoverTrigger>
      <PopoverContent className="px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <ToastWarningIcon />
          <span>{title}</span>
        </div>
        <div className="flex justify-end gap-2 w-full pt-2.5">
          <Button size="sm" variant="bordered" className="h-6 min-w-0 px-2 rounded-small border-1 border-default-300 font-normal" onPress={() => setOpen(false)}>取 消</Button>
          <Button size="sm" color="primary" className="h-6 min-w-0 px-2 rounded-small" onPress={() => { setOpen(false); onConfirm(); }}>确 定</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
