import { TipButton } from "@/components/tip-button";
import { RuleSearchModal, EMPTY_RULE_SEARCH, countRuleSearch, matchRuleSearch, RuleSearchFilters } from "@/components/rule-search-modal";
import { getDeviceGroupList, getForwardList } from "@/api";
import { ControlOutlined, DeleteOutlined, DisconnectOutlined, FireOutlined, PaperClipOutlined, SafetyCertificateOutlined, SettingOutlined, ShoppingOutlined, UserAddOutlined } from "@/components/ant-icons";
import React, { useState, useEffect, useMemo } from 'react';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Input, Textarea } from "@heroui/input";
import { 
  Table, 
  TableHeader, 
  TableColumn, 
  TableBody, 
  TableRow, 
  TableCell 
} from "@heroui/table";
import type { SortDescriptor } from "@heroui/table";
import { 
  Modal, 
  ModalContent, 
  ModalHeader, 
  ModalBody, 
  ModalFooter,
  useDisclosure 
} from "@heroui/modal";
import { Select, SelectItem } from "@heroui/select";
import { Switch } from "@heroui/switch";
import { Checkbox } from "@heroui/checkbox";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { TablePagination } from "@/components/table-pagination";
import { TimeWheelPicker } from "@/components/time-wheel-picker";
import { useMenuPermissions } from "@/utils/menu-permissions";
import { showErrorDialog } from "@/components/error-dialog";
import { HEADER_COLUMN_CLASS, HEADER_TABLE_CLASS_NAMES, TableHeaderFilter } from "@/components/table-header-filter";
import { nextSort, SortCarets } from "@/components/table-sort";
import { DateTimePicker } from "@/components/datetime-picker";
import { Spinner } from "@heroui/spinner";

import toast from 'react-hot-toast';
import { 
  User,
  UserForm,
  UserTunnel,
  UserTunnelForm,
  Tunnel
} from '@/types';
import {
  getInvalidUsers,
  cleanInvalidUsers,
  getInvalidForwards,
  cleanInvalidForwards,
  getUserMenuPermissions,
  updateUserMenuPermissions,
  getDemoPermission,
  updateDemoPermission,
  restoreDemoChanges,
  commitDemoChanges,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  getTunnelList,
  assignUserTunnel,
  getUserTunnelList,
  removeUserTunnel,
  updateUserTunnel,
  resetUserFlow,
  getUserGroupList,
  getPackagePlanList
} from '@/api';
import { SearchIcon, EditIcon, DeleteIcon } from '@/components/icons';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FieldLabel, UnitField } from '@/components/form-field';
import RefreshButton from "@/components/refresh-button";
import { DayOfMonthPicker } from "@/components/day-of-month-picker";
import { isTimeConfigured, formatExpiryTime } from "@/utils/time";


