import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getCachedConfigs } from '@/config/site';

/**
 * 主题风格（经典 / 透明），与明暗模式（浅色 / 深色）是两件独立的事：
 * - 经典：现有的纯色背景；
 * - 透明：用站点设置里配置的背景图铺满页面，卡片、顶栏、侧栏改为半透明并带背景模糊（样式见 globals.css 里 html.theme-transparent）。
 *
 * 由站点设置的「主题策略」决定：
 *   classic_only 仅允许经典 / transparent_only 仅允许透明 / prefer_classic 默认经典、可手动切换 / prefer_transparent 默认透明、可手动切换。
 * 要使用透明主题必须至少配置了一张背景图 URL（横屏或竖屏），否则一律回退为经典主题。
 */
export type StyleTheme = 'classic' | 'transparent';
type ThemePolicy = 'classic_only' | 'transparent_only' | 'prefer_classic' | 'prefer_transparent';

const PREFERENCE_KEY = 'flux-style-theme';
const POLICIES: ThemePolicy[] = ['classic_only', 'transparent_only', 'prefer_classic', 'prefer_transparent'];

interface StyleThemeContextValue {
  theme: StyleTheme;
  /** 策略允许手动切换（prefer_* 且透明主题可用）时为 true */
  canToggle: boolean;
  toggle: () => void;
}

const StyleThemeContext = createContext<StyleThemeContextValue>({ theme: 'classic', canToggle: false, toggle: () => {} });

export const useStyleTheme = () => useContext(StyleThemeContext);

// 背景图只允许 http(s) 或站内相对路径，且不能带引号、括号、反斜杠、空白，避免拼进 CSS 的 url(...) 后被当成别的语法
const safeBackgroundUrl = (value?: string): string => {
  const url = (value || '').trim();
  if (!url) return '';
  if (!/^(https?:\/\/|\/)[^\s"'()\\]+$/i.test(url)) return '';
  return url;
};

const readPreference = (): StyleTheme | null => {
  try {
    const value = localStorage.getItem(PREFERENCE_KEY);
    return value === 'classic' || value === 'transparent' ? value : null;
  } catch {
    return null;
  }
};

export function StyleThemeProvider({ children }: { children: ReactNode }) {
  const [policy, setPolicy] = useState<ThemePolicy>('classic_only');
  const [landscapeUrl, setLandscapeUrl] = useState('');
  const [portraitUrl, setPortraitUrl] = useState('');
  const [preference, setPreference] = useState<StyleTheme | null>(readPreference);
  const [isPortrait, setIsPortrait] = useState(() => window.matchMedia('(orientation: portrait)').matches);

  // 读取站点设置：打开页面时一次，之后管理员在站点设置里保存会触发 configUpdated 事件，再读一次
  const loadConfig = useCallback(async () => {
    try {
      const configs = await getCachedConfigs();
      const value = configs.theme_policy as ThemePolicy;
      setPolicy(POLICIES.includes(value) ? value : 'classic_only');
      setLandscapeUrl(safeBackgroundUrl(configs.transparent_theme_landscape_url));
      setPortraitUrl(safeBackgroundUrl(configs.transparent_theme_portrait_url));
    } catch {
      // 读取失败保持当前状态（默认经典主题）
    }
  }, []);

  useEffect(() => {
    loadConfig();
    window.addEventListener('configUpdated', loadConfig);
    return () => window.removeEventListener('configUpdated', loadConfig);
  }, [loadConfig]);

  useEffect(() => {
    const media = window.matchMedia('(orientation: portrait)');
    const onChange = (e: MediaQueryListEvent) => setIsPortrait(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // 当前方向对应的背景图；只配了一张时横竖屏都用它
  const backgroundUrl = (isPortrait ? portraitUrl || landscapeUrl : landscapeUrl || portraitUrl);
  const transparentAvailable = backgroundUrl !== '';

  const theme: StyleTheme = useMemo(() => {
    if (!transparentAvailable) return 'classic';
    switch (policy) {
      case 'transparent_only': return 'transparent';
      case 'prefer_transparent': return preference ?? 'transparent';
      case 'prefer_classic': return preference ?? 'classic';
      default: return 'classic';
    }
  }, [policy, preference, transparentAvailable]);

  const canToggle = transparentAvailable && (policy === 'prefer_classic' || policy === 'prefer_transparent');

  const toggle = useCallback(() => {
    const next: StyleTheme = theme === 'transparent' ? 'classic' : 'transparent';
    setPreference(next);
    try {
      localStorage.setItem(PREFERENCE_KEY, next);
    } catch {
      // 忽略无法访问 localStorage 的情况
    }
  }, [theme]);

  // 把结果同步到 <html>：透明主题加 theme-transparent 类，并把背景图写进 CSS 变量
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'transparent') {
      root.classList.add('theme-transparent');
      root.style.setProperty('--theme-bg-image', `url("${backgroundUrl}")`);
    } else {
      root.classList.remove('theme-transparent');
      root.style.removeProperty('--theme-bg-image');
    }
  }, [theme, backgroundUrl]);

  const value = useMemo(() => ({ theme, canToggle, toggle }), [theme, canToggle, toggle]);
  return <StyleThemeContext.Provider value={value}>{children}</StyleThemeContext.Provider>;
}

/** 经典 / 透明主题切换按钮：只有主题策略为「优先显示…」且透明主题可用时才显示 */
export function StyleThemeToggle({ className }: { className?: string }) {
  const { theme, canToggle, toggle } = useStyleTheme();
  if (!canToggle) return null;
  const isTransparent = theme === 'transparent';
  return (
    <button
      onClick={toggle}
      className={`p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors ${className || ''}`}
      title={isTransparent ? '切换到经典主题' : '切换到透明主题'}
      aria-label="切换经典 / 透明主题"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <circle cx="9" cy="10" r="1.6" fill={isTransparent ? 'currentColor' : 'none'} />
        <path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4" />
      </svg>
    </button>
  );
}
