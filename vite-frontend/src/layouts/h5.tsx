import { DownOutlined, MenuOutlined } from "@/components/ant-icons";
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import toast from 'react-hot-toast';

import { ThemeSwitch } from '@/components/theme-switch';
import { siteConfig, getCachedConfigs } from '@/config/site';
import { canAccessPath, useMenuPermissions } from '@/utils/menu-permissions';
import { primaryNavItems, managementNavItems } from '@/config/nav-items';
import { safeLogout } from '@/utils/logout';
import { consumePasswordChangePrompt } from '@/utils/auth';
import { UserMenu } from '@/components/user-menu';
import { ToastWarningIcon } from '@/components/toast-icons';

export default function H5Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [singleTunnelEnabled, setSingleTunnelEnabled] = useState(false);
  const { permissions: menuPermissions } = useMenuPermissions();
  const [lookingGlassEnabled, setLookingGlassEnabled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // 「管理」二级菜单是否展开：默认展开（与桌面端一致），用户可手动收起
  const [manageOpen, setManageOpen] = useState(true);
  const [username] = useState(() => localStorage.getItem('name') || 'Admin');

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

    // 检测到默认账号密码登录时，登录页会写入这个标记：不阻断使用，正常进入主页后
    // 提示一次并跳转到个人中心账户设置的重置密码区域，提醒一次即消费掉，不会每次导航都重新提示
    if (consumePasswordChangePrompt()) {
      toast('检测到您使用的是默认账号密码，为了账户安全请尽快修改', { icon: <ToastWarningIcon />, duration: 6000 });
      navigate('/account-center');
    }

    getCachedConfigs().then((configs) => {
      setSingleTunnelEnabled(configs.user_device_group_enabled === 'true');
      setLookingGlassEnabled(configs.allow_looking_glass === 'true');
    }).catch(() => {});
  }, []);

  const filteredPrimaryNavItems = primaryNavItems.filter(item =>
    (!item.adminOnly || isAdmin) &&
    (item.path !== '/single-tunnel' || singleTunnelEnabled) &&
    (item.path !== '/looking-glass' || lookingGlassEnabled) &&
    canAccessPath(item.path, menuPermissions)
  );
  const filteredManagementNavItems = managementNavItems.filter(item => (!item.adminOnly || isAdmin) && canAccessPath(item.path, menuPermissions));

  const handleMenuNavigate = (path: string) => {
    setMenuOpen(false);
    // 节点状态页是独立的整页，点击时在新窗口打开
    if (path === '/node') {
      window.open(path, '_blank');
      return;
    }
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
    if (managementNavItems.some(item => item.path === location.pathname)) setManageOpen(true);
  }, [location.pathname]);

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-black">
      {/* 顶部导航栏 */}
      <header className="app-topbar h-16 flex items-center justify-between px-4 sm:px-6 safe-top flex-shrink-0 relative z-10">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="打开导航菜单"
            className="p-1.5 -ml-1.5 rounded-lg text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800"
          >
            <MenuOutlined className="w-5 h-5" />
          </button>
          <h1 className="app-topbar-brand text-foreground truncate">{siteConfig.name}</h1>
        </div>

        <div className="flex items-center gap-4 shrink-0 ml-3">
          <UserMenu username={username} onLogout={handleLogout} />
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
          <nav className="flex-1 overflow-y-auto p-4 hide-scrollbar">
            <div className="rounded-xl bg-gray-50 dark:bg-zinc-900 py-2 overflow-hidden">
              {filteredPrimaryNavItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => handleMenuNavigate(item.path)}
                    className={`w-full flex items-center gap-3 py-3 text-sm transition-colors ${isActive ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'text-gray-700 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800'} px-4`}
                  >
                    {item.icon}
                    <span className="font-medium">{item.label}</span>
                  </button>
                );
              })}

              {filteredManagementNavItems.length > 0 && (
                <>
                  <button
                    onClick={() => setManageOpen(open => !open)}
                    aria-expanded={manageOpen}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
                  >
                    <span>管理</span>
                    <DownOutlined className={`w-2.5 h-2.5 text-gray-400 transition-transform duration-[360ms] ease-[cubic-bezier(0.22,0.8,0.24,1)] ${manageOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <div className={`nav-collapse${manageOpen ? ' is-open' : ''}`}>
                    <div>
                      {filteredManagementNavItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                          <button
                            key={item.path}
                            onClick={() => handleMenuNavigate(item.path)}
                            className={`w-full flex items-center gap-3 py-3 text-sm transition-colors ${isActive ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'text-gray-700 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800'} pl-8 pr-4`}
                          >
                            {item.icon}
                            <span className="font-medium">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </nav>
        </div>
      </div>

      {/* 主内容区域 */}
      <main className="flex-1 bg-gray-100 dark:bg-black">
        {children}
      </main>
    </div>
  );
}
