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
  '/nodeConfig': ['deviceGroup'],
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

const permissionCacheKey = (token: string) => {
  // 不把令牌本身放进 localStorage key；用轻量 hash 将缓存绑定到当前登录态。
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) hash = Math.imul(hash ^ token.charCodeAt(i), 16777619);
  return `menu_permissions_${(hash >>> 0).toString(36)}`;
};

const readCachedPermissions = (token: string): string[] | null | undefined => {
  try {
    const value = localStorage.getItem(permissionCacheKey(token));
    if (value === null) return undefined;
    const parsed: unknown = JSON.parse(value);
    return parsed === null || (Array.isArray(parsed) && parsed.every(item => typeof item === 'string'))
      ? parsed as string[] | null
      : undefined;
  } catch {
    return undefined;
  }
};

const loadPermissions = (): Promise<string[] | null> => {
  const token = localStorage.getItem('token') || '';
  if (!cached || cached.token !== token) {
    const previous = readCachedPermissions(token);
    cached = {
      token,
      // 接口成功后更新缓存；失败时沿用当前登录态上次取得的权限。
      // 缓存只影响菜单显示，实际权限仍由后端校验。
      result: getMyMenuPermissions().then(res => {
        if (res.code !== 0) return previous ?? null;
        const permissions = res.data?.permissions ?? null;
        try { localStorage.setItem(permissionCacheKey(token), JSON.stringify(permissions)); } catch { /* 忽略缓存写入失败 */ }
        return permissions;
      }).catch(() => previous ?? null),
    };
  }
  return cached.result;
};

export const useMenuPermissions = () => {
  const [state, setState] = useState<{ loaded: boolean; permissions: string[] | null }>(() => {
    const permissions = readCachedPermissions(localStorage.getItem('token') || '');
    // 导航可立即使用缓存，但路由保护仍等本次登录态的服务端校验完成，避免旧缓存拦住刚获授权的页面。
    return { loaded: false, permissions: permissions ?? null };
  });
  useEffect(() => {
    let active = true;
    loadPermissions().then(permissions => {
      if (active) setState({ loaded: true, permissions });
    });
    return () => { active = false; };
  }, []);
  return state;
};
