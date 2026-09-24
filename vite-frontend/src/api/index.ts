import Network from './network';

// 登陆相关接口
export interface LoginData {
  username: string;
  password: string;
  captchaId: string;
}

export interface LoginResponse {
  token: string;
  role_id: number;
  name: string;
  requirePasswordChange?: boolean;
}

export const login = (data: LoginData) => Network.post<LoginResponse>("/user/login", data);
export const register = (data: { username: string; password: string; confirmPassword: string; inviteCode?: string }) => Network.post("/user/register", data);

// 用户CRUD操作 - 全部使用POST请求
export const createUser = (data: any) => Network.post("/user/create", data);
export const getAllUsers = (pageData: any = {}) => Network.post("/user/list", pageData);
export const updateUser = (data: any) => Network.post("/user/update", data);
export const deleteUser = (id: number) => Network.post("/user/delete", { id });
export const getUserPackageInfo = () => Network.post("/user/package");
export const updateAutoRenew = (autoRenew: boolean) => Network.post("/user/autoRenew", { autoRenew });
export const resetPassword = (currentPassword: string, newPassword?: string) => Network.post("/user/resetPassword", { currentPassword, newPassword });
export const updateNotifySettings = (paymentMode: number, deviceMode: number, deviceGroupIds: number[]) => Network.post("/user/notifySettings", { paymentMode, deviceMode, deviceGroupIds });
export const getTelegramBindCode = () => Network.post("/user/telegram/bindCode");
export const unbindTelegram = () => Network.post("/user/telegram/unbind");
export const testTelegramNotify = () => Network.post("/user/telegram/test");

// 用户组CRUD操作 - 全部使用POST请求
export const createUserGroup = (data: any) => Network.post("/user-group/create", data);
export const getUserGroupList = () => Network.post("/user-group/list");
export const updateUserGroup = (data: any) => Network.post("/user-group/update", data);
export const deleteUserGroup = (id: number) => Network.post("/user-group/delete", { id });
export const batchDeleteUserGroups = (ids: number[]) => Network.post("/user-group/batch-delete", { ids });
export const reorderUserGroups = (groups: Array<{ id: number; sort: number }>) => Network.post("/user-group/reorder", { groups });
export const getUserGroupNames = () => Network.post("/user-group/names");

// 单端组CRUD操作（用户自己名下的单端组）- 全部使用POST请求
export const createMySingleTunnelGroup = (data: any) => Network.post("/single-tunnel-group/create", data);
export const getMySingleTunnelGroupList = () => Network.post("/single-tunnel-group/list");
export const updateMySingleTunnelGroup = (data: any) => Network.post("/single-tunnel-group/update", data);
export const deleteMySingleTunnelGroup = (id: number) => Network.post("/single-tunnel-group/delete", { id });

// 套餐CRUD操作 - 全部使用POST请求
export const createPackagePlan = (data: any) => Network.post("/package/create", data);
export const getPackagePlanList = () => Network.post("/package/list");
export const updatePackagePlan = (data: any) => Network.post("/package/update", data);
export const deletePackagePlan = (id: number) => Network.post("/package/delete", { id });
export const batchDeletePackagePlans = (ids: number[]) => Network.post("/package/batch-delete", { ids });
export const reorderPackagePlans = (plans: Array<{ id: number; sort: number }>) => Network.post("/package/reorder", { plans });

// 订单相关操作 - 全部使用POST请求
export const purchasePackage = (packageId: number, redeemCode?: string) => Network.post("/order/purchase", { packageId, redeemCode });
export const redeemPackageCode = (redeemCode: string) => Network.post("/order/redeem", { redeemCode });
export const createRechargeOrder = (amount: number, channelId: string) => Network.post("/recharge/create", { amount, channelId });
export const getOrderList = () => Network.post("/order/list");
export const getAdminOrderList = () => Network.post("/order/admin/list");
export const createManualOrder = (data: { userId: number; info: string; amount: number }) => Network.post("/order/manual-create", data);
export const batchDeleteOrders = (ids: number[]) => Network.post("/order/batch-delete", { ids });
export const updateOrderStatus = (id: number, orderStatus: number) => Network.post("/order/update-status", { id, orderStatus });

// 兑换码相关操作 - 全部使用POST请求
export const batchCreateRedeemCodes = (data: any) => Network.post("/redeem-code/batch-create", data);
export const getRedeemCodeList = () => Network.post("/redeem-code/list");
export const deleteRedeemCode = (id: number) => Network.post("/redeem-code/delete", { id });

// 邀请码（注册码）相关操作 - 全部使用POST请求
export const batchCreateInviteCodes = (data: { usesRemaining: number; codes: string[] }) => Network.post("/invite-code/batch-create", data);
export const getInviteCodeList = () => Network.post("/invite-code/list");
export const deleteInviteCode = (id: number) => Network.post("/invite-code/delete", { id });

// 任务重试队列相关操作 - 全部使用POST请求
export const getTaskQueueList = () => Network.post("/task-queue/list");
export const getTaskQueueHealth = () => Network.post("/task-queue/health");
export const retryTaskQueue = (id: number) => Network.post("/task-queue/retry", { id });
export const deleteTaskQueue = (id: number) => Network.post("/task-queue/delete", { id });

