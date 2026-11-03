import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from "@heroui/button";
import toast from 'react-hot-toast';

import { Logo } from '@/components/icons';
import { ThemeSwitch } from '@/components/theme-switch';
import { UserMenu } from '@/components/user-menu';
import { ToastWarningIcon } from '@/components/toast-icons';
import { safeLogout } from '@/utils/logout';
import { consumePasswordChangePrompt } from '@/utils/auth';
import { siteConfig, getCachedConfigs } from '@/config/site';
import { navIcons } from '@/config/nav-icons';


interface MenuItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  hidden?: boolean;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false);
  const [managementMenuOpen, setManagementMenuOpen] = useState(true);
  const [username, setUsername] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [singleTunnelEnabled, setSingleTunnelEnabled] = useState(false);
  const [lookingGlassEnabled, setLookingGlassEnabled] = useState(false);

  // 菜单项配置
  const menuItems: MenuItem[] = [
    {
      path: '/dashboard',
      label: '主页',
      icon: navIcons['/dashboard']
    },
    {
      path: '/admin/dashboard',
      label: '仪表盘',
      adminOnly: true,
      icon: navIcons['/admin/dashboard']
    },
    {
      path: '/forward',
      label: '转发管理',
      icon: navIcons['/forward']
    },
    {
      path: '/shop',
      label: '商城',
      icon: navIcons['/shop']
    },
    {
      path: '/orders',
      label: '我的订单',
      icon: navIcons['/orders']
    },
    {
      path: '/account-center',
      label: '个人中心',
      icon: navIcons['/account-center']
    },
    {
      path: '/single-tunnel',
      label: '单端隧道',
      hidden: !singleTunnelEnabled,
      icon: navIcons['/single-tunnel']
    },
    {
      path: '/looking-glass',
      label: '网络诊断',
      hidden: !lookingGlassEnabled,
      icon: navIcons['/looking-glass']
    },
    {
      path: '/tunnel',
      label: '隧道管理',
      icon: navIcons['/tunnel'],
      adminOnly: true
    },
    {
      path: '/node',
      label: '节点状态',
      icon: navIcons['/node']
    },
    {
      path: '/devicegroup',
      label: '设备管理',
      icon: navIcons['/devicegroup'],
      adminOnly: true
    },
    {
      path: '/nodegroup',
      label: '节点组管理',
      icon: navIcons['/nodegroup'],
      adminOnly: true
    },
    {
      path: '/user',
      label: '用户管理',
      icon: navIcons['/user'],
      adminOnly: true
    },
    {
      path: '/usergroup',
      label: '用户组管理',
      icon: navIcons['/usergroup'],
      adminOnly: true
    },
    {
      path: '/package',
      label: '套餐管理',
      icon: navIcons['/package'],
      adminOnly: true
    },
    {
      path: '/redeemcode',
      label: '兑换码管理',
      icon: navIcons['/redeemcode'],
      adminOnly: true
    },
    {
      path: '/invitecode',
      label: '邀请码管理',
      icon: navIcons['/invitecode'],
      adminOnly: true
    },
    {
      path: '/order-management',
      label: '订单管理',
      icon: navIcons['/order-management'],
      adminOnly: true
    },
    {
      path: '/config',
      label: '站点设置',
      icon: navIcons['/config'],
      adminOnly: true
    },
    {
      path: '/push-notification',
      label: '推送通知',
      icon: navIcons['/push-notification'],
      adminOnly: true
    },
    {
      path: '/task-queue',
      label: '队列监控',
      icon: navIcons['/task-queue'],
      adminOnly: true
    }
  ];

  // 检查移动端
  const checkMobile = () => {
    setIsMobile(window.innerWidth <= 768);
    if (window.innerWidth > 768) {
      setMobileMenuVisible(false);
    }
  };

  useEffect(() => {
    // 获取用户信息
    const name = localStorage.getItem('name') || 'Admin';
    
    // 兼容处理：如果没有admin字段，根据role_id判断（0为管理员）
    let adminFlag = localStorage.getItem('admin') === 'true';
    if (localStorage.getItem('admin') === null) {
      const roleId = parseInt(localStorage.getItem('role_id') || '1', 10);
      adminFlag = roleId === 0;
      // 补充设置admin字段，避免下次再次判断
      localStorage.setItem('admin', adminFlag.toString());
    }
    
    setUsername(name);
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

    // 响应式检查
    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // 退出登录
  const handleLogout = () => {
    safeLogout();
    navigate('/');
  };

  // 切换移动端菜单
  const toggleMobileMenu = () => {
    setMobileMenuVisible(!mobileMenuVisible);
  };

  // 隐藏移动端菜单
  const hideMobileMenu = () => {
    setMobileMenuVisible(false);
  };

  // 菜单点击处理
  // 节点状态页是独立的整页（不带侧边栏），点击时在新窗口打开，当前窗口保持不动
  const handleMenuClick = (path: string) => {
    if (path === '/node') {
      window.open(path, '_blank');
      if (isMobile) hideMobileMenu();
      return;
    }
    navigate(path);
    if (isMobile) {
      hideMobileMenu();
    }
  };

  // 过滤菜单项（根据权限与站点配置开关）
  const filteredMenuItems = menuItems.filter(item =>
    (!item.adminOnly || isAdmin) && !item.hidden
  );
  const primaryMenuItems = filteredMenuItems.filter(item => !item.adminOnly);
  const managementMenuItems = filteredMenuItems
    .filter(item => item.adminOnly)
    .sort((a, b) => {
      const order = ['/admin/dashboard', '/config'];
      const aIndex = order.indexOf(a.path);
      const bIndex = order.indexOf(b.path);
      return (aIndex === -1 ? order.length : aIndex) - (bIndex === -1 ? order.length : bIndex);
    });

  useEffect(() => {
    // managementMenuItems 每次渲染都是新数组引用，不能放进依赖数组——
    // 否则用户手动点击收起后，这里会在下一次渲染时又把它强制打开
    if (managementMenuItems.some(item => item.path === location.pathname)) {
      setManagementMenuOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <div className={`admin-shell flex flex-col ${isMobile ? 'min-h-screen' : 'h-screen'} bg-gray-100 dark:bg-black`}>
      {/* 顶栏：横跨整个窗口，左侧站点名称，右侧用户菜单与主题切换；侧边栏从顶栏下方开始，直接以菜单项起头 */}
      <header className="bg-white dark:bg-[#111214] shadow-none border-b border-gray-200 dark:border-[#292b2f] h-14 flex items-center justify-between px-4 lg:px-6 relative z-10 shrink-0">
        <div className="flex items-center gap-3">
          {/* 移动端菜单按钮 */}
          {isMobile && (
            <Button
              isIconOnly
              variant="light"
              onPress={toggleMobileMenu}
              className="lg:hidden"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </Button>
          )}
          <Logo size={24} />
          <div className="flex items-baseline gap-2 min-w-0">
            <h1 className="text-base font-bold text-foreground whitespace-nowrap">{siteConfig.name}</h1>
            <span className="text-xs text-default-500 hidden sm:inline">v{siteConfig.version}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <UserMenu username={username} onLogout={handleLogout} />
          <ThemeSwitch />
        </div>
      </header>

      <div className={`flex flex-1 ${isMobile ? 'min-h-0' : 'overflow-hidden'}`}>
      {/* 移动端遮罩层 */}
      {isMobile && mobileMenuVisible && (
        <div 
          className="fixed inset-0 backdrop-blur-sm bg-white/50 dark:bg-black/30 z-40"
          onClick={hideMobileMenu}
        />
      )}

      {/* 左侧菜单栏：扁平列表，线条图标 + 常规字重，没有分隔线；「管理」是可折叠的分组标题，展开后子项缩进并带浅底色 */}
      <aside className={`
        ${isMobile ? 'fixed' : 'relative'} 
        ${isMobile && !mobileMenuVisible ? '-translate-x-full' : 'translate-x-0'}
        ${isMobile ? 'w-64' : 'w-60'} 
        bg-white dark:bg-[#0c0d0f]
        shadow-none
        border-r border-gray-200 dark:border-[#292b2f]
        z-50 
        transition-transform duration-300 ease-in-out
        flex flex-col shrink-0
        ${isMobile ? 'h-screen' : 'h-full'}
        ${isMobile ? 'top-0 left-0' : ''}
      `}>
        <nav className="flex-1 py-2 overflow-y-auto hide-scrollbar">
          <ul>
            {primaryMenuItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <li key={item.path}>
                  <button
                    onClick={() => handleMenuClick(item.path)}
                    className={`
                      w-full flex items-center gap-3 px-6 text-left text-sm
                      transition-colors duration-200 h-11
                      ${isActive
                        ? 'bg-primary-100 dark:bg-primary-500/15 text-primary-600 dark:text-primary-300'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.04]'
                      }
                    `}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}

            {managementMenuItems.length > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => setManagementMenuOpen(open => !open)}
                  aria-expanded={managementMenuOpen}
                  className="w-full flex items-center justify-between gap-3 px-6 h-11 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors"
                >
                  <span>管理</span>
                  <svg className={`w-4 h-4 transition-transform duration-200 ${managementMenuOpen ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m6 15 6-6 6 6" />
                  </svg>
                </button>

                {managementMenuOpen && (
                  <ul className="bg-gray-50 dark:bg-[#16171a]">
                    {managementMenuItems.map((item) => {
                      const isActive = location.pathname === item.path;
                      return (
                        <li key={item.path}>
                          <button
                            onClick={() => handleMenuClick(item.path)}
                            className={`w-full flex items-center gap-3 pl-10 pr-6 h-11 text-left text-sm transition-colors duration-200 ${isActive
                              ? 'bg-primary-100 dark:bg-primary-500/15 text-primary-600 dark:text-primary-300'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.04]'}`}
                          >
                            <span className="flex-shrink-0">{item.icon}</span>
                            <span>{item.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            )}
          </ul>
        </nav>

      </aside>

      {/* 主内容区域 */}
      <main className={`flex-1 min-w-0 bg-gray-100 dark:bg-[#0c0d0f] ${isMobile ? '' : 'overflow-y-auto'}`}>
        {children}
      </main>
      </div>
    </div>
  );
}
