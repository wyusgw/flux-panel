import React from 'react';
import { navIcons } from '@/config/nav-icons';

export interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

/**
 * 导航项定义，与桌面端 admin.tsx 侧边栏保持同一份数据，
 * 供移动端 H5Layout 的导航菜单共用，避免图标/文案/路由各自维护导致不同步。
 */

export const primaryNavItems: NavItem[] = [
  {
    path: '/dashboard',
    label: '主页',
    icon: navIcons['/dashboard']
  },
  {
    path: '/account-center',
    label: '个人中心',
    icon: navIcons['/account-center']
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
    path: '/single-tunnel',
    label: '单端隧道',
    icon: navIcons['/single-tunnel']
  },
  {
    path: '/looking-glass',
    label: '网络诊断',
    icon: navIcons['/looking-glass']
  },
  {
    path: '/node',
    label: '节点状态',
    icon: navIcons['/node']
  }
];

// 与 admin.tsx「管理」子菜单展示顺序一致：仪表盘 → 站点设置 → 隧道管理 → 设备管理 → 节点组管理 → 用户管理 → 用户组管理 → 套餐管理 → 兑换码管理
export const managementNavItems: NavItem[] = [
  {
    path: '/admin/dashboard',
    label: '仪表盘',
    adminOnly: true,
    icon: navIcons['/admin/dashboard']
  },
  {
    path: '/config',
    label: '站点设置',
    adminOnly: true,
    icon: navIcons['/config']
  },
  {
    path: '/push-notification',
    label: '推送通知',
    adminOnly: true,
    icon: navIcons['/push-notification']
  },
  {
    path: '/tunnel',
    label: '隧道管理',
    adminOnly: true,
    icon: navIcons['/tunnel']
  },
  {
    path: '/devicegroup',
    label: '设备管理',
    adminOnly: true,
    icon: navIcons['/devicegroup']
  },
  {
    path: '/nodegroup',
    label: '节点组管理',
    adminOnly: true,
    icon: navIcons['/nodegroup']
  },
  {
    path: '/user',
    label: '用户管理',
    adminOnly: true,
    icon: navIcons['/user']
  },
  {
    path: '/usergroup',
    label: '用户组管理',
    adminOnly: true,
    icon: navIcons['/usergroup']
  },
  {
    path: '/package',
    label: '套餐管理',
    adminOnly: true,
    icon: navIcons['/package']
  },
  {
    path: '/redeemcode',
    label: '兑换码管理',
    adminOnly: true,
    icon: navIcons['/redeemcode']
  },
  {
    path: '/invitecode',
    label: '邀请码管理',
    adminOnly: true,
    icon: navIcons['/invitecode']
  },
  {
    path: '/order-management',
    label: '订单管理',
    adminOnly: true,
    icon: navIcons['/order-management']
  },
  {
    path: '/task-queue',
    label: '队列监控',
    adminOnly: true,
    icon: navIcons['/task-queue']
  }
];
