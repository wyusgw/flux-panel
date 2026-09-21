import React, { useEffect } from 'react';
import { useTheme } from '@heroui/use-theme';

interface ThemeProviderProps {
  children: React.ReactNode;
}

const MANUAL_PREFERENCE_KEY = 'heroui-theme-manual';

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    // 确保主题与HTML class同步
    const updateThemeClass = (currentTheme: string) => {
      if (currentTheme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.style.colorScheme = 'dark';
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.style.colorScheme = 'light';
      }
    };

    updateThemeClass(theme);
  }, [theme]);

  useEffect(() => {
    // 用户通过主题切换按钮手动选择过主题后，不再自动跟随系统主题
    let hasManualPreference = false;
    try {
      hasManualPreference = localStorage.getItem(MANUAL_PREFERENCE_KEY) === 'true';
    } catch (error) {
      // 忽略无法访问 localStorage 的情况
    }

    if (!hasManualPreference) {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      if (systemTheme !== theme) {
        setTheme(systemTheme);
      }
    }

    // 未手动选择时，继续跟随系统主题变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = (e: MediaQueryListEvent) => {
      let manual = false;
      try {
        manual = localStorage.getItem(MANUAL_PREFERENCE_KEY) === 'true';
      } catch (error) {
        // 忽略
      }
      if (!manual) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleThemeChange);
    return () => mediaQuery.removeEventListener('change', handleThemeChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
};