// 工具函数
const formatFlow = (value: number, unit: string = 'bytes'): string => {
  if (unit === 'gb') {
    return `${value} GB`;
  } else {
    if (value === 0) return '0 B';
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(2)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
};

const getExpireStatus = (expTime: number) => {
  const now = Date.now();
  if (expTime < now) {
    return { color: 'danger' as const, text: '已过期' };
  }
  const diffDays = Math.ceil((expTime - now) / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) {
    return { color: 'warning' as const, text: `${diffDays}天后过期` };
  }
  return { color: 'success' as const, text: '正常' };
};

// 用户列表的列定义：sortable 表头可点击排序；filter 表头带漏斗筛选（text 输入搜索，options 勾选）；
// 「显示列」里可以勾选要显示哪些列（操作列固定显示），状态默认隐藏，需要时再打开
type UserColumn = { key: string; label: string; sortable: boolean; filter?: 'text' | 'options'; defaultHidden?: boolean };
const USER_COLUMNS: UserColumn[] = [
  { key: 'id', label: 'UID', sortable: true, filter: 'text' },
  { key: 'user', label: '用户名', sortable: true, filter: 'text' },
  { key: 'status', label: '状态', sortable: true, defaultHidden: true },
  { key: 'expTime', label: '过期时间', sortable: true },
  { key: 'flow', label: '流量', sortable: true },
  { key: 'package', label: '套餐', sortable: false, filter: 'options' },
  { key: 'group', label: '用户组', sortable: false, filter: 'options' },
  { key: 'num', label: '最大规则数', sortable: true },
  { key: 'wallet', label: '钱包余额', sortable: true },
  { key: 'remark', label: '备注', sortable: false },
  { key: 'actions', label: '操作', sortable: false },
];
const USER_COLUMNS_STORAGE_KEY = 'user_table_visible_columns_v2';
// 筛选里表示「没有套餐 / 没有用户组」的选项值
const FILTER_NONE = 'none';

// 状态圆点颜色：与队列监控一致，用「圆点 + 文字」展示状态，不再用带底色的标签
const STATUS_DOT_CLASS: Record<string, string> = {
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500'
};

// 状态文字颜色：与圆点同色
const STATUS_TEXT_CLASS: Record<string, string> = {
  success: 'text-success-600',
  warning: 'text-warning-600',
  danger: 'text-danger-600'
};

// 获取用户状态（根据status字段）
const getUserStatus = (user: User) => {
  if (user.status === 1) {
    return { color: 'success' as const, text: '正常' };
  } else {
    return { color: 'danger' as const, text: '禁用' };
  }
};

const calculateUserTotalUsedFlow = (user: User): number => {
  return (user.inFlow || 0) + (user.outFlow || 0);
};

const calculateTunnelUsedFlow = (tunnel: UserTunnel): number => {
  const inFlow = tunnel.inFlow || 0;
  const outFlow = tunnel.outFlow || 0;
  
  // 后端已按计费类型处理流量，前端直接使用入站+出站总和
  return inFlow + outFlow;
};

// 流量重置日期下拉里直接提供的固定「每月几号」只到这一天，其余日期通过「自定义」选择
const PRESET_RESET_DAYS = 8;

// 套餐里编辑用户套餐时要用到的字段（接口返回的完整套餐里的一部分）
interface PackagePlanInfo {
  id: number;
  name: string;
  groupId?: number | null;
  traffic?: number;
  durationDays?: number;
  maxRules?: number;
}

// 与用户购买套餐（后端 OrderServiceImpl）一致：流量或规则数为 0 表示不限，写成 99999；永久套餐的到期时间为 2099-12-31
const UNLIMITED_QUOTA = 99999;
const PERMANENT_EXP_TIME = 4102415999000;

export default function UserPage() {
  // 状态管理
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  // 搜索词只在前端按用户名/昵称/UID 过滤，输入时实时生效，不再每次输入都重新请求后端
  // 搜索规则：表格只显示拥有匹配规则的用户；null 表示没有在搜索
  const [ruleFilters, setRuleFilters] = useState(EMPTY_RULE_SEARCH);
  const [ruleMatchedUserIds, setRuleMatchedUserIds] = useState<Set<number> | null>(null);
  const [ruleSearchLoading, setRuleSearchLoading] = useState(false);
  const [ruleSearchGroups, setRuleSearchGroups] = useState<Array<{ id: number; name: string; direction?: string }>>([]);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  // 排序三态：升序 → 降序 → 取消（恢复默认的 UID 升序，表头不高亮）
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // 表头筛选：UID、用户名输入搜索，套餐、用户组勾选
  const [textFilters, setTextFilters] = useState<Record<string, string>>({ id: '', user: '' });
  const [optionFilters, setOptionFilters] = useState<Record<string, string[]>>({ package: [], group: [] });
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(USER_COLUMNS_STORAGE_KEY) || 'null');
      if (Array.isArray(saved)) return saved.filter((k: string) => USER_COLUMNS.some(c => c.key === k));
    } catch { /* 读取失败时使用默认列 */ }
    return USER_COLUMNS.filter(c => !c.defaultHidden).map(c => c.key);
  });

  // 用户表单相关状态
  const { isOpen: isUserModalOpen, onOpen: onUserModalOpen, onClose: onUserModalClose } = useDisclosure();
  const [isEdit, setIsEdit] = useState(false);
  // 流量重置日期是否选了「自定义」（仅界面状态：自定义时额外显示重置日期与重置时刻输入）
  const [customReset, setCustomReset] = useState(false);
  const [userForm, setUserForm] = useState<UserForm>({
    user: '',
    pwd: '',
    status: 1,
    flow: 0,
    num: 0,
    expTime: null,
    flowResetTime: 0,
    flowResetClock: '00:00',
    groupId: null,
    packageId: null,
    walletBalance: 0,
    demoMode: 0,
    admin: false,
    remark: ''
  });
  const [userFormLoading, setUserFormLoading] = useState(false);

  // 清理无效用户 / 无效规则：打开时先查出会被清理的内容，没有内容时确定按钮不可点
  const [cleanupTarget, setCleanupTarget] = useState<'users' | 'forwards' | null>(null);
  const [cleanupItems, setCleanupItems] = useState<string[]>([]);
  const [cleanupLoading, setCleanupLoading] = useState(false);

  // 账号的页面权限分配：普通用户和管理员显示不同的选项；只有全权限管理员能看到入口
  const { permissions: myMenuPermissions } = useMenuPermissions();
  const { isOpen: isMenuPermissionOpen, onOpen: onMenuPermissionOpen, onClose: onMenuPermissionClose } = useDisclosure();
  const [menuPermissionUser, setMenuPermissionUser] = useState<User | null>(null);
  const [menuPermissionOptions, setMenuPermissionOptions] = useState<{ code: string; label: string }[]>([]);
  const [menuPermissionSelected, setMenuPermissionSelected] = useState<string[]>([]);
  const [menuPermissionSaving, setMenuPermissionSaving] = useState(false);

  // 演示账号的权限分配（只有开启演示模式的账号才显示入口）
  const { isOpen: isPermissionOpen, onOpen: onPermissionOpen, onClose: onPermissionClose } = useDisclosure();
  const [permissionUser, setPermissionUser] = useState<User | null>(null);
  const [permissionOptions, setPermissionOptions] = useState<{ code: string; label: string }[]>([]);
  const [permissionAreas, setPermissionAreas] = useState<string[]>([]);
  const [permissionRestoreTime, setPermissionRestoreTime] = useState<string | null>(null);
  const [permissionPending, setPermissionPending] = useState(0);
  const [permissionNextTime, setPermissionNextTime] = useState<number | null>(null);
  const [permissionBusy, setPermissionBusy] = useState(false);
  // 功能未开启的区域不显示，但已勾选的仍随保存提交，功能重新开启后恢复
  const visiblePermissionAreas = permissionAreas.filter(code => permissionOptions.some(option => option.code === code));

  // 用户组 / 套餐
  const [userGroups, setUserGroups] = useState<{ id: number; name: string }[]>([]);
  const [packagePlans, setPackagePlans] = useState<PackagePlanInfo[]>([]);

  // 编辑用户套餐（操作列的购物袋图标）：只更换用户绑定的套餐，不改动流量、规则数、到期时间等额度
  const { isOpen: isPackageModalOpen, onOpen: onPackageModalOpen, onClose: onPackageModalClose } = useDisclosure();
  const [packageTarget, setPackageTarget] = useState<User | null>(null);
  const [packageSelection, setPackageSelection] = useState<string>('');
  // 选中套餐后要把套餐里的哪些内容更新到用户身上（默认都不勾选，只更换绑定的套餐）
  const [applyFlow, setApplyFlow] = useState(false);
  const [applyGroup, setApplyGroup] = useState(false);
  const [applyRules, setApplyRules] = useState(false);
  const [applyExpire, setApplyExpire] = useState(false);
  const [packageSaving, setPackageSaving] = useState(false);

  // 隧道权限管理相关状态
  const { isOpen: isTunnelModalOpen, onOpen: onTunnelModalOpen, onClose: onTunnelModalClose } = useDisclosure();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userTunnels, setUserTunnels] = useState<UserTunnel[]>([]);
  const [tunnelListLoading, setTunnelListLoading] = useState(false);  
  
  // 分配新隧道权限相关状态
  const [tunnelForm, setTunnelForm] = useState<UserTunnelForm>({ tunnelId: null });
  const [assignLoading, setAssignLoading] = useState(false);

  // 删除确认相关状态
  const { isOpen: isDeleteModalOpen, onOpen: onDeleteModalOpen, onClose: onDeleteModalClose } = useDisclosure();
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // 删除隧道权限确认相关状态
  const { isOpen: isDeleteTunnelModalOpen, onOpen: onDeleteTunnelModalOpen, onClose: onDeleteTunnelModalClose } = useDisclosure();
  const [tunnelToDelete, setTunnelToDelete] = useState<UserTunnel | null>(null);

  // 重置流量确认相关状态
  const { isOpen: isResetFlowModalOpen, onOpen: onResetFlowModalOpen, onClose: onResetFlowModalClose } = useDisclosure();
  const [userToReset, setUserToReset] = useState<User | null>(null);
  const [resetFlowLoading, setResetFlowLoading] = useState(false);

  // 重置隧道流量确认相关状态
  const { isOpen: isResetTunnelFlowModalOpen, onOpen: onResetTunnelFlowModalOpen, onClose: onResetTunnelFlowModalClose } = useDisclosure();
  const [tunnelToReset, setTunnelToReset] = useState<UserTunnel | null>(null);
  const [resetTunnelFlowLoading, setResetTunnelFlowLoading] = useState(false);

  // 其他数据
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);

  // 生命周期
  useEffect(() => {
    loadUsers();
    loadTunnels();
    loadUserGroups();
    loadPackagePlans();
  }, []);

  // 数据加载函数
  const loadUsers = async (showLoading = true) => {
    setLoading(showLoading);
    try {
      const response = await getAllUsers({ current: 1, size: 1000, keyword: '' });
      
      if (response.code === 0) {
        const data = response.data || {};
        setUsers(data || []);
      } else {
        toast.error(response.msg || '获取用户列表失败');
      }
    } catch (error) {
      toast.error('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadTunnels = async () => {
    try {
      const response = await getTunnelList();
      if (response.code === 0) {
        setTunnels(response.data || []);
      }
    } catch (error) {
      console.error('获取隧道列表失败:', error);
    }
  };

  const loadUserGroups = async () => {
    try {
      const response = await getUserGroupList();
      if (response.code === 0) {
        setUserGroups(response.data || []);
      }
    } catch (error) {
      console.error('获取用户组列表失败:', error);
    }
  };

  const loadPackagePlans = async () => {
    try {
      const response = await getPackagePlanList();
      if (response.code === 0) {
        setPackagePlans(response.data || []);
      }
    } catch (error) {
      console.error('获取套餐列表失败:', error);
    }
  };

  const loadUserTunnels = async (userId: number) => {
    setTunnelListLoading(true);
    try {
      const response = await getUserTunnelList({ userId });
      if (response.code === 0) {
        setUserTunnels(response.data || []);
      } else {
        toast.error(response.msg || '获取隧道权限列表失败');
      }
    } catch (error) {
      toast.error('获取隧道权限列表失败');
    } finally {
      setTunnelListLoading(false);
    }
  };

  // 用户管理操作
  const handleAdd = () => {
    setIsEdit(false);
    setUserForm({
      user: '',
      pwd: '',
      status: 1,
      flow: 0,
      num: 0,
      expTime: null,
      flowResetTime: 0,
      flowResetClock: '00:00',
      groupId: null,
      packageId: null,
      walletBalance: 0,
      demoMode: 0,
      admin: false,
      remark: ''
    });
    setCustomReset(false);
    onUserModalOpen();
  };

  const handleEditPackage = (user: User) => {
    setPackageTarget(user);
    setPackageSelection(user.packageId ? String(user.packageId) : '');
    setApplyFlow(false); setApplyGroup(false); setApplyRules(false); setApplyExpire(false);
    onPackageModalOpen();
  };

  const handleSavePackage = async () => {
    if (!packageTarget) return;
    const plan = packagePlans.find(p => String(p.id) === packageSelection);
    if (!plan) {
      toast.error('请选择套餐');
      return;
    }
    setPackageSaving(true);
    try {
      // 更新接口需要完整的用户字段，这里沿用用户现有的值，再按勾选项用套餐里的内容覆盖；不带 pwd 表示不修改密码
      let expTime = packageTarget.expTime ?? null;
      if (applyExpire) {
        // 与购买套餐一致：有效天数从「当前到期时间与现在中较晚的一个」顺延，永久套餐设为 2099-12-31
        expTime = plan.durationDays && plan.durationDays > 0
          ? Math.max(Date.now(), expTime ?? 0) + plan.durationDays * 24 * 60 * 60 * 1000
          : PERMANENT_EXP_TIME;
      }
      const response = await updateUser({
        id: packageTarget.id,
        name: packageTarget.name,
        user: packageTarget.user,
        status: packageTarget.status,
        flow: applyFlow ? (plan.traffic && plan.traffic > 0 ? plan.traffic : UNLIMITED_QUOTA) : packageTarget.flow,
        num: applyRules ? (plan.maxRules && plan.maxRules > 0 ? plan.maxRules : UNLIMITED_QUOTA) : packageTarget.num,
        expTime,
        flowResetTime: packageTarget.flowResetTime ?? 0,
        flowResetClock: packageTarget.flowResetClock || '00:00',
        groupId: applyGroup ? (plan.groupId ?? null) : (packageTarget.groupId ?? null),
        packageId: plan.id,
        walletBalance: packageTarget.walletBalance ?? 0
      } as any);
      if (response.code === 0) {
        toast.success('套餐已更新');
        onPackageModalClose();
        loadUsers(false);
      } else {
        toast.error(response.msg || '更新套餐失败');
      }
    } catch (error) {
      toast.error('更新套餐失败');
    } finally {
      setPackageSaving(false);
    }
  };

  const handleEdit = (user: User) => {
    setIsEdit(true);
    setUserForm({
      id: user.id,
      name: user.name,
      user: user.user,
      pwd: '',
      status: user.status,
      flow: user.flow,
      num: user.num,
      expTime: user.expTime ? new Date(user.expTime) : null,
      flowResetTime: user.flowResetTime ?? 0,
      flowResetClock: user.flowResetClock || '00:00',
      groupId: user.groupId ?? null,
      packageId: user.packageId ?? null,
      walletBalance: user.walletBalance ?? 0,
      remark: user.remark ?? '',
      demoMode: user.roleId === 0 ? (user.demoMode ?? 0) : 0,
      admin: user.roleId === 0
    });
    // 重置日超出预设范围（9 号及以后），或重置时刻不是默认 00:00，都只能通过「自定义」表达，编辑时直接展示自定义状态
    const savedDay = user.flowResetTime ?? 0;
    setCustomReset(savedDay > 0 && (savedDay > PRESET_RESET_DAYS || (!!user.flowResetClock && user.flowResetClock !== '00:00')));
    onUserModalOpen();
  };

  const handleOpenCleanup = async (target: 'users' | 'forwards') => {
    const res = target === 'users' ? await getInvalidUsers() : await getInvalidForwards();
    if (res.code !== 0) {
      toast.error(res.msg || '获取清理内容失败');
      return;
    }
    setCleanupItems((res.data || []).map((item: { user?: string; name?: string; id: number }) => item.user ?? item.name ?? `#${item.id}`));
    setCleanupTarget(target);
  };

  const handleConfirmCleanup = async () => {
    setCleanupLoading(true);
    const res = cleanupTarget === 'users' ? await cleanInvalidUsers() : await cleanInvalidForwards();
    setCleanupLoading(false);
    if (res.code !== 0) {
      toast.error(res.msg || '清理失败');
      return;
    }
    const failures: string[] = res.data?.failures || [];
    if (failures.length > 0) {
      showErrorDialog({ title: `已清理 ${res.data?.deleted ?? 0} 项，${failures.length} 项失败`, message: failures.join('\n') });
    } else {
      toast.success(`已清理 ${res.data?.deleted ?? 0} 项`);
    }
    setCleanupTarget(null);
    loadUsers(false);
  };

  const handleOpenMenuPermission = async (target: User) => {
    const res = await getUserMenuPermissions(target.id);
    if (res.code !== 0) {
      toast.error(res.msg || '获取权限分配失败');
      return;
    }
    setMenuPermissionUser(target);
    setMenuPermissionOptions(res.data.options || []);
    setMenuPermissionSelected(res.data.selected || []);
    onMenuPermissionOpen();
  };

  const handleSaveMenuPermission = async () => {
    if (!menuPermissionUser) return;
    setMenuPermissionSaving(true);
    const res = await updateUserMenuPermissions(menuPermissionUser.id, menuPermissionSelected);
    setMenuPermissionSaving(false);
    if (res.code === 0) {
      toast.success('权限分配已保存');
      onMenuPermissionClose();
    } else {
      toast.error(res.msg || '保存失败');
    }
  };

  const loadPermission = async (target: User) => {
    const res = await getDemoPermission(target.id);
    if (res.code !== 0) {
      toast.error(res.msg || '获取演示权限分配失败');
      return false;
    }
    setPermissionOptions(res.data.options || []);
    setPermissionAreas(res.data.areas || []);
    setPermissionRestoreTime(res.data.restoreTime ?? null);
    setPermissionPending(res.data.pendingCount ?? 0);
    setPermissionNextTime(res.data.nextRestoreTime ?? null);
    return true;
  };

  const handleOpenPermission = async (target: User) => {
    setPermissionUser(target);
    if (await loadPermission(target)) onPermissionOpen();
  };

  const handleSavePermission = async () => {
    if (!permissionUser) return;
    setPermissionBusy(true);
    const res = await updateDemoPermission({ id: permissionUser.id, areas: permissionAreas, restoreTime: permissionRestoreTime });
    setPermissionBusy(false);
    if (res.code === 0) {
      toast.success('演示权限分配已保存');
      onPermissionClose();
    } else {
      toast.error(res.msg || '保存失败');
    }
  };

  const handlePermissionAction = async (action: 'restore' | 'commit') => {
    if (!permissionUser) return;
    setPermissionBusy(true);
    const res = action === 'restore' ? await restoreDemoChanges(permissionUser.id) : await commitDemoChanges(permissionUser.id);
    if (res.code === 0) {
      toast.success(action === 'restore' ? '已恢复' : '已设为初始配置');
      await loadPermission(permissionUser);
    } else {
      toast.error(res.msg || '操作失败');
    }
    setPermissionBusy(false);
  };

  const handleDelete = (user: User) => {
    setUserToDelete(user);
    onDeleteModalOpen();
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;

    try {
      const response = await deleteUser(userToDelete.id);
      if (response.code === 0) {
        toast.success('删除成功');
        loadUsers();
        onDeleteModalClose();
        setUserToDelete(null);
      } else {
        toast.error(response.msg || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const handleSubmitUser = async () => {
    if (!userForm.user || (!userForm.pwd && !isEdit)) {
      toast.error('请填写完整信息');
      return;
    }

    setUserFormLoading(true);
    try {
      const submitData: any = {
        ...userForm,
        expTime: userForm.expTime ? userForm.expTime.getTime() : null
      };

      if (isEdit && !submitData.pwd) {
        delete submitData.pwd;
      }

      const response = isEdit ? await updateUser(submitData) : await createUser(submitData);
      
      if (response.code === 0) {
        toast.success(isEdit ? '更新成功' : '创建成功');
        onUserModalClose();
        loadUsers();
      } else {
        toast.error(response.msg || (isEdit ? '更新失败' : '创建失败'));
      }
    } catch (error) {
      toast.error(isEdit ? '更新失败' : '创建失败');
    } finally {
      setUserFormLoading(false);
    }
  };

  // 跳转到独立的"管理转发规则"页（/user-forward，与普通用户自己使用的 /forward 是两个页面），
  // 代该用户查看/新增/编辑/删除转发规则；在新窗口打开，管理员可同时保留用户管理列表
  const openRuleSearch = async () => {
    setSearchModalOpen(true);
    // 入口、出口的选项；取不到时下拉框为空，其他条件仍可用
    try {
      const res = await getDeviceGroupList();
      if (res.code === 0) setRuleSearchGroups(res.data || []);
    } catch (error) {
      console.warn('获取设备组失败', error);
    }
  };

  const applyRuleSearch = async (filters: RuleSearchFilters) => {
    if (countRuleSearch(filters) === 0) {
      setRuleFilters(EMPTY_RULE_SEARCH);
      setRuleMatchedUserIds(null);
      setPage(1);
      setSearchModalOpen(false);
      return;
    }
    setRuleSearchLoading(true);
    try {
      const res = await getForwardList();
      if (res.code !== 0) { toast.error(res.msg || '搜索规则失败'); return; }
      const rules: Array<Parameters<typeof matchRuleSearch>[0] & { userId?: number }> = res.data || [];
      setRuleFilters(filters);
      setRuleMatchedUserIds(new Set(rules.filter(rule => matchRuleSearch(rule, filters)).map(rule => Number(rule.userId))));
      setPage(1);
      setSearchModalOpen(false);
    } catch (error) {
      toast.error('搜索规则失败');
    } finally {
      setRuleSearchLoading(false);
    }
  };

  const handleManageForwards = (user: User) => {
    window.open(`/user-forward?userId=${user.id}&userName=${encodeURIComponent(user.user)}`, '_blank');
  };

  // 隧道权限管理操作
  const handleManageTunnels = (user: User) => {
    setCurrentUser(user);
    setTunnelForm({ tunnelId: null });
    onTunnelModalOpen();
    loadUserTunnels(user.id);
  };

  const handleAssignTunnel = async () => {
    if (!tunnelForm.tunnelId || !currentUser) {
      toast.error('请选择隧道');
      return;
    }

    setAssignLoading(true);
    try {
      const response = await assignUserTunnel({
        userId: currentUser.id,
        tunnelId: tunnelForm.tunnelId
      });

      if (response.code === 0) {
        toast.success('分配成功');
        setTunnelForm({ tunnelId: null });
        loadUserTunnels(currentUser.id);
      } else {
        toast.error(response.msg || '分配失败');
      }
    } catch (error) {
      toast.error('分配失败');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleToggleTunnelStatus = async (userTunnel: UserTunnel) => {
    try {
      const response = await updateUserTunnel({
        id: userTunnel.id,
        status: userTunnel.status === 1 ? 0 : 1
      });

      if (response.code === 0) {
        toast.success(userTunnel.status === 1 ? '已禁用' : '已启用');
        if (currentUser) {
          loadUserTunnels(currentUser.id);
        }
      } else {
        toast.error(response.msg || '更新失败');
      }
    } catch (error) {
      toast.error('更新失败');
    }
  };

  const handleRemoveTunnel = (userTunnel: UserTunnel) => {
    setTunnelToDelete(userTunnel);
    onDeleteTunnelModalOpen();
  };

  const handleConfirmRemoveTunnel = async () => {
    if (!tunnelToDelete) return;

    try {
      const response = await removeUserTunnel({ id: tunnelToDelete.id });
      if (response.code === 0) {
        toast.success('删除成功');
        if (currentUser) {
          loadUserTunnels(currentUser.id);
        }
        onDeleteTunnelModalClose();
        setTunnelToDelete(null);
      } else {
        toast.error(response.msg || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  // 重置流量相关函数
  const handleResetFlow = (user: User) => {
    setUserToReset(user);
    onResetFlowModalOpen();
  };

  const handleConfirmResetFlow = async () => {
    if (!userToReset) return;

    setResetFlowLoading(true);
    try {
      const response = await resetUserFlow({ 
        id: userToReset.id, 
        type: 1 // 1表示重置用户流量
      });
      
      if (response.code === 0) {
        toast.success('流量重置成功');
        onResetFlowModalClose();
        setUserToReset(null);
        loadUsers(); // 重新加载用户列表
      } else {
        toast.error(response.msg || '重置失败');
      }
    } catch (error) {
      toast.error('重置失败');
    } finally {
      setResetFlowLoading(false);
    }
  };

  // 隧道流量重置相关函数
  const handleResetTunnelFlow = (userTunnel: UserTunnel) => {
    setTunnelToReset(userTunnel);
    onResetTunnelFlowModalOpen();
  };

  const handleConfirmResetTunnelFlow = async () => {
    if (!tunnelToReset) return;

    setResetTunnelFlowLoading(true);
    try {
      const response = await resetUserFlow({ 
        id: tunnelToReset.id, 
        type: 2 // 2表示重置隧道流量
      });
      
      if (response.code === 0) {
        toast.success('隧道流量重置成功');
        onResetTunnelFlowModalClose();
        setTunnelToReset(null);
        if (currentUser) {
          loadUserTunnels(currentUser.id); // 重新加载隧道权限列表
        }
      } else {
        toast.error(response.msg || '重置失败');
      }
    } catch (error) {
      toast.error('重置失败');
    } finally {
      setResetTunnelFlowLoading(false);
    }
  };

  // 过滤数据
  const availableTunnels = tunnels.filter(
    tunnel => !userTunnels.some(ut => ut.tunnelId === tunnel.id)
  );

  const groupNameOf = (groupId?: number | null) => {
    if (!groupId) return '未分组';
    return userGroups.find(g => g.id === groupId)?.name || `#${groupId}`;
  };

  const packageNameOf = (packageId?: number | null) => {
    if (!packageId) return null;
    return packagePlans.find(p => p.id === packageId)?.name || `#${packageId}`;
  };

  // 搜索过滤 + 排序 + 分页都在前端完成
  const sortedUsers = useMemo(() => {
    const filtered = ruleMatchedUserIds ? users.filter(u => ruleMatchedUserIds.has(u.id)) : users;
    const idKeyword = textFilters.id.trim();
    const nameKeyword = textFilters.user.trim().toLowerCase();
    const headerFiltered = filtered.filter(u =>
      (!idKeyword || String(u.id).includes(idKeyword)) &&
      (!nameKeyword || `${u.user} ${u.name || ''}`.toLowerCase().includes(nameKeyword)) &&
      (optionFilters.package.length === 0 || optionFilters.package.includes(u.packageId ? String(u.packageId) : FILTER_NONE)) &&
      (optionFilters.group.length === 0 || optionFilters.group.includes(u.groupId ? String(u.groupId) : FILTER_NONE))
    );
    const valueOf = (u: User): string | number => {
      switch (sortDescriptor?.column) {
        case 'user': return (u.name || u.user || '').toLowerCase();
        case 'status': return u.status;
        case 'expTime': return u.expTime || Number.MAX_SAFE_INTEGER; // 永久排在最后
        case 'flow': return calculateUserTotalUsedFlow(u);
        case 'package': return packageNameOf(u.packageId) || '';
        case 'group': return groupNameOf(u.groupId) || '';
        case 'num': return u.num;
        case 'wallet': return u.walletBalance ?? 0;
        default: return u.id;
      }
    };
    const dir = sortDescriptor?.direction === 'descending' ? -1 : 1;
    return [...headerFiltered].sort((x, y) => {
      const vx = valueOf(x), vy = valueOf(y);
      if (typeof vx === 'string' && typeof vy === 'string') return vx.localeCompare(vy, 'zh') * dir;
      return ((vx as number) - (vy as number)) * dir;
    });
  }, [users, ruleMatchedUserIds, textFilters, optionFilters, sortDescriptor, userGroups, packagePlans]);

  // 表格按行对象缓存单元格，对象不变就不会重新渲染：排序变化时要生成新的行对象，当前排序列的高亮才会更新
  const pagedUsers = useMemo(
    () => sortedUsers.slice((page - 1) * pageSize, page * pageSize).map(user => ({ ...user })),
    [sortedUsers, page, pageSize, sortDescriptor]
  );

  // 表格按列对象缓存表头内容，对象不变就不会重新渲染：筛选、排序或选项变化时要生成新的列对象，否则漏斗高亮和筛选值不会更新
  const visibleColumns = useMemo(
    () => USER_COLUMNS.filter(c => c.key === 'actions' || visibleColumnKeys.includes(c.key)).map(c => ({ ...c })),
    [visibleColumnKeys, textFilters, optionFilters, sortDescriptor, packagePlans, userGroups]
  );

  const toggleColumn = (key: string, checked: boolean) => {
    const next = checked ? [...visibleColumnKeys, key] : visibleColumnKeys.filter(k => k !== key);
    setVisibleColumnKeys(next);
    try { localStorage.setItem(USER_COLUMNS_STORAGE_KEY, JSON.stringify(next)); } catch { /* 存储不可用时仅本次生效 */ }
  };

  // 表头：标题 + 排序图标 + 筛选漏斗
  const renderHeaderFilter = (column: UserColumn) => {
    if (column.filter === 'text') {
      return (
        <TableHeaderFilter
          type="text"
          label={column.label}
          text={textFilters[column.key] ?? ''}
          onTextChange={(value) => { setTextFilters(prev => ({ ...prev, [column.key]: value })); setPage(1); }}
          onClear={() => { setTextFilters(prev => ({ ...prev, [column.key]: '' })); setPage(1); }}
        />
      );
    }
    const options = column.key === 'package'
      ? [{ value: FILTER_NONE, label: '无套餐' }, ...packagePlans.map(plan => ({ value: String(plan.id), label: plan.name }))]
      : [{ value: FILTER_NONE, label: '未分组' }, ...userGroups.map(group => ({ value: String(group.id), label: group.name }))];
    return (
      <TableHeaderFilter
        type="options"
        label={column.label}
        options={options}
        selected={optionFilters[column.key] ?? []}
        onSelectedChange={(values) => { setOptionFilters(prev => ({ ...prev, [column.key]: values })); setPage(1); }}
        onClear={() => { setOptionFilters(prev => ({ ...prev, [column.key]: [] })); setPage(1); }}
      />
    );
  };

  // 单元格渲染：按列 key 输出对应内容
  const renderUserCell = (user: User, key: string): React.ReactNode => {
    const userStatus = getUserStatus(user);
    const expStatus = isTimeConfigured(user.expTime) ? getExpireStatus(user.expTime) : null;
    const usedFlow = calculateUserTotalUsedFlow(user);
    // 没有流量配额（0）或已用完时用橙色提醒
    const flowWarning = user.flow <= 0 || usedFlow >= user.flow * 1024 * 1024 * 1024;
    switch (key) {
      case 'id':
        return String(user.id);
      case 'user':
        return (
          <div className="min-w-24">
            <p className="text-foreground">
              {user.name || user.user}
              {user.demoMode === 1 && <span className="ml-1.5 text-xs font-normal text-warning-600">演示</span>}
              {user.roleId === 0 && user.demoMode !== 1 && <span className="ml-1.5 text-xs font-normal text-primary">管理员</span>}
              {user.status === 0 && <span className="ml-1.5 text-xs font-normal text-danger">{user.disableReason === 2 ? '到期停用' : '封禁'}</span>}
            </p>
            {user.name && <p className="mt-0.5 text-xs text-default-500">@{user.user}</p>}
          </div>
        );
      case 'status':
        return (
          <span className={`inline-flex items-center gap-1.5 ${STATUS_TEXT_CLASS[userStatus.color]}`}>
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${STATUS_DOT_CLASS[userStatus.color]}`} />{userStatus.text}
          </span>
        );
      case 'expTime':
        return isTimeConfigured(user.expTime) ? (
          <div className="min-w-30">
            <p className={`text-sm whitespace-nowrap ${expStatus && expStatus.color !== 'success' ? 'text-warning-600' : ''}`}>{new Date(user.expTime).toLocaleString('zh-CN', { hour12: true })}</p>
            {/* 已过期的不再写「已过期」，日期本身已是橙色；快到期的仍提示「N天后过期」 */}
            {expStatus && expStatus.color === 'warning' && <p className="mt-0.5 text-xs text-warning-600">{expStatus.text}</p>}
          </div>
        ) : (
          // 没配置到期时间（为空或留空）时显示 1970/1/1 上午8:00:00，颜色与已过期一致
          <p className="text-sm whitespace-nowrap text-warning-600">{formatExpiryTime(user.expTime)}</p>
        );
      case 'flow':
        return (
          <div className="min-w-32">
            <p
              className={`whitespace-nowrap ${flowWarning ? 'text-orange-500' : ''}`}
              title={user.flowResetTime ? `每月 ${user.flowResetTime} 日${user.flowResetClock && user.flowResetClock !== '00:00' ? ` ${user.flowResetClock}` : ''}重置` : '不重置'}
            >
              {(usedFlow / (1024 * 1024 * 1024)).toFixed(2)} GiB / {Number(user.flow).toFixed(2)} GiB
            </p>
          </div>
        );
      case 'package':
        return packageNameOf(user.packageId) || <span className="text-default-500">—</span>;
      case 'group':
        return groupNameOf(user.groupId);
      case 'num':
        return user.num;
      case 'wallet':
        return <span className="whitespace-nowrap">{Number(user.walletBalance ?? 0)} 元</span>;
      case 'remark':
        return user.remark
          ? <span className="block max-w-48 truncate" title={user.remark}>{user.remark}</span>
          : <span className="text-default-500">—</span>;
      default:
        return (
          <div className="flex items-center gap-1.5 [&>button]:!border-1 [&>button]:!border-default-300">
            <TipButton isIconOnly size="sm" variant="bordered" onPress={() => handleManageForwards(user)} isDisabled={user.roleId === 0} title="管理转发规则">
              <PaperClipOutlined />
            </TipButton>
            <TipButton isIconOnly size="sm" variant="bordered" onPress={() => handleManageTunnels(user)} title="隧道权限" aria-label="隧道权限">
              <DisconnectOutlined />
            </TipButton>
            <TipButton isIconOnly size="sm" variant="bordered" onPress={() => handleEdit(user)} title="编辑">
              <EditIcon />
            </TipButton>
            {myMenuPermissions === null && (
              <TipButton isIconOnly size="sm" variant="bordered" onPress={() => handleOpenMenuPermission(user)} title="权限分配" aria-label="权限分配">
                <ControlOutlined />
              </TipButton>
            )}
            {user.demoMode === 1 && user.roleId === 0 && (
              <TipButton isIconOnly size="sm" variant="bordered" onPress={() => handleOpenPermission(user)} title="演示权限分配" aria-label="演示权限分配">
                <SafetyCertificateOutlined />
              </TipButton>
            )}
            <TipButton isIconOnly size="sm" variant="bordered" onPress={() => handleEditPackage(user)} isDisabled={user.roleId === 0} title="编辑用户套餐">
              <ShoppingOutlined />
            </TipButton>
            <TipButton isIconOnly size="sm" variant="bordered" onPress={() => handleResetFlow(user)} title="重置流量">
              <FireOutlined />
            </TipButton>
            <TipButton isIconOnly size="sm" variant="bordered" onPress={() => handleDelete(user)} isDisabled={user.roleId === 0 && user.demoMode !== 1} title="删除">
              <DeleteIcon />
            </TipButton>
          </div>
        );
    }
  };

  return (
    
      <div className="management-page px-4 lg:px-6 py-5 lg:py-6">
        <Card className="management-table-card max-w-[1600px] mx-auto">
          <CardHeader className="flex-row items-center justify-between gap-4 p-4 border-b border-default-100">
            <h1 className="text-base font-semibold text-foreground">用户管理</h1>
            <Popover placement="bottom-end">
              <PopoverTrigger>
                <Button size="sm" variant="bordered" className="border-1 border-dashed border-default-300 h-7 font-normal text-sm" startContent={<SettingOutlined />}>显示列</Button>
              </PopoverTrigger>
              <PopoverContent>
                <div className="p-2 flex flex-col gap-2">
                  {USER_COLUMNS.filter(c => c.key !== 'actions').map(c => (
                    <Checkbox
                      key={c.key}
                      size="sm"
                      isSelected={visibleColumnKeys.includes(c.key)}
                      onValueChange={(checked) => toggleColumn(c.key, checked)}
                    >
                      {c.label}
                    </Checkbox>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </CardHeader>
          <CardBody className="p-4 space-y-4">
            <div className="flex flex-nowrap items-center gap-3.5 overflow-x-auto [&>*]:shrink-0 [&>button]:!border-1 [&>button]:!border-default-300 [&>button]:!font-normal [&>button]:!text-sm">
              <Button size="sm" variant="bordered" onPress={handleAdd} startContent={<UserAddOutlined />}>添加用户</Button>
              <Button size="sm" variant="bordered" onPress={openRuleSearch} startContent={<SearchIcon />}>
                {countRuleSearch(ruleFilters) > 0 ? `搜索规则（${countRuleSearch(ruleFilters)}）` : '搜索规则'}
              </Button>
              <Button size="sm" variant="bordered" onPress={() => handleOpenCleanup('users')} startContent={<DeleteOutlined />}>清理无效用户</Button>
              <Button size="sm" variant="bordered" onPress={() => handleOpenCleanup('forwards')} startContent={<DeleteOutlined />}>清理无效规则</Button>
              <RefreshButton onRefresh={async () => { await loadUsers(false); if (countRuleSearch(ruleFilters) > 0) await applyRuleSearch(ruleFilters); }} />
            </div>
            <div className="settings-table-scroll">
            <Table
              aria-label="用户列表"
              removeWrapper
              sortDescriptor={sortDescriptor}
              onSortChange={(d) => {
                setSortDescriptor(nextSort(sortDescriptor, d));
                setPage(1);
              }}
              classNames={HEADER_TABLE_CLASS_NAMES}
            >
              <TableHeader columns={visibleColumns}>
                {(column) => (
                  <TableColumn
                    key={column.key}
                    allowsSorting={column.sortable}
                    className={`${HEADER_COLUMN_CLASS} ${sortDescriptor?.column === column.key ? '!bg-default-200 dark:!bg-[#2a2a2a]' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2.5">
                      <span>{column.label}</span>
                      {(column.sortable || column.filter) && (
                        <span className="inline-flex items-center gap-1.5">
                          {column.sortable && <SortCarets direction={sortDescriptor?.column === column.key ? sortDescriptor.direction : undefined} />}
                          {column.filter && renderHeaderFilter(column)}
                        </span>
                      )}
                    </div>
                  </TableColumn>
                )}
              </TableHeader>
              <TableBody
                items={pagedUsers}
                isLoading={loading}
                loadingContent={<Spinner size="sm" label="正在加载..." />}
                emptyContent={<EmptyState />}
              >
                {(user) => (
                  <TableRow key={user.id}>
                    {(columnKey) => <TableCell className={sortDescriptor?.column === columnKey ? 'bg-default-100 dark:bg-[#212121]' : undefined}>{renderUserCell(user, String(columnKey))}</TableCell>}
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
            <div>
              <TablePagination
                total={sortedUsers.length}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
              />
            </div>
          </CardBody>
        </Card>

        {/* 搜索用户模态框：输入时实时按用户名/昵称/UID 过滤列表 */}
        <RuleSearchModal
          isOpen={searchModalOpen}
          onOpenChange={setSearchModalOpen}
          title="搜索用户规则"
          filters={ruleFilters}
          deviceGroups={ruleSearchGroups}
          loading={ruleSearchLoading}
          onConfirm={applyRuleSearch}
        />


      {/* 用户表单模态框 */}
      <Modal
        isOpen={isUserModalOpen}
        onClose={onUserModalClose}
        size="md"
      scrollBehavior="outside"
      backdrop="opaque"
      placement="center"
      >
        <ModalContent>
          <ModalHeader>
            <h2 className="text-base font-semibold">
              {isEdit ? `编辑用户 ${userForm.name || userForm.user} (UID=${userForm.id})` : '新增用户'}
            </h2>
          </ModalHeader>
          <ModalBody>
            {/* 单列表单：标题在输入框上方，带单位的字段（GB、元）把单位贴在输入框右侧 */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <FieldLabel tip="开启后该账号可以进入后台，拥有和其他管理员相同的全部权限，包括查看密钥、修改配置、编辑其他管理员。开启后可以再打开演示模式，成为只读的演示管理员。开启后需要重新登录；取消后旧登录立即失效，演示模式也一起关闭。不能取消自己的管理员权限，至少要保留一名可用的管理员">管理员</FieldLabel>
                <Switch
                  size="sm"
                  aria-label="管理员"
                  isSelected={userForm.admin === true}
                  onValueChange={(checked) => setUserForm(prev => ({ ...prev, admin: checked, demoMode: checked ? prev.demoMode : 0 }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <FieldLabel tip="封禁后该用户无法登录与使用转发功能">封禁</FieldLabel>
                <Switch
                  size="sm"
                  aria-label="封禁"
                  isSelected={userForm.status === 0}
                  onValueChange={(checked) => setUserForm(prev => ({ ...prev, status: checked ? 0 : 1 }))}
                />
              </div>

              {userForm.admin === true && (
                <div className="flex items-center justify-between">
                  <FieldLabel tip="开启后该账号是演示管理员：能看到完整后台，但只读，修改时提示禁止编辑，密钥、IP、用户名等敏感信息会被隐藏，可在演示权限分配里开放部分配置。需要重新登录才生效。注意：关闭演示模式时如果管理员开关开着，该账号会成为拥有全部权限的真管理员">演示模式</FieldLabel>
                  <Switch
                    size="sm"
                    aria-label="演示模式"
                    isSelected={userForm.demoMode === 1}
                    onValueChange={(checked) => setUserForm(prev => ({ ...prev, demoMode: checked ? 1 : 0 }))}
                  />
                </div>
              )}

              <div>
                <FieldLabel required>用户名</FieldLabel>
                <Input
                  aria-label="用户名" autoComplete="off" variant="bordered"
                  value={userForm.user}
                  onChange={(e) => setUserForm(prev => ({ ...prev, user: e.target.value }))}
                />
              </div>

              <div>
                <FieldLabel required={!isEdit}>密码</FieldLabel>
                <Input
                  aria-label="密码" autoComplete="off" variant="bordered" type="password"
                  value={userForm.pwd}
                  onChange={(e) => setUserForm(prev => ({ ...prev, pwd: e.target.value }))}
                  placeholder={isEdit ? '留空则不修改密码' : '请输入密码'}
                />
              </div>

              <div>
                <FieldLabel>用户组</FieldLabel>
                <Select listboxProps={{ emptyContent: <EmptyState compact /> }}
                  aria-label="用户组" variant="bordered" placeholder="未分组"
                  selectedKeys={userForm.groupId ? [userForm.groupId.toString()] : []}
                  onSelectionChange={(keys) => {
                    const value = Array.from(keys)[0] as string;
                    setUserForm(prev => ({ ...prev, groupId: value ? Number(value) : null }));
                  }}
                >
                  {userGroups.map(group => (
                    <SelectItem key={group.id.toString()} textValue={group.name || `#${group.id}`}>
                      {group.name || `#${group.id}`}
                    </SelectItem>
                  ))}
                </Select>
              </div>

              <div>
                <FieldLabel>套餐</FieldLabel>
                <Select listboxProps={{ emptyContent: <EmptyState compact /> }}
                  aria-label="套餐" variant="bordered" placeholder="无套餐"
                  selectedKeys={userForm.packageId ? [userForm.packageId.toString()] : []}
                  onSelectionChange={(keys) => {
                    const value = Array.from(keys)[0] as string;
                    setUserForm(prev => ({ ...prev, packageId: value ? Number(value) : null }));
                  }}
                >
                  {packagePlans.map(plan => (
                    <SelectItem key={plan.id.toString()} textValue={plan.name}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </Select>
              </div>

              <div>
                <FieldLabel tip="0 为无配额，用户需要购买套餐后才能使用转发功能">流量限制</FieldLabel>
                <UnitField unit="GB">
                  <Input
                    aria-label="流量限制" autoComplete="off" variant="bordered" type="number"
                    classNames={{ inputWrapper: "rounded-r-none" }}
                    value={userForm.flow.toString()}
                    onChange={(e) => {
                      const value = Math.min(Math.max(Number(e.target.value) || 0, 0), 99999);
                      setUserForm(prev => ({ ...prev, flow: value }));
                    }}
                    min="0"
                    max="99999"
                  />
                </UnitField>
              </div>

              <div>
                <FieldLabel tip="0 为无配额，用户需要购买套餐后才能使用转发功能">转发数量</FieldLabel>
                <Input
                  aria-label="转发数量" autoComplete="off" variant="bordered" type="number"
                  value={userForm.num.toString()}
                  onChange={(e) => {
                    const value = Math.min(Math.max(Number(e.target.value) || 0, 0), 99999);
                    setUserForm(prev => ({ ...prev, num: value }));
                  }}
                  min="0"
                  max="99999"
                />
              </div>

              <div>
                <FieldLabel>流量重置日期</FieldLabel>
                <Select listboxProps={{ emptyContent: <EmptyState compact /> }}
                  aria-label="流量重置日期" variant="bordered"
                  selectedKeys={[customReset ? 'custom' : userForm.flowResetTime.toString()]}
                  onSelectionChange={(keys) => {
                    const value = Array.from(keys)[0] as string;
                    if (!value) return;
                    if (value === 'custom') {
                      // 选择「自定义」：沿用当前已选的重置日（原先是「不重置」则默认每月 1 日），重置时刻由下方输入框决定
                      setCustomReset(true);
                      setUserForm(prev => ({ ...prev, flowResetTime: prev.flowResetTime > 0 ? prev.flowResetTime : 1 }));
                    } else {
                      // 选择固定的每月几号或「不重置」：重置时刻恢复为默认 0 点
                      setCustomReset(false);
                      setUserForm(prev => ({ ...prev, flowResetTime: Number(value), flowResetClock: '00:00' }));
                    }
                  }}
                >
                  <>
                    <SelectItem key="0" textValue="不重置">
                      不重置
                    </SelectItem>
                    <SelectItem key="custom" textValue="自定义">
                      自定义
                    </SelectItem>
                  {Array.from({ length: PRESET_RESET_DAYS }, (_, i) => i + 1).map(day => (
                    <SelectItem key={day.toString()} textValue={`每月${day}号`}>
                      每月{day}号
                    </SelectItem>
                  ))}
                  </>
                </Select>
              </div>

              {customReset && (
                <>
                  <div>
                    <FieldLabel>自定义重置日期</FieldLabel>
                    <DayOfMonthPicker
                      value={String(userForm.flowResetTime)}
                      onChange={(value) => setUserForm(prev => ({ ...prev, flowResetTime: Number(value) }))}
                    />
                  </div>
                  <div>
                    <FieldLabel>自定义重置时刻</FieldLabel>
                    <Input
                      aria-label="自定义重置时刻" variant="bordered" type="time"
                      value={userForm.flowResetClock}
                      onChange={(e) => setUserForm(prev => ({ ...prev, flowResetClock: e.target.value || '00:00' }))}
                    />
                  </div>
                </>
              )}

              <div>
                <FieldLabel tip="留空表示永不过期">过期时间</FieldLabel>
                <DateTimePicker
                  ariaLabel="过期时间"
                  value={userForm.expTime}
                  onChange={(date) => setUserForm(prev => ({ ...prev, expTime: date }))}
                />
              </div>

              <div>
                <FieldLabel>钱包余额</FieldLabel>
                <UnitField unit="元">
                  <Input
                    aria-label="钱包余额" autoComplete="off" variant="bordered" type="number"
                    classNames={{ inputWrapper: "rounded-r-none" }}
                    value={(userForm.walletBalance ?? 0).toString()}
                    onChange={(e) => setUserForm(prev => ({ ...prev, walletBalance: parseFloat(e.target.value) || 0 }))}
                  />
                </UnitField>
              </div>

              <div>
                <FieldLabel>备注</FieldLabel>
                <Textarea
                  aria-label="备注" autoComplete="off" variant="bordered" minRows={2} maxLength={500}
                  value={userForm.remark ?? ''}
                  onChange={(e) => setUserForm(prev => ({ ...prev, remark: e.target.value }))}
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button size="sm" variant="bordered" onPress={onUserModalClose}>
              取消
            </Button>
            <Button size="sm"
              color="primary"
              onPress={handleSubmitUser}
              isLoading={userFormLoading}
            >
              确定
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 隧道权限管理模态框 */}
      <Modal
        isOpen={isTunnelModalOpen}
        onClose={onTunnelModalClose}
        size="2xl"
      scrollBehavior="outside"
      backdrop="opaque"
      placement="center"
        isDismissable={false}
        classNames={{
          base: "max-w-[95vw] sm:max-w-4xl"
        }}
      >
        <ModalContent>
          <ModalHeader>
            <h2 className="text-base font-semibold">用户 {currentUser?.user} 的隧道权限管理</h2>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-6">
              {/* 分配新权限部分：流量/转发数量/到期时间等额度统一由账号自身的套餐控制，
                  这里只代表"该用户可以使用这条隧道" */}
              <div>
                <h3 className="text-lg font-semibold mb-4">分配新权限</h3>
                <div className="flex flex-row gap-3 items-end">
                  <Select labelPlacement="outside-top" listboxProps={{ emptyContent: <EmptyState compact /> }}
                    size="sm"
                    label="选择隧道"
                    className="flex-1"
                    selectedKeys={tunnelForm.tunnelId ? [tunnelForm.tunnelId.toString()] : []}
                    onSelectionChange={(keys) => {
                      const value = Array.from(keys)[0] as string;
                      setTunnelForm({ tunnelId: Number(value) || null });
                    }}
                  >
                    {availableTunnels.map(tunnel => (
                      <SelectItem key={tunnel.id.toString()} textValue={tunnel.name}>
                        {tunnel.name}
                      </SelectItem>
                    ))}
                  </Select>

                  <Button
                    color="default"
                    onPress={handleAssignTunnel}
                    isLoading={assignLoading}
                  >
                    分配权限
                  </Button>
                </div>
              </div>

              {/* 已有权限部分 */}
              <div>
                <h3 className="text-lg font-semibold mb-4">已有权限</h3>
                <Table
                  aria-label="用户隧道权限列表"
                  classNames={{
                    wrapper: "shadow-none",
                    th: "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium max-md:whitespace-nowrap",
                    td: "max-md:whitespace-nowrap"
                  }}
                >
                  <TableHeader>
                    <TableColumn>隧道名称</TableColumn>
                    <TableColumn>已用流量</TableColumn>
                    <TableColumn>状态</TableColumn>
                    <TableColumn>操作</TableColumn>
                  </TableHeader>
                  <TableBody
                    items={userTunnels}
                    isLoading={tunnelListLoading}
                    loadingContent={<Spinner />}
                    emptyContent={<EmptyState className="py-8" />}
                  >
                    {(userTunnel) => (
                      <TableRow key={userTunnel.id}>
                        <TableCell>{userTunnel.tunnelName}</TableCell>
                        <TableCell>{formatFlow(calculateTunnelUsedFlow(userTunnel))}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 ${userTunnel.status === 1 ? STATUS_TEXT_CLASS.success : STATUS_TEXT_CLASS.danger}`}>
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${userTunnel.status === 1 ? STATUS_DOT_CLASS.success : STATUS_DOT_CLASS.danger}`} />
                            {userTunnel.status === 1 ? '正常' : '禁用'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="flat"
                              color="default"
                              onClick={() => handleToggleTunnelStatus(userTunnel)}
                            >
                              {userTunnel.status === 1 ? '禁用' : '启用'}
                            </Button>
                            <TipButton
                              size="sm"
                              variant="flat"
                              color="default"
                              isIconOnly
                              onClick={() => handleResetTunnelFlow(userTunnel)}
                              title="重置流量"
                            >
                              <FireOutlined />
                            </TipButton>
                            <Button
                              size="sm"
                              variant="flat"
                              color="danger"
                              isIconOnly
                              onClick={() => handleRemoveTunnel(userTunnel)}
                            >
                              <DeleteIcon />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button size="sm" variant="bordered" onPress={onTunnelModalClose}>
              关闭
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 删除确认对话框 */}
      {/* 编辑用户套餐：选择套餐，并勾选要把套餐里的哪些内容更新到该用户 */}
      <Modal isOpen={cleanupTarget !== null} onClose={() => setCleanupTarget(null)} size="sm" backdrop="opaque" placement="center" hideCloseButton classNames={{ base: "max-w-[416px]" }}>
        <ModalContent>
          <ModalHeader>
            <h2 className="text-base font-semibold">{cleanupTarget === 'users' ? '清理无效用户' : '清理无效规则'}</h2>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4 text-sm text-foreground">
              <p>
                {cleanupTarget === 'users'
                  ? '用户组与余额均为 0 的用户，即从未付费的用户，将被删除，且不可恢复。同时这些用户的规则、单端设备等将被删除。绑定了套餐或有已支付订单的用户，以及管理员，不会被清理。'
                  : '清理用户或入口或出口已被删除的规则。'}
              </p>
              {cleanupItems.length === 0 ? (
                <p className="font-semibold">{cleanupTarget === 'users' ? '没有发现需要清理的用户。' : '没有发现需要清理的规则。'}</p>
              ) : (
                <div>
                  <p className="font-semibold">{`将清理 ${cleanupItems.length} ${cleanupTarget === 'users' ? '个用户' : '条规则'}：`}</p>
                  <p className="mt-1 max-h-32 overflow-y-auto break-words text-default-600">{cleanupItems.join('、')}</p>
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button size="sm" variant="bordered" className="border-1 border-default-300 text-sm font-normal" onPress={() => setCleanupTarget(null)}>取 消</Button>
            <Button size="sm" color={cleanupItems.length === 0 ? 'default' : 'danger'} className="text-sm font-normal" isDisabled={cleanupItems.length === 0} isLoading={cleanupLoading} onPress={handleConfirmCleanup}>确 定</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isMenuPermissionOpen} onClose={onMenuPermissionClose} size="md" backdrop="opaque" placement="center">
        <ModalContent>
          <ModalHeader>
            <h2 className="text-base font-semibold">权限分配 {menuPermissionUser?.user}</h2>
          </ModalHeader>
          <ModalBody>
            <div>
              <FieldLabel tip="取消勾选后，该账号看不到对应页面，也不能调用相关接口；主页和个人中心所有账号都能用。受限管理员不能操作管理员账号，也不能分配权限。修改立即生效，页面刷新后菜单更新">可使用的页面</FieldLabel>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {menuPermissionOptions.map(option => (
                  <Checkbox
                    key={option.code}
                    size="sm"
                    isSelected={menuPermissionSelected.includes(option.code)}
                    onValueChange={(checked) => setMenuPermissionSelected(prev => checked ? [...prev, option.code] : prev.filter(code => code !== option.code))}
                  >
                    {option.label}
                  </Checkbox>
                ))}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button size="sm" variant="light" onPress={onMenuPermissionClose}>取消</Button>
            <Button size="sm" color="primary" isLoading={menuPermissionSaving} onPress={handleSaveMenuPermission}>保存</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isPermissionOpen} onClose={onPermissionClose} size="md" backdrop="opaque" placement="center">
        <ModalContent>
          <ModalHeader>
            <h2 className="text-base font-semibold">演示权限分配 {permissionUser?.user}</h2>
          </ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-4">
              <div>
                <FieldLabel tip="勾选后该演示账号可以修改对应区域。默认都不勾选，对应功能未开启的区域不显示。无论勾选哪些：密钥和影响注册、登录的设置不能改，不能提权、不能碰管理员账号、不能改密码和余额，打码内容不会写回">可编辑区域</FieldLabel>
                <div className="flex flex-wrap gap-4 pt-1">
                  {permissionOptions.map(option => (
                    <Checkbox
                      key={option.code}
                      size="sm"
                      isSelected={permissionAreas.includes(option.code)}
                      onValueChange={(checked) => setPermissionAreas(prev => checked ? [...prev, option.code] : prev.filter(code => code !== option.code))}
                    >
                      {option.label}
                    </Checkbox>
                  ))}
                </div>
                {visiblePermissionAreas.some(code => ['package', 'redeemCode', 'inviteCode', 'order'].includes(code)) && (
                  <p className="pt-2 text-xs text-warning-600">
                    套餐内容、兑换码、邀请码、订单的改动会影响真实用户和资金，定时恢复只能还原数据，已经发生的后果撤销不了：恢复前可能有用户按演示账号改的价格下单，访客也可以自定义兑换码和邀请码，再用普通账号兑换余额或注册。公开给访客的账号不建议勾选。
                  </p>
                )}
                {visiblePermissionAreas.some(code => ['node', 'tunnel', 'forward', 'forwardGroup', 'deviceGroup', 'speedLimit', 'user'].includes(code)) && (
                  <p className="pt-2 text-xs text-danger">
                    节点、隧道、转发规则、转发分组、设备、限速规则、用户的改动会立即影响线上流量：访客可以把真实用户的流量转到任意地址，也可以删除规则或节点造成断线。恢复时会重新下发配置，但节点离线或下发失败时可能和面板不一致。只适合没有真实业务的演示环境，公开给访客的账号不要勾选。
                  </p>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <FieldLabel tip="开启后每天到这个时刻（按面板服务器时间）撤销该账号的改动，时刻之后才发生的改动等到第二天；期间被真管理员改过的内容不会被覆盖">每日自动恢复</FieldLabel>
                  <Switch
                    size="sm"
                    aria-label="每日自动恢复"
                    isSelected={permissionRestoreTime !== null}
                    onValueChange={(checked) => setPermissionRestoreTime(checked ? '00:00' : null)}
                  />
                </div>
                {permissionRestoreTime !== null && (
                  <div className="pt-2">
                    <TimeWheelPicker ariaLabel="恢复时刻" value={permissionRestoreTime} onChange={setPermissionRestoreTime} />
                  </div>
                )}
              </div>
              <div className="text-sm text-default-600">
                <p>待恢复的改动：{permissionPending} 项</p>
                {permissionPending > 0 && <p>下次恢复时间：{permissionNextTime ? new Date(permissionNextTime).toLocaleString() : '不自动恢复'}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="bordered" isDisabled={permissionPending === 0 || permissionBusy} onPress={() => handlePermissionAction('restore')}>立即恢复</Button>
                <Button size="sm" variant="bordered" isDisabled={permissionPending === 0 || permissionBusy} onPress={() => handlePermissionAction('commit')} title="保留现在的内容作为初始配置，已有改动不再恢复">设为初始配置</Button>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button size="sm" variant="light" onPress={onPermissionClose}>取消</Button>
            <Button size="sm" color="primary" isLoading={permissionBusy} onPress={handleSavePermission}>保存</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isPackageModalOpen} onClose={onPackageModalClose} size="sm" backdrop="opaque" placement="center">
        <ModalContent>
          <ModalHeader>
            <h2 className="text-base font-semibold">编辑用户套餐{packageTarget ? ` ${packageTarget.name || packageTarget.user} (UID=${packageTarget.id})` : ''}</h2>
          </ModalHeader>
          <ModalBody className="gap-3">
            <div>
              <FieldLabel>套餐</FieldLabel>
              <Select
                listboxProps={{ emptyContent: <EmptyState compact /> }}
                aria-label="套餐" variant="bordered" placeholder="请选择套餐"
                selectedKeys={packageSelection ? [packageSelection] : []}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as string;
                  if (value) setPackageSelection(value);
                }}
              >
                {packagePlans.map(plan => (
                  <SelectItem key={plan.id.toString()} textValue={plan.name}>{plan.name}</SelectItem>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-3 pt-1">
              <Checkbox size="sm" isSelected={applyFlow} onValueChange={setApplyFlow}>更新流量</Checkbox>
              <Checkbox size="sm" isSelected={applyGroup} onValueChange={setApplyGroup}>更新用户组</Checkbox>
              <Checkbox size="sm" isSelected={applyRules} onValueChange={setApplyRules}>更新最大规则数</Checkbox>
              <Checkbox size="sm" isSelected={applyExpire} onValueChange={setApplyExpire}>更新到期时间</Checkbox>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button size="sm" variant="bordered" onPress={onPackageModalClose}>取 消</Button>
            <Button size="sm" color="primary" onPress={handleSavePackage} isLoading={packageSaving} isDisabled={!packageSelection}>确 定</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmDialog
        isOpen={isDeleteModalOpen}
        onOpenChange={(open) => !open && onDeleteModalClose()}
        title="确认删除用户"
        message={<>你确定要删除用户 {userToDelete?.user} 吗？此操作不可撤销，用户的所有数据将被永久删除。</>}
        confirmText="确定"
        confirmColor="danger"
        onConfirm={handleConfirmDelete}
      />

      {/* 删除隧道权限确认对话框 */}
      <ConfirmDialog
        isOpen={isDeleteTunnelModalOpen}
        onOpenChange={(open) => !open && onDeleteTunnelModalClose()}
        title="确认删除隧道权限"
        message={<>你确定要删除用户 {currentUser?.user} 对隧道 {tunnelToDelete?.tunnelName} 的权限吗？删除后该用户将无法使用此隧道创建转发，此操作不可撤销。</>}
        confirmText="确定"
        confirmColor="danger"
        onConfirm={handleConfirmRemoveTunnel}
      />

      {/* 重置流量确认对话框 */}
      <ConfirmDialog
        isOpen={isResetFlowModalOpen}
        onOpenChange={(open) => !open && onResetFlowModalClose()}
        title="确认重置流量"
        confirmText="确定"
        confirmColor="warning"
        onConfirm={handleConfirmResetFlow}
        loading={resetFlowLoading}
        message={
          <>
            <p>你确定要重置用户 {userToReset?.user} 的流量吗？重置后上下行流量将归零，只重置账号流量，不重置隧道权限流量，此操作不可撤销。</p>
            <p>当前已用：上行 {userToReset ? formatFlow(userToReset.inFlow || 0) : '-'}，下行 {userToReset ? formatFlow(userToReset.outFlow || 0) : '-'}，总计 {userToReset ? formatFlow(calculateUserTotalUsedFlow(userToReset)) : '-'}。</p>
          </>
        }
      />

      {/* 重置隧道流量确认对话框 */}
      <ConfirmDialog
        isOpen={isResetTunnelFlowModalOpen}
        onOpenChange={(open) => !open && onResetTunnelFlowModalClose()}
        title="确认重置隧道流量"
        confirmText="确定"
        confirmColor="warning"
        onConfirm={handleConfirmResetTunnelFlow}
        loading={resetTunnelFlowLoading}
        message={
          <>
            <p>你确定要重置用户 {currentUser?.user} 对隧道 {tunnelToReset?.tunnelName} 的流量吗？重置后上下行流量将归零，只重置隧道权限流量，不重置账号流量，此操作不可撤销。</p>
            <p>当前已用：上行 {tunnelToReset ? formatFlow(tunnelToReset.inFlow || 0) : '-'}，下行 {tunnelToReset ? formatFlow(tunnelToReset.outFlow || 0) : '-'}，总计 {tunnelToReset ? formatFlow(calculateTunnelUsedFlow(tunnelToReset)) : '-'}。</p>
          </>
        }
      />
      </div>
    
  );
} 
