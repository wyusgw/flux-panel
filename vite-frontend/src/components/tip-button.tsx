import { Button, ButtonProps } from "@heroui/button";
import { Tooltip } from "@heroui/tooltip";

interface TipButtonProps extends ButtonProps {
  /** 悬停时显示的提示，同时作为读屏软件读出的按钮名称 */
  title?: string;
}

/** 图标按钮：鼠标悬停时在上方显示深色提示，代替浏览器自带的 title */
export const TipButton = ({ title, ...props }: TipButtonProps) => {
  if (!title) return <Button {...props} />;
  return (
    <Tooltip
      content={title}
      placement="top"
      showArrow
      delay={100}
      closeDelay={0}
      offset={8}
      classNames={{
        base: "before:bg-[#424242] before:dark:bg-[#424242]",
        content: "min-h-[34px] rounded-md bg-[#424242] px-2 py-1.5 text-sm text-white shadow-medium",
      }}
    >
      <Button aria-label={title} {...props} />
    </Tooltip>
  );
};
