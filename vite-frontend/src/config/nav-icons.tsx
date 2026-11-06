import { AimOutlined, CloudServerOutlined, ClusterOutlined, DashboardOutlined, DesktopOutlined, HomeOutlined, NodeIndexOutlined, NotificationOutlined, OrderedListOutlined, ProfileOutlined, RedEnvelopeOutlined, SettingOutlined, ShoppingOutlined, TagsOutlined, TeamOutlined, TransactionOutlined, UnorderedListOutlined, UserOutlined } from "@/components/ant-icons";
import React from 'react';

/**
 * 侧边栏 / 移动端导航共用的图标，以路由路径为 key，桌面端 admin 布局与移动端 H5 布局共用同一套。
 */
/** 节点状态：心电图折线 */
const HeartbeatIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 flex-shrink-0">
    <path d="M1.500 12H7l2.500-7.500 5 15L17 12h5.500" />
  </svg>
);

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
  '/node': <HeartbeatIcon />,
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
