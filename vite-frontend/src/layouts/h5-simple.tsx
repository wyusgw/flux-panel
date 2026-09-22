import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from "@heroui/button";

import { Logo } from '@/components/icons';
import { ThemeSwitch } from '@/components/theme-switch';
import { siteConfig } from '@/config/site';
import { primaryNavItems, managementNavItems } from '@/config/nav-items';
import { safeLogout } from '@/utils/logout';

export default function H5SimpleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    // 兼容处理：如果没有admin字段，根据role_id判断（0为管理员）
    let adminFlag = localStorage.getItem('admin') === 'true';
    if (localStorage.getItem('admin') === null) {
      const roleId = parseInt(localStorage.getItem('role_id') || '1', 10);
      adminFlag = roleId === 0;
      localStorage.setItem('admin', adminFlag.toString());
    }
    setIsAdmin(adminFlag);
  }, []);

  const filteredPrimaryNavItems = primaryNavItems.filter(item => !item.adminOnly || isAdmin);
  const filteredManagementNavItems = managementNavItems.filter(item => !item.adminOnly || isAdmin);

  const handleMenuNavigate = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  const handleLogout = () => {
    setMenuOpen(false);
    safeLogout();
  };

  // 路由切换时回到顶部，避免上一页滚动位置保留；同时关闭导航菜单
  React.useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch (e) {
      window.scrollTo(0, 0);
    }
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    setMenuOpen(false);
  }, [location.pathname]);

  const handleBack = () => {
    navigate('/dashboard');
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-black">
      {/* 顶部导航栏 */}
      <header className="bg-white dark:bg-black shadow-sm border-b border-gray-200 dark:border-gray-600 h-14 safe-top flex-shrink-0 flex items-center justify-between px-4 relative z-10">
        <div className="flex items-center gap-2">
          <Button
            isIconOnly
            variant="light"
            size="sm"
            onPress={handleBack}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </Button>
          <Logo size={20} />
          <h1 className="text-sm font-bold text-foreground">{siteConfig.name}</h1>
        </div>

        <div className="flex items-center gap-2">
          <ThemeSwitch />
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="打开导航菜单"
            className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </header>

      {/* 导航菜单抽屉 */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-200 ${menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        aria-hidden={!menuOpen}
      >
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={() => setMenuOpen(false)}
        />
        <div
          className={`absolute top-0 right-0 bottom-0 w-[78%] max-w-[300px] bg-white dark:bg-black shadow-xl safe-top flex flex-col transition-transform duration-200 ${menuOpen ? 'translate-x-0' : 'translate-x-full'}`}
        >
          <div className="h-14 flex items-center gap-2 px-4 border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
            <Logo size={20} />
            <h1 className="text-sm font-bold text-foreground">{siteConfig.name}</h1>
          </div>
          <nav className="flex-1 overflow-y-auto py-2">
            {filteredPrimaryNavItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => handleMenuNavigate(item.path)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${isActive ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'text-gray-700 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800'}`}
                >
                  {item.icon}
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            })}

            {filteredManagementNavItems.length > 0 && (
              <>
                <div className="px-4 pt-4 pb-1 text-xs font-semibold text-gray-400 dark:text-gray-500">管理</div>
                {filteredManagementNavItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => handleMenuNavigate(item.path)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${isActive ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'text-gray-700 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800'}`}
                    >
                      {item.icon}
                      <span className="font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </>
            )}
          </nav>
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-600 p-2 pb-4 space-y-1">
            <button
              type="button"
              onClick={() => handleMenuNavigate('/change-password')}
              className="w-full min-h-[48px] flex items-center gap-3 px-3 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 active:bg-gray-100 dark:active:bg-gray-800"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a3 3 0 00-6 0v3m-2 0h10a2 2 0 012 2v7a2 2 0 01-2 2H7a2 2 0 01-2-2v-7a2 2 0 012-2z" />
              </svg>
              修改密码
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full min-h-[48px] flex items-center gap-3 px-3 rounded-lg text-sm font-medium text-danger active:bg-danger-50 dark:active:bg-danger-500/10"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17l5-5m0 0l-5-5m5 5H9m4 5v1a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2h6a2 2 0 012 2v1" />
              </svg>
              退出登录
            </button>
          </div>
        </div>
      </div>

      {/* 主内容区域 */}
      <main className="flex-1 bg-gray-100 dark:bg-black pb-0">
        {children}
      </main>
    </div>
  );
}
