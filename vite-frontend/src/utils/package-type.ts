// 套餐类型，与后端 PackagePlan.TYPE_* 一致；durationDays 字段作「时长倍数」：月付为月数，日付为天数
export type PackageType = 'traffic' | 'traffic_stack' | 'monthly' | 'daily';

export const PACKAGE_TYPE_OPTIONS: { key: PackageType; label: string }[] = [
  { key: 'traffic', label: '不限时流量包' },
  { key: 'traffic_stack', label: '不限时流量包（可叠加）' },
  { key: 'monthly', label: '月付' },
  { key: 'daily', label: '日付' },
];

// 永久（不限时）套餐的到期时间：9999-09-09 08:09:09（UTC+8），与后端 PackagePlan.PERMANENT_EXP_TIME 一致
export const PERMANENT_EXP_TIME = 253392451749000;

// 兼容旧数据：normal / 空值时，有效天数大于 0 视为日付，否则视为不限时流量包
export const effectivePackageType = (type: string | null | undefined, durationDays?: number | null): PackageType => {
  if (PACKAGE_TYPE_OPTIONS.some(o => o.key === type)) return type as PackageType;
  return durationDays && durationDays > 0 ? 'daily' : 'traffic';
};

export const packageTypeLabel = (type: string | null | undefined, durationDays?: number | null): string =>
  PACKAGE_TYPE_OPTIONS.find(o => o.key === effectivePackageType(type, durationDays))?.label ?? '';

// 时长说明：月付「3 个月」、日付「30 天」、不限时流量包「不限时」
export const packageDurationLabel = (type: string | null | undefined, durationDays?: number | null): string => {
  const t = effectivePackageType(type, durationDays);
  const n = durationDays ?? 0;
  if (t === 'monthly') return `${n} 个月`;
  if (t === 'daily') return `${n} 天`;
  return '不限时';
};

// 购买后的新到期时间，与后端 PackagePlan.computeExpTime 一致；可叠加流量包不修改到期时间，返回 null
export const computePackageExpTime = (type: string | null | undefined, durationDays: number | null | undefined, baseExpTime: number): number | null => {
  const t = effectivePackageType(type, durationDays);
  const n = durationDays ?? 0;
  if (t === 'traffic_stack') return null;
  if (t === 'monthly' && n > 0) {
    // 自然月顺延，月末日期落到目标月最后一天（如 1/31 + 1 个月 = 2/28 或 2/29）
    const d = new Date(baseExpTime);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
    return d.getTime();
  }
  if (t === 'daily' && n > 0) return baseExpTime + n * 24 * 60 * 60 * 1000;
  return PERMANENT_EXP_TIME;
};
