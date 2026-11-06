import { useEffect, useState } from 'react';
import { getMyMenuPermissions } from '@/api';

/** 页面路径需要的权限，有其中任一项即可。不在这里的页面（主页、个人中心）所有账号都能用，和后端 MenuPermission 对应 */
const PATH_PERMISSIONS: Record<string, string[]> = {
  '/forward': ['forward'],
  '/user-forward': ['forward', 'user'],
  '/shop': ['shop'],
  '/orders': ['orders'],
  '/single-tunnel': ['singleTunnel'],
  '/looking-glass': ['lookingGlass'],
  '/node': ['nodeProbe'],
  '/admin/dashboard': ['adminDashboard'],
  '/config': ['config'],
  '/push-notification': ['pushNotification'],
  '/tunnel': ['tunnel'],
  '/devicegroup': ['deviceGroup'],
  '/nodegroup': ['nodeGroup'],
  '/user': ['user'],
  '/usergroup': ['userGroup'],
  '/package': ['package'],
  '/redeemcode': ['redeemCode'],
  '/invitecode': ['inviteCode'],
  '/order-management': ['orderManagement'],
  '/task-queue': ['taskQueue'],
};

/** permissions 为 null 表示全部页面 */
export const canAccessPath = (path: string, permissions: string[] | null): boolean => {
  const required = PATH_PERMISSIONS[path];
  return !permissions || !required || required.some(code => permissions.includes(code));
};

// 同一次登录只请求一次，换账号（令牌变化）时重新请求
let cached: { token: string; result: Promise<string[] | null> } | null = null;

const loadPermissions = (): Promise<string[] | null> => {
  const token = localStorage.getItem('token') || '';
  if (!cached || cached.token !== token) {
    cached = {
      token,
      // 请求失败时不隐藏页面，后端接口仍会拒绝没有权限的操作
      result: getMyMenuPermissions().then(res => (res.code === 0 ? res.data?.permissions ?? null : null)).catch(() => null),
    };
  }
  return cached.result;
};

export const useMenuPermissions = () => {
  const [state, setState] = useState<{ loaded: boolean; permissions: string[] | null }>({ loaded: false, permissions: null });
  useEffect(() => {
    let active = true;
    loadPermissions().then(permissions => {
      if (active) setState({ loaded: true, permissions });
    });
    return () => { active = false; };
  }, []);
  return state;
};
