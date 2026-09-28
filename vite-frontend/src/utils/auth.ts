import { getRoleIdFromToken, isTokenValid } from './jwt';

/**
 * 权限工具类
 */

/**
 * 获取当前用户的token
 * @returns token
 */
export function getToken(): string | null {
  return localStorage.getItem('token');
}

/**
 * 获取当前用户的角色ID
 * @returns 角色ID
 */
export function getCurrentUserRoleId(): number | null {
  const token = getToken();
  if (!token || !isTokenValid(token)) {
    return null;
  }
  return getRoleIdFromToken(token);
}

/**
 * 判断当前用户是否是管理员
 * @returns 是否是管理员
 */
export function isAdmin(): boolean {
  const roleId = getCurrentUserRoleId();
  return roleId === 0;
}

/**
 * 判断当前用户是否有指定角色
 * @param targetRoleId 目标角色ID
 * @returns 是否有指定角色
 */
export function hasRole(targetRoleId: number): boolean {
  const roleId = getCurrentUserRoleId();
  return roleId === targetRoleId;
}

/**
 * 判断当前用户是否已登录且token有效
 * @returns 是否已登录
 */
export function isLoggedIn(): boolean {
  const token = getToken();
  return token ? isTokenValid(token) : false;
}

/**
 * 检测到默认账号密码登录后，登录页会写入这个标记；布局组件挂载时调用本函数消费一次
 * （读到即清除，不会每次导航都重新提示），据此提示并跳转到个人中心账户设置的重置密码区域
 * @returns 本次是否需要提示修改密码
 */
export function consumePasswordChangePrompt(): boolean {
  const shouldPrompt = localStorage.getItem('promptPasswordChange') === 'true';
  if (shouldPrompt) {
    localStorage.removeItem('promptPasswordChange');
  }
  return shouldPrompt;
}

/**
 * 权限检查装饰器函数
 * @param fn 要执行的函数
 * @param errorMsg 权限不足时的错误提示
 * @returns 包装后的函数
 */
export function requireAdmin<T extends (...args: any[]) => any>(
  fn: T, 
  errorMsg: string = '权限不足，仅管理员可操作'
): T {
  return ((...args: Parameters<T>) => {
    if (!isAdmin()) {
      console.warn(errorMsg);
      return false;
    }
    return fn(...args);
  }) as T;
} 