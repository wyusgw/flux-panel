import { SVGProps } from "react";

export type IconSvgProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

// 用户管理相关类型
export interface User {
  id: number;
  name?: string;
  user: string;
  pwd?: string;
  status: number; // 1-正常, 0-禁用
  flow: number; // 流量限制(GB)
  num: number; // 转发数量
  expTime?: number; // 过期时间戳
  flowResetTime?: number; // 流量重置日期(1-31号)
  createdTime?: number; // 创建时间戳
  inFlow?: number; // 下载流量(字节)
  outFlow?: number; // 上传流量(字节)
  groupId?: number | null; // 用户组ID
  packageId?: number | null; // 套餐ID
  walletBalance?: number; // 钱包余额(元)
  autoRenew?: number; // 自动续费(0-关闭,1-开启)
  roleId?: number; // 角色ID(0-管理员,1-普通用户)
}

export interface UserForm {
  id?: number;
  name?: string;
  user: string;
  pwd?: string;
  status: number;
  flow: number;
  num: number;
  expTime: Date | null;
  flowResetTime: number;
  groupId?: number | null;
  packageId?: number | null;
  walletBalance?: number;
}

export interface UserTunnel {
  id: number;
  userId: number;
  tunnelId: number;
  tunnelName: string;
  status: number; // 1-正常, 0-禁用
  // 流量限制/转发数量/到期时间/流量重置日期/限速规则已不再由隧道权限单独设置，
  // 统一由账号自身的套餐控制；这几个字段仅为兼容旧数据可能非空，新分配的权限不再写入。
  flow?: number | null;
  num?: number | null;
  expTime?: number | null;
  flowResetTime?: number | null;
  speedId?: number | null;
  speedLimitName?: string;
  inFlow?: number; // 下载流量(字节)
  outFlow?: number; // 上传流量(字节)
  tunnelFlow?: number; // 隧道流量计算类型(1-单向, 2-双向)
}

export interface UserTunnelForm {
  tunnelId: number | null;
}

export interface Tunnel {
  id: number;
  name: string;
  entryNodeId: number;
  exitNodeId: number;
  entryNodeName?: string;
  exitNodeName?: string;
  status?: number;
  flow?: number; // 流量计算类型
}

export interface SpeedLimit {
  id: number;
  name: string;
  tunnelId: number;
  uploadSpeed: number;
  downloadSpeed: number;
}

export interface Pagination {
  current: number;
  size: number;
  total: number;
}
