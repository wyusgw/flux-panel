import { useState } from "react";
import { Button } from "@heroui/button";

interface RefreshButtonProps {
  /** 点击后执行的刷新逻辑；返回的 Promise 结束前按钮图标一直转圈 */
  onRefresh: () => Promise<unknown> | void;
  /** 外部已自行维护刷新状态时传入，未传则组件内部维护 */
  refreshing?: boolean;
  isDisabled?: boolean;
}

const MIN_SPIN_MS = 700;

/**
 * 全站统一的「刷新」按钮：描边样式 + 刷新图标，点击后仅图标转圈、不切换为整页加载状态，
 * 期间按钮不可重复点击；至少转满一圈，避免请求太快看不到反馈。
 */
export default function RefreshButton({ onRefresh, refreshing, isDisabled }: RefreshButtonProps) {
  const [innerRefreshing, setInnerRefreshing] = useState(false);
  const spinning = refreshing ?? innerRefreshing;

  const handlePress = async () => {
    if (spinning) return;
    setInnerRefreshing(true);
    try {
      await Promise.all([Promise.resolve(onRefresh()), new Promise(resolve => setTimeout(resolve, MIN_SPIN_MS))]);
    } finally {
      setInnerRefreshing(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="bordered"
      isDisabled={isDisabled || spinning}
      startContent={
        <svg className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.6 15a8 8 0 0014.4 2.6M19.4 9A8 8 0 005 6.4" />
        </svg>
      }
      onPress={handlePress}
    >
      刷新
    </Button>
  );
}
