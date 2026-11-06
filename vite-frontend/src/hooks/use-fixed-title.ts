import { useEffect } from "react";

/**
 * 固定当前页面的浏览器标题。全站逻辑会在加载后异步把标题改回站点名，
 * 所以这里监听标题变化，被改动时立刻恢复；离开页面后不再干预。
 */
export const useFixedTitle = (title: string) => {
  useEffect(() => {
    document.title = title;
    const element = document.querySelector("title");
    if (!element) return;
    const observer = new MutationObserver(() => {
      if (document.title !== title) document.title = title;
    });
    observer.observe(element, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [title]);
};
