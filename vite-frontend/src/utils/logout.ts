// 退出登录时需要保留的界面偏好：手动选择的明亮/暗黑主题（HeroUI 保存的主题和「已手动选择」标记）、界面风格。
// 不保留的话，退出后回到登录页会退回系统主题，手动选的明亮模式就丢了
const PRESERVED_KEYS = ['heroui-theme', 'heroui-theme-manual', 'flux-style-theme'];

/**
 * 安全退出登录函数
 * 清除登录相关数据，但保留用户偏好设置（如主题）
 */
export const safeLogout = () => {
  const preserved: Array<[string, string]> = [];
  for (const key of PRESERVED_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) preserved.push([key, value]);
  }
  localStorage.clear();
  for (const [key, value] of preserved) {
    localStorage.setItem(key, value);
  }
};
