import Network from './network';

// 登陆相关接口
export interface LoginData {
  username: string;
  password: string;
  captchaId: string;
  // 第三方验证码（Google reCAPTCHA / Cloudflare Turnstile）拿到的令牌
  captchaToken?: string;
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
export const getInvalidUsers = () => Network.post("/cleanup/invalidUsers");
export const cleanInvalidUsers = () => Network.post("/cleanup/cleanInvalidUsers");
export const getInvalidForwards = () => Network.post("/cleanup/invalidForwards");
export const cleanInvalidForwards = () => Network.post("/cleanup/cleanInvalidForwards");
export const getMyMenuPermissions = () => Network.post("/menuPermission/mine");
export const getUserMenuPermissions = (id: number) => Network.post("/menuPermission/get", { id });
export const updateUserMenuPermissions = (id: number, selected: string[]) => Network.post("/menuPermission/update", { id, selected });
export const getDemoPermission = (id: number) => Network.post("/demo/permission", { id });
export const updateDemoPermission = (data: { id: number; areas: string[]; restoreTime: string | null }) => Network.post("/demo/updatePermission", data);
export const restoreDemoChanges = (id: number) => Network.post("/demo/restore", { id });
export const commitDemoChanges = (id: number) => Network.post("/demo/commit", { id });
export const getAllUsers = (pageData: any = {}) => Network.post("/user/list", pageData);
export const updateUser = (data: any) => Network.post("/user/update", data);
export const deleteUser = (id: number) => Network.post("/user/delete", { id });
export const getUserPackageInfo = () => Network.post("/user/package");
export const updateAutoRenew = (autoRenew: boolean) => Network.post("/user/autoRenew", { autoRenew });
export const resetPassword = (currentPassword: string, newPassword?: string, newUsername?: string) => Network.post("/user/resetPassword", { currentPassword, newPassword, newUsername });
export interface NotifySettingsPayload {
  paymentMode: number;
  deviceMode: number;
  deviceGroupIds: number[];
  renewMode?: number;
  expiryMode?: number;
  flowMode?: number;
}
export const updateNotifySettings = (data: NotifySettingsPayload) => Network.post("/user/notifySettings", data);
export const getTelegramBindCode = () => Network.post("/user/telegram/bindCode");
export const unbindTelegram = () => Network.post("/user/telegram/unbind");
export const testTelegramNotify = () => Network.post("/user/telegram/test");
export const getTelegramSendLogs = (params: { type?: string; status?: string; limit?: number } = {}) => Network.post("/telegramLog/list", params);

// 用户组CRUD操作 - 全部使用POST请求
export const createUserGroup = (data: any) => Network.post("/userGroup/create", data);
export const getUserGroupList = () => Network.post("/userGroup/list");
export const updateUserGroup = (data: any) => Network.post("/userGroup/update", data);
export const deleteUserGroup = (id: number) => Network.post("/userGroup/delete", { id });
export const batchDeleteUserGroups = (ids: number[]) => Network.post("/userGroup/batchDelete", { ids });
export const reorderUserGroups = (groups: Array<{ id: number; sort: number }>) => Network.post("/userGroup/reorder", { groups });
export const getUserGroupNames = () => Network.post("/userGroup/names");

// 节点组CRUD操作（节点分类，用于分配哪些节点可被套餐/用户组使用）- 全部使用POST请求
export const createNodeGroup = (data: any) => Network.post("/nodeGroup/create", data);
export const getNodeGroupList = () => Network.post("/nodeGroup/list");
export const updateNodeGroup = (data: any) => Network.post("/nodeGroup/update", data);
export const deleteNodeGroup = (id: number) => Network.post("/nodeGroup/delete", { id });
export const batchDeleteNodeGroups = (ids: number[]) => Network.post("/nodeGroup/batchDelete", { ids });
export const reorderNodeGroups = (groups: Array<{ id: number; sort: number }>) => Network.post("/nodeGroup/reorder", { groups });
export const getNodeGroupNames = () => Network.post("/nodeGroup/names");

// 单端组CRUD操作（用户自己名下的单端组）- 全部使用POST请求
export const createMySingleTunnelGroup = (data: any) => Network.post("/singleTunnelGroup/create", data);
export const getMySingleTunnelGroupList = () => Network.post("/singleTunnelGroup/list");
export const updateMySingleTunnelGroup = (data: any) => Network.post("/singleTunnelGroup/update", data);
export const deleteMySingleTunnelGroup = (id: number) => Network.post("/singleTunnelGroup/delete", { id });

// Looking Glass 网络诊断（从指定节点发起 TCP ping 或 traceroute）
export const runLookingGlass = (data: { nodeId: number; type: 'ping' | 'traceroute' | 'mtr' | 'dns' | 'icmp_ping'; target: string }) => Network.post("/lookingGlass/run", data);

// 套餐CRUD操作 - 全部使用POST请求
export const createPackagePlan = (data: any) => Network.post("/package/create", data);
export const getPackagePlanList = () => Network.post("/package/list");
export const updatePackagePlan = (data: any) => Network.post("/package/update", data);
export const deletePackagePlan = (id: number) => Network.post("/package/delete", { id });
export const batchDeletePackagePlans = (ids: number[]) => Network.post("/package/batchDelete", { ids });
export const reorderPackagePlans = (plans: Array<{ id: number; sort: number }>) => Network.post("/package/reorder", { plans });

// 订单相关操作 - 全部使用POST请求
export const purchasePackage = (packageId: number, redeemCode?: string) => Network.post("/order/purchase", { packageId, redeemCode });
export const redeemPackageCode = (redeemCode: string) => Network.post("/order/redeem", { redeemCode });
export const createRechargeOrder = (amount: number, channelId: string) => Network.post("/recharge/create", { amount, channelId });
export const getOrderList = () => Network.post("/order/list");
export const getAdminOrderList = () => Network.post("/order/admin/list");
export const createManualOrder = (data: { userId: number; info: string; amount: number }) => Network.post("/order/manualCreate", data);
export const batchDeleteOrders = (ids: number[]) => Network.post("/order/batchDelete", { ids });
export const updateOrderStatus = (id: number, orderStatus: number) => Network.post("/order/updateStatus", { id, orderStatus });

// 兑换码相关操作 - 全部使用POST请求
export const batchCreateRedeemCodes = (data: any) => Network.post("/redeemCode/batchCreate", data);
export const getRedeemCodeList = () => Network.post("/redeemCode/list");
export const deleteRedeemCode = (id: number) => Network.post("/redeemCode/delete", { id });

// 邀请码（注册码）相关操作 - 全部使用POST请求
export const batchCreateInviteCodes = (data: { usesRemaining: number; codes: string[] }) => Network.post("/inviteCode/batchCreate", data);
export const getInviteCodeList = () => Network.post("/inviteCode/list");
export const deleteInviteCode = (id: number) => Network.post("/inviteCode/delete", { id });

// 任务重试队列相关操作 - 全部使用POST请求
export const getTaskQueueList = () => Network.post("/taskQueue/list");

// 管理员仪表盘聚合统计
export const getDashboardFlowStats = () => Network.post("/dashboard/flowStats");
export const getNodeOnlineTrend = (range: 'day' | 'month' = 'day') => Network.post("/dashboard/nodeOnlineTrend", { range });
export const getTaskQueueHealth = () => Network.post("/taskQueue/health");
export const getTaskQueueOverview = () => Network.post("/taskQueue/overview");
export const getTaskQueueErrorLogs = () => Network.post("/taskQueue/errorLogs");
export const retryTaskQueue = (id: number) => Network.post("/taskQueue/retry", { id });
export const deleteTaskQueue = (id: number) => Network.post("/taskQueue/delete", { id });

// 设备组CRUD操作 - 全部使用POST请求
export const createDeviceGroup = (data: any) => Network.post("/deviceGroup/create", data);
export const getDeviceGroupList = () => Network.post("/deviceGroup/list");
export const updateDeviceGroup = (data: any) => Network.post("/deviceGroup/update", data);
export const updateDeviceGroupConfig = (id: number, config: string) => Network.post("/deviceGroup/updateConfig", { id, config });
export const deleteDeviceGroup = (id: number) => Network.post("/deviceGroup/delete", { id });
export const batchDeleteDeviceGroups = (ids: number[]) => Network.post("/deviceGroup/batchDelete", { ids });
export const reorderDeviceGroups = (groups: Array<{ id: number; sort: number }>) => Network.post("/deviceGroup/reorder", { groups });
export const updateDeviceGroupOfflineConfig = (groups: Array<{ id: number; offlineGraceEnabled: boolean; offlineGraceSeconds: number | null; offlineRetainEnabled: boolean; offlineRetainSeconds: number | null }>) => Network.post("/deviceGroup/offlineConfig", { groups });

// 单端隧道：普通用户自建设备组 - 全部使用POST请求
export const createUserDeviceGroup = (data: any) => Network.post("/userDeviceGroup/create", data);
export const getMyDeviceGroupList = () => Network.post("/userDeviceGroup/list");
export const updateUserDeviceGroup = (data: any) => Network.post("/userDeviceGroup/update", data);
export const deleteUserDeviceGroup = (id: number) => Network.post("/userDeviceGroup/delete", { id });
export const getMyDeviceGroupInstallCommand = (id: number) => Network.post("/userDeviceGroup/install", { id });
export const resetMyDeviceGroupSecret = (id: number) => Network.post("/userDeviceGroup/resetSecret", { id });
export const clearMyDeviceGroupFlow = (ids: number[]) => Network.post("/userDeviceGroup/clearFlow", { ids });

// 节点CRUD操作 - 全部使用POST请求
export const createNode = (data: any) => Network.post("/node/create", data);
export const getNodeList = () => Network.post("/node/list");
export const updateNode = (data: any) => Network.post("/node/update", data);
export const deleteNode = (id: number) => Network.post("/node/delete", { id });
export const getNodeInstallCommand = (id: number) => Network.post("/node/install", { id });
export const getNodeConfig = (id: number) => Network.post("/node/config", { id });
export const resetNodeSecret = (id: number) => Network.post("/node/resetSecret", { id });
export const checkNodeStatus = (nodeId?: number) => {
  const params = nodeId ? { nodeId } : {};
  return Network.post("/node/checkStatus", params);
};

// 隧道CRUD操作 - 全部使用POST请求
export const createTunnel = (data: any) => Network.post("/tunnel/create", data);
export const getTunnelList = () => Network.post("/tunnel/list");
export const getTunnelById = (id: number) => Network.post("/tunnel/get", { id });
export const updateTunnel = (data: any) => Network.post("/tunnel/update", data);
export const deleteTunnel = (id: number) => Network.post("/tunnel/delete", { id });
// 诊断要依次对多段做 TCP ping，次数可配置，耗时可能超过默认的 30 秒请求超时
const DIAGNOSE_TIMEOUT_MS = 150000;
export const diagnoseTunnel = (tunnelId: number) => Network.post("/tunnel/diagnose", { tunnelId }, DIAGNOSE_TIMEOUT_MS);
// 诊断详情：只对点开的那一段按「诊断详情连接次数」重新测试
export const diagnoseTunnelDetail = (data: { tunnelId: number; leg?: string; targetIp: string; targetPort: number }) => Network.post("/tunnel/diagnoseDetail", data, DIAGNOSE_TIMEOUT_MS);

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
export const forceDeleteForward = (id: number) => Network.post("/forward/forceDelete", { id });

// 转发服务控制操作 - 通过Java后端接口
export const pauseForwardService = (forwardId: number) => Network.post("/forward/pause", { id: forwardId });
export const resumeForwardService = (forwardId: number) => Network.post("/forward/resume", { id: forwardId });

// 转发诊断操作
export const diagnoseForward = (forwardId: number) => Network.post("/forward/diagnose", { forwardId }, DIAGNOSE_TIMEOUT_MS);
export const diagnoseForwardDetail = (data: { forwardId: number; leg?: string; targetIp: string; targetPort: number }) => Network.post("/forward/diagnoseDetail", data, DIAGNOSE_TIMEOUT_MS);

// 转发排序操作
export const updateForwardOrder = (data: { forwards: Array<{ id: number; inx: number }> }) => Network.post("/forward/updateOrder", data);
export const getForwardDailyFlow = (userId?: number) => Network.post("/forward/dailyFlow", userId ? { userId } : {});

// 转发规则分组CRUD操作 - 全部使用POST请求
export const createForwardGroup = (data: any) => Network.post("/forwardGroup/create", data);
export const getForwardGroupList = () => Network.post("/forwardGroup/list");
export const updateForwardGroup = (data: any) => Network.post("/forwardGroup/update", data);
export const deleteForwardGroup = (id: number) => Network.post("/forwardGroup/delete", { id });

// 限速规则CRUD操作 - 全部使用POST请求
export const createSpeedLimit = (data: any) => Network.post("/speedLimit/create", data);
export const getSpeedLimitList = () => Network.post("/speedLimit/list");
export const updateSpeedLimit = (data: any) => Network.post("/speedLimit/update", data);
export const deleteSpeedLimit = (id: number) => Network.post("/speedLimit/delete", { id });

// 重置流量接口
export const resetUserFlow = (data: { id: number; type: number }) => Network.post("/user/reset", data);

// 网站配置相关接口
export const getConfigs = () => Network.post("/config/list");
export const getConfigByName = (name: string) => Network.post("/config/get", { name });
export const getBackendInfo = () => Network.post("/config/backendInfo");
export const updateConfigs = (configMap: Record<string, string>) => Network.post("/config/update", configMap);
export const updateConfig = (name: string, value: string) => Network.post("/config/updateSingle", { name, value });


// 验证码相关接口
export const checkCaptcha = () => Network.post("/captcha/check");
export const generateCaptcha = () => Network.post(`/captcha/generate`);
export const verifyCaptcha = (data: { captchaId: string; trackData: string }) => Network.post("/captcha/verify", data); 