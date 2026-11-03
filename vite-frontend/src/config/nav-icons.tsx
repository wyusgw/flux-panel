import React from 'react';

/**
 * 侧边栏 / 移动端导航共用的线条风格图标（24x24 画布、1.6 描边、currentColor），
 * 以路由路径为 key，桌面端 admin 布局与移动端 H5 布局共用同一套，避免各自维护导致风格不一致。
 */
const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    {children}
  </svg>
);

export const navIcons: Record<string, React.ReactNode> = {
  '/dashboard': <Icon><path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" /></Icon>,
  '/admin/dashboard': <Icon><path d="M4.5 18a8.5 8.5 0 1115 0M12 15l3.5-4.5" /></Icon>,
  '/forward': <Icon><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></Icon>,
  '/shop': <Icon><path d="M6 8h12l1 12H5L6 8zM9 8V7a3 3 0 016 0v1" /></Icon>,
  '/orders': <Icon><path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21V3zM10 8h4M10 12h4" /></Icon>,
  '/account-center': <Icon><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0115 0" /></Icon>,
  '/single-tunnel': <Icon><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Icon>,
  '/looking-glass': <Icon><circle cx="12" cy="12" r="4" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></Icon>,
  '/tunnel': <Icon><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></Icon>,
  '/node': <Icon><path d="M3 12h4l3-8 4 16 3-8h4" /></Icon>,
  '/devicegroup': <Icon><rect x="3" y="4" width="18" height="6" rx="2" /><rect x="3" y="14" width="18" height="6" rx="2" /><path d="M7 7h.01M7 17h.01" /></Icon>,
  '/nodegroup': <Icon><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" /></Icon>,
  '/user': <Icon><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0115 0" /></Icon>,
  '/usergroup': <Icon><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.8a3.5 3.5 0 010 6.4M18 14.5a6.5 6.5 0 013.5 5.5" /></Icon>,
  '/package': <Icon><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9" /></Icon>,
  '/redeemcode': <Icon><path d="M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01" /></Icon>,
  '/invitecode': <Icon><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></Icon>,
  '/order-management': <Icon><path d="M9 4h6v3H9zM7 5H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1M9 12h6M9 16h6" /></Icon>,
  '/config': <Icon><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></Icon>,
  '/push-notification': <Icon><path d="M4 10v4l12 5V5L4 10zM16 9a3 3 0 010 6M7 15l1 5h2l-1-4.5" /></Icon>,
  '/task-queue': <Icon><path d="M4 6h16M4 12h10M4 18h7M17 15l2 2 3-4" /></Icon>,
};