// 设备组CRUD操作 - 全部使用POST请求
export const createDeviceGroup = (data: any) => Network.post("/device-group/create", data);
export const getDeviceGroupList = () => Network.post("/device-group/list");
export const updateDeviceGroup = (data: any) => Network.post("/device-group/update", data);
export const deleteDeviceGroup = (id: number) => Network.post("/device-group/delete", { id });
export const batchDeleteDeviceGroups = (ids: number[]) => Network.post("/device-group/batch-delete", { ids });
export const reorderDeviceGroups = (groups: Array<{ id: number; sort: number }>) => Network.post("/device-group/reorder", { groups });
export const updateDeviceGroupOfflineConfig = (groups: Array<{ id: number; offlineGraceEnabled: boolean; offlineGraceSeconds: number | null; offlineRetainEnabled: boolean; offlineRetainSeconds: number | null }>) => Network.post("/device-group/offline-config", { groups });

// 单端隧道：普通用户自建设备组 - 全部使用POST请求
export const createUserDeviceGroup = (data: any) => Network.post("/user-device-group/create", data);
export const getMyDeviceGroupList = () => Network.post("/user-device-group/list");
export const updateUserDeviceGroup = (data: any) => Network.post("/user-device-group/update", data);
export const deleteUserDeviceGroup = (id: number) => Network.post("/user-device-group/delete", { id });
export const getMyDeviceGroupInstallCommand = (id: number) => Network.post("/user-device-group/install", { id });
export const resetMyDeviceGroupSecret = (id: number) => Network.post("/user-device-group/reset-secret", { id });

// 节点CRUD操作 - 全部使用POST请求
export const createNode = (data: any) => Network.post("/node/create", data);
export const getNodeList = () => Network.post("/node/list");
export const updateNode = (data: any) => Network.post("/node/update", data);
export const deleteNode = (id: number) => Network.post("/node/delete", { id });
export const getNodeInstallCommand = (id: number) => Network.post("/node/install", { id });
export const resetNodeSecret = (id: number) => Network.post("/node/reset-secret", { id });
export const checkNodeStatus = (nodeId?: number) => {
  const params = nodeId ? { nodeId } : {};
  return Network.post("/node/check-status", params);
};

// 隧道CRUD操作 - 全部使用POST请求
export const createTunnel = (data: any) => Network.post("/tunnel/create", data);
export const getTunnelList = () => Network.post("/tunnel/list");
export const getTunnelById = (id: number) => Network.post("/tunnel/get", { id });
export const updateTunnel = (data: any) => Network.post("/tunnel/update", data);
export const deleteTunnel = (id: number) => Network.post("/tunnel/delete", { id });
export const diagnoseTunnel = (tunnelId: number) => Network.post("/tunnel/diagnose", { tunnelId });

// 用户隧道权限管理操作 - 全部使用POST请求
export const assignUserTunnel = (data: any) => Network.post("/tunnel/user/assign", data);
export const getUserTunnelList = (queryData: any = {}) => Network.post("/tunnel/user/list", queryData);
export const removeUserTunnel = (params: any) => Network.post("/tunnel/user/remove", params);
export const updateUserTunnel = (data: any) => Network.post("/tunnel/user/update", data);
export const userTunnel = () => Network.post("/tunnel/user/tunnel");

// 转发CRUD操作 - 全部使用POST请求
export const createForward = (data: any) => Network.post("/forward/create", data);
export const getForwardList = () => Network.post("/forward/list");
export const updateForward = (data: any) => Network.post("/forward/update", data);
export const deleteForward = (id: number) => Network.post("/forward/delete", { id });
export const forceDeleteForward = (id: number) => Network.post("/forward/force-delete", { id });

// 转发服务控制操作 - 通过Java后端接口
export const pauseForwardService = (forwardId: number) => Network.post("/forward/pause", { id: forwardId });
export const resumeForwardService = (forwardId: number) => Network.post("/forward/resume", { id: forwardId });

// 转发诊断操作
export const diagnoseForward = (forwardId: number) => Network.post("/forward/diagnose", { forwardId });

// 转发排序操作
export const updateForwardOrder = (data: { forwards: Array<{ id: number; inx: number }> }) => Network.post("/forward/update-order", data);
export const getForwardDailyFlow = () => Network.post("/forward/daily-flow");

// 转发规则分组CRUD操作 - 全部使用POST请求
export const createForwardGroup = (data: any) => Network.post("/forward-group/create", data);
export const getForwardGroupList = () => Network.post("/forward-group/list");
export const updateForwardGroup = (data: any) => Network.post("/forward-group/update", data);
export const deleteForwardGroup = (id: number) => Network.post("/forward-group/delete", { id });

// 限速规则CRUD操作 - 全部使用POST请求
export const createSpeedLimit = (data: any) => Network.post("/speed-limit/create", data);
export const getSpeedLimitList = () => Network.post("/speed-limit/list");
export const updateSpeedLimit = (data: any) => Network.post("/speed-limit/update", data);
export const deleteSpeedLimit = (id: number) => Network.post("/speed-limit/delete", { id });

// 修改密码接口
export const updatePassword = (data: any) => Network.post("/user/updatePassword", data);

// 重置流量接口
export const resetUserFlow = (data: { id: number; type: number }) => Network.post("/user/reset", data);

// 网站配置相关接口
export const getConfigs = () => Network.post("/config/list");
export const getConfigByName = (name: string) => Network.post("/config/get", { name });
export const updateConfigs = (configMap: Record<string, string>) => Network.post("/config/update", configMap);
export const updateConfig = (name: string, value: string) => Network.post("/config/update-single", { name, value });


// 验证码相关接口
export const checkCaptcha = () => Network.post("/captcha/check");
export const generateCaptcha = () => Network.post(`/captcha/generate`);
export const verifyCaptcha = (data: { captchaId: string; trackData: string }) => Network.post("/captcha/verify", data); 