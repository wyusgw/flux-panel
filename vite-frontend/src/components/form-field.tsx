import React from "react";
import { HelpTooltip } from "@/components/help-tooltip";

/** 表单字段标题：显示在输入框上方，可带必填星号与帮助提示（「标题在上、输入框在下」的单列表单） */
export const FieldLabel = ({ children, tip, required }: { children: React.ReactNode; tip?: string; required?: boolean }) => (
  <p className="mb-1.5 text-sm font-semibold text-foreground">
    {tip ? <HelpTooltip content={tip}>{children}</HelpTooltip> : children}
    {required && <span className="ml-0.5 text-danger">*</span>}
  </p>
);

/** 带单位的输入框：单位贴在输入框右侧，与输入框边框连成一体（输入框需自行把右侧圆角去掉） */
export const UnitField = ({ unit, children }: { unit: string; children: React.ReactNode }) => (
  <div className="flex items-stretch">
    <div className="flex-1 min-w-0">{children}</div>
    <div className="flex items-center px-4 rounded-r-medium border-2 border-l-0 border-default-200 bg-default-100 dark:bg-default-50/10 text-sm text-default-500">
      {unit}
    </div>
  </div>
);
