import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { Logo } from '@/components/icons';
import { ThemeSwitch } from '@/components/theme-switch';
import { siteConfig, getCachedConfigs } from '@/config/site';
import { primaryNavItems, managementNavItems } from '@/config/nav-items';
import { safeLogout } from '@/utils/logout';
import { UserMenu } from '@/components/user-menu';
import { ChangePasswordModal } from '@/components/change-password-modal';
import { useDisclosure } from '@heroui/modal';

export default function H5Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [singleTunnelEnabled, setSingleTunnelEnabled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [username] = useState(() => localStorage.getItem('name') || 'Admin');
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  useEffect(() => {

    // 兼容处理：如果没有admin字段，根据role_id判断（0为管理员）
    let adminFlag = localStorage.getItem('admin') === 'true';
    if (localStorage.getItem('admin') === null) {
      const roleId = parseInt(localStorage.getItem('role_id') || '1', 10);
      adminFlag = roleId === 0;
      // 补充设置admin字段，避免下次再次判断
      localStorage.setItem('admin', adminFlag.toString());
    }


    setIsAdmin(adminFlag);

    getCachedConfigs().then((configs) => {
      setSingleTunnelEnabled(configs.user_device_group_enabled === 'true');
    }).catch(() => {});
  }, []);

  const filteredPrimaryNavItems = primaryNavItems.filter(item =>
    (!item.adminOnly || isAdmin) && (item.path !== '/single-tunnel' || singleTunnelEnabled)
  );
  const filteredManagementNavItems = managementNavItems.filter(item => !item.adminOnly || isAdmin);

  const handleMenuNavigate = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  const handleLogout = () => {
    setMenuOpen(false);
    safeLogout();
    navigate('/', { replace: true });
  };

  // 路由切换时回到页面顶部，避免上一页的滚动位置遗留；同时关闭导航菜单
  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch (e) {
      window.scrollTo(0, 0);
    }
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-black">
      {/* 顶部导航栏 */}
      <header className="bg-white dark:bg-black shadow-sm border-b border-gray-200 dark:border-gray-600 h-14 safe-top flex-shrink-0 flex items-center justify-between px-4 relative z-10">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="打开导航菜单"
            className="p-1.5 -ml-1.5 rounded-lg text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Logo size={20} />
          <h1 className="text-sm font-bold text-foreground">{siteConfig.name}</h1>
        </div>

        <div className="flex items-center gap-2">
          <UserMenu username={username} onChangePassword={onOpen} onLogout={handleLogout} />
          <ThemeSwitch />
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
          className={`absolute top-0 left-0 bottom-0 w-[78%] max-w-[300px] bg-white dark:bg-black shadow-xl safe-top flex flex-col transition-transform duration-200 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
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
        </div>
      </div>

      {/* 主内容区域 */}
      <main className="flex-1 bg-gray-100 dark:bg-black">
        {children}
      </main>

      <ChangePasswordModal isOpen={isOpen} onOpenChange={onOpenChange} />
    </div>
  );
}
