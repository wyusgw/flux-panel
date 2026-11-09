// 到期时间等时间戳没有配置时，后端存的是 0（或空）。0、负数以及早于 2000 年的值一律视为「没配置」。
const MIN_VALID_TIME = Date.UTC(2000, 0, 1);

export const isTimeConfigured = (timestamp?: number | null): timestamp is number =>
  typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp >= MIN_VALID_TIME;

// 到期时间的显示：没配置（为空或留空）时显示时间戳 0 对应的 1970/1/1 上午8:00:00（东八区），
// 个人中心的套餐失效和转发规则页信息条共用
export const formatExpiryTime = (timestamp?: number | null): string =>
  new Date(isTimeConfigured(timestamp) ? timestamp : 0).toLocaleString('zh-CN', { hour12: true });
