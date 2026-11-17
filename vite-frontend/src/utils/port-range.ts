// 设备的端口范围在表单里用一个「起始-结束」输入框填写，设备管理和单端隧道共用

/** 留空时使用的默认端口范围 */
export const DEFAULT_PORT_STA = 1000;
export const DEFAULT_PORT_END = 65535;

export const PORT_RANGE_ERROR = '端口范围格式应为「起始-结束」，如 2000-65535，且在 1-65535 之间、起始不大于结束';

/** 解析「起始-结束」格式的端口范围，格式不对或超出 1-65535、起始大于结束时返回 null */
export const parsePortRange = (text: string): [number, number] | null => {
  const m = text.trim().match(/^(\d{1,5})\s*-\s*(\d{1,5})$/);
  if (!m) return null;
  const sta = Number(m[1]), end = Number(m[2]);
  if (sta < 1 || end > 65535 || sta > end) return null;
  return [sta, end];
};
