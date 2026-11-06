import { AimOutlined, ApiOutlined, CloudServerOutlined, ClusterOutlined, DashboardOutlined, DesktopOutlined, HomeOutlined, NodeIndexOutlined, NotificationOutlined, OrderedListOutlined, ProfileOutlined, RedEnvelopeOutlined, SettingOutlined, ShoppingOutlined, TagsOutlined, TeamOutlined, TransactionOutlined, UnorderedListOutlined, UserOutlined } from "@/components/ant-icons";
import React from 'react';

/**
 * 侧边栏 / 移动端导航共用的图标，以路由路径为 key，桌面端 admin 布局与移动端 H5 布局共用同一套。
 */
export const navIcons: Record<string, React.ReactNode> = {
  '/dashboard': <HomeOutlined />,
  '/admin/dashboard': <DashboardOutlined />,
  '/forward': <UnorderedListOutlined />,
  '/shop': <ShoppingOutlined />,
  '/orders': <TransactionOutlined />,
  '/account-center': <UserOutlined />,
  '/single-tunnel': <DesktopOutlined />,
  '/looking-glass': <AimOutlined />,
  '/tunnel': <NodeIndexOutlined />,
  '/node': <ApiOutlined />,
  '/devicegroup': <CloudServerOutlined />,
  '/nodegroup': <ClusterOutlined />,
  '/user': <UserOutlined />,
  '/usergroup': <TeamOutlined />,
  '/package': <ShoppingOutlined />,
  '/redeemcode': <TagsOutlined />,
  '/invitecode': <RedEnvelopeOutlined />,
  '/order-management': <OrderedListOutlined />,
  '/config': <SettingOutlined />,
  '/push-notification': <NotificationOutlined />,
  '/task-queue': <ProfileOutlined />,
};
