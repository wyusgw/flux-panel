import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeSwitch } from '@/components/theme-switch';
import { UserMenu } from '@/components/user-menu';
import { siteConfig } from '@/config/site';
import { safeLogout } from '@/utils/logout';

/**
 * 独立窗口布局：没有左侧导航，只有顶栏（站点名称、用户菜单、主题切换）和内容区，
 * 用于在新窗口里单独打开的页面（如管理员「用户转发规则」），整个窗口只服务于这一个页面。
 */
export default function StandaloneLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const username = localStorage.getItem('name') || 'Admin';

  const handleLogout = () => {
    safeLogout();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100 dark:bg-black">
      <header className="app-topbar h-16 flex items-center justify-between px-4 sm:px-6 shrink-0">
        <h1 className="app-topbar-brand text-foreground truncate">{siteConfig.name}</h1>
        <div className="flex items-center gap-4 shrink-0 ml-3">
          <UserMenu username={username} onLogout={handleLogout} />
          <ThemeSwitch />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
