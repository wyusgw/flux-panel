// 套餐类型，与后端 PackagePlan.TYPE_* 一致；durationDays 字段作「时长倍数」：
// 日付为天数、周付为周数、月付为月数、半年付为半年数、一年付为年数
export type PackageType = 'traffic' | 'traffic_stack' | 'daily' | 'weekly' | 'monthly' | 'semiannual' | 'yearly';

export const PACKAGE_TYPE_OPTIONS: { key: PackageType; label: string }[] = [
  { key: 'traffic', label: '不限时流量包' },
  { key: 'traffic_stack', label: '不限时流量包（可叠加）' },
  { key: 'daily', label: '日付' },
  { key: 'weekly', label: '周付' },
  { key: 'monthly', label: '月付' },
  { key: 'semiannual', label: '半年付' },
  { key: 'yearly', label: '一年付' },
];

// 按时长倍数顺延到期时间的类型，及时长倍数的单位
export const DURATION_TYPE_UNITS: Partial<Record<PackageType, string>> = {
  daily: '天',
  weekly: '周',
  monthly: '个月',
  semiannual: '× 6 个月',
  yearly: '年',
};
export const isDurationType = (type: string | null | undefined): boolean => !!type && type in DURATION_TYPE_UNITS;

// 时长倍数输入框的说明
export const DURATION_TYPE_TIPS: Partial<Record<PackageType, string>> = {
  daily: '购买一次顺延的天数',
  weekly: '购买一次顺延的周数（每周 7 天）',
  monthly: '购买一次顺延的月数，按自然月计算',
  semiannual: '购买一次顺延几个半年（每个半年 6 个自然月）',
  yearly: '购买一次顺延的年数，按自然月计算（每年 12 个月）',
};

// 每一倍对应的自然月数（月付 / 半年付 / 一年付）和天数（日付 / 周付）
const MONTHS_PER_UNIT: Partial<Record<PackageType, number>> = { monthly: 1, semiannual: 6, yearly: 12 };
const DAYS_PER_UNIT: Partial<Record<PackageType, number>> = { daily: 1, weekly: 7 };

// 永久（不限时）套餐的到期时间：9999-09-09 08:09:09（UTC+8），与后端 PackagePlan.PERMANENT_EXP_TIME 一致
export const PERMANENT_EXP_TIME = 253392451749000;

// 兼容旧数据：normal / 空值时，有效天数大于 0 视为日付，否则视为不限时流量包
export const effectivePackageType = (type: string | null | undefined, durationDays?: number | null): PackageType => {
  if (PACKAGE_TYPE_OPTIONS.some(o => o.key === type)) return type as PackageType;
  return durationDays && durationDays > 0 ? 'daily' : 'traffic';
};

export const packageTypeLabel = (type: string | null | undefined, durationDays?: number | null): string =>
  PACKAGE_TYPE_OPTIONS.find(o => o.key === effectivePackageType(type, durationDays))?.label ?? '';

// 时长说明：日付「30 天」、周付「2 周」、月付「3 个月」、半年付「6 个月」、一年付「1 年」、不限时流量包「不限时」
export const packageDurationLabel = (type: string | null | undefined, durationDays?: number | null): string => {
  const t = effectivePackageType(type, durationDays);
  const n = durationDays ?? 0;
  if (t === 'daily') return `${n} 天`;
  if (t === 'weekly') return `${n} 周`;
  if (t === 'monthly') return `${n} 个月`;
  if (t === 'semiannual') return `${n * 6} 个月`;
  if (t === 'yearly') return `${n} 年`;
  return '不限时';
};

// 购买后的新到期时间，与后端 PackagePlan.computeExpTime 一致；可叠加流量包不修改到期时间，返回 null
export const computePackageExpTime = (type: string | null | undefined, durationDays: number | null | undefined, baseExpTime: number): number | null => {
  const t = effectivePackageType(type, durationDays);
  const n = durationDays ?? 0;
  if (t === 'traffic_stack') return null;
  const months = n * (MONTHS_PER_UNIT[t] ?? 0);
  if (months > 0) {
    // 自然月顺延，月末日期落到目标月最后一天（如 1/31 + 1 个月 = 2/28 或 2/29）
    const d = new Date(baseExpTime);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
    return d.getTime();
  }
  const days = n * (DAYS_PER_UNIT[t] ?? 0);
  if (days > 0) return baseExpTime + days * 24 * 60 * 60 * 1000;
  return PERMANENT_EXP_TIME;
};
