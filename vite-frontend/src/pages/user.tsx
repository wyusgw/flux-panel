import React, { useState, useEffect, useMemo } from 'react';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Input } from "@heroui/input";
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
import { DatePicker } from "@heroui/date-picker";
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
import { SearchIcon, EditIcon, DeleteIcon, UserIcon, SettingsIcon } from '@/components/icons';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FieldLabel, UnitField } from '@/components/form-field';
import { parseDate, today, getLocalTimeZone } from "@internationalized/date";
import RefreshButton from "@/components/refresh-button";
import { DayOfMonthPicker } from "@/components/day-of-month-picker";


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

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString();
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

// 用户列表的列定义：UID、用户名等可点击表头排序；「显示列」里可以勾选要显示哪些列（操作列固定显示）
const USER_COLUMNS = [
  { key: 'id', label: 'UID', sortable: true },
  { key: 'user', label: '用户名', sortable: true },
  { key: 'status', label: '状态', sortable: true },
  { key: 'expTime', label: '过期时间', sortable: true },
  { key: 'flow', label: '流量', sortable: true },
  { key: 'package', label: '套餐', sortable: true },
  { key: 'group', label: '用户组', sortable: true },
  { key: 'num', label: '最大规则数', sortable: true },
  { key: 'wallet', label: '钱包余额', sortable: true },
  { key: 'actions', label: '操作', sortable: false },
];
const USER_COLUMNS_STORAGE_KEY = 'user_table_visible_columns';

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
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({ column: 'id', direction: 'ascending' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(USER_COLUMNS_STORAGE_KEY) || 'null');
      if (Array.isArray(saved)) return saved.filter((k: string) => USER_COLUMNS.some(c => c.key === k));
    } catch { /* 读取失败时使用默认全部显示 */ }
    return USER_COLUMNS.map(c => c.key);
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
    walletBalance: 0
  });
  const [userFormLoading, setUserFormLoading] = useState(false);

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
      walletBalance: 0
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
      walletBalance: user.walletBalance ?? 0
    });
    // 重置日超出预设范围（9 号及以后），或重置时刻不是默认 00:00，都只能通过「自定义」表达，编辑时直接展示自定义状态
    const savedDay = user.flowResetTime ?? 0;
    setCustomReset(savedDay > 0 && (savedDay > PRESET_RESET_DAYS || (!!user.flowResetClock && user.flowResetClock !== '00:00')));
    onUserModalOpen();
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
    const keyword = searchKeyword.trim().toLowerCase();
    const filtered = keyword
      ? users.filter(u => `${u.id} #${u.id} ${u.user} ${u.name || ''}`.toLowerCase().includes(keyword))
      : users;
    const valueOf = (u: User): string | number => {
      switch (sortDescriptor.column) {
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
    const dir = sortDescriptor.direction === 'descending' ? -1 : 1;
    return [...filtered].sort((x, y) => {
      const vx = valueOf(x), vy = valueOf(y);
      if (typeof vx === 'string' && typeof vy === 'string') return vx.localeCompare(vy, 'zh') * dir;
      return ((vx as number) - (vy as number)) * dir;
    });
  }, [users, searchKeyword, sortDescriptor, userGroups, packagePlans]);

  const pagedUsers = useMemo(() => sortedUsers.slice((page - 1) * pageSize, page * pageSize), [sortedUsers, page, pageSize]);

  const visibleColumns = USER_COLUMNS.filter(c => c.key === 'actions' || visibleColumnKeys.includes(c.key));

  const toggleColumn = (key: string, checked: boolean) => {
    const next = checked ? [...visibleColumnKeys, key] : visibleColumnKeys.filter(k => k !== key);
    setVisibleColumnKeys(next);
    try { localStorage.setItem(USER_COLUMNS_STORAGE_KEY, JSON.stringify(next)); } catch { /* 存储不可用时仅本次生效 */ }
  };

  // 单元格渲染：按列 key 输出对应内容
  const renderUserCell = (user: User, key: string): React.ReactNode => {
    const userStatus = getUserStatus(user);
    const expStatus = user.expTime ? getExpireStatus(user.expTime) : null;
    const usedFlow = calculateUserTotalUsedFlow(user);
    // 没有流量配额（0）或已用完时用橙色提醒
    const flowWarning = user.flow <= 0 || usedFlow >= user.flow * 1024 * 1024 * 1024;
    switch (key) {
      case 'id':
        return `#${user.id}`;
      case 'user':
        return (
          <div className="min-w-24">
            <p className="font-medium text-foreground">{user.name || user.user}</p>
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
        return user.expTime ? (
          <div className="min-w-30">
            <p className={`text-sm whitespace-nowrap ${expStatus && expStatus.color !== 'success' ? 'text-warning-600' : ''}`}>{formatDate(user.expTime)}</p>
            {expStatus && expStatus.color !== 'success' && <p className="mt-0.5 text-xs text-warning-600">{expStatus.text}</p>}
          </div>
        ) : <span className="text-default-500">永久</span>;
      case 'flow':
        return (
          <div className="min-w-32">
            <p className={`whitespace-nowrap ${flowWarning ? 'text-warning-600' : ''}`}>{formatFlow(usedFlow)} / {formatFlow(user.flow, 'gb')}</p>
            <p className="mt-0.5 text-xs text-default-500">{user.flowResetTime ? `每月 ${user.flowResetTime} 日${user.flowResetClock && user.flowResetClock !== '00:00' ? ` ${user.flowResetClock}` : ''}重置` : '不重置'}</p>
          </div>
        );
      case 'package':
        return packageNameOf(user.packageId) || <span className="text-default-500">—</span>;
      case 'group':
        return groupNameOf(user.groupId);
      case 'num':
        return user.num;
      case 'wallet':
        return <span className="whitespace-nowrap">{(user.walletBalance ?? 0).toFixed(2)} 元</span>;
      default:
        return (
          <div className="flex items-center gap-1.5">
            <Button isIconOnly size="sm" variant="bordered" onPress={() => handleManageForwards(user)} isDisabled={user.roleId === 0} title="管理转发规则">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h13M17 7l-3-3M17 7l-3 3M20 17H7M7 17l3-3M7 17l3 3" />
              </svg>
            </Button>
            <Button isIconOnly size="sm" variant="bordered" onPress={() => handleManageTunnels(user)} title="隧道权限">
              <SettingsIcon className="w-4 h-4" />
            </Button>
            <Button isIconOnly size="sm" variant="bordered" onPress={() => handleEdit(user)} isDisabled={user.roleId === 0} title="编辑">
              <EditIcon className="w-4 h-4" />
            </Button>
            <Button isIconOnly size="sm" variant="bordered" onPress={() => handleEditPackage(user)} isDisabled={user.roleId === 0} title="编辑用户套餐">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M6 8h12l1 12H5L6 8zM9 8V7a3 3 0 016 0v1" /></svg>
            </Button>
            <Button isIconOnly size="sm" variant="bordered" onPress={() => handleResetFlow(user)} title="重置流量">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1z" clipRule="evenodd" /></svg>
            </Button>
            <Button isIconOnly size="sm" variant="bordered" color="danger" onPress={() => handleDelete(user)} isDisabled={user.roleId === 0} title="删除">
              <DeleteIcon className="w-4 h-4" />
            </Button>
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
                <Button size="sm" variant="bordered" className="border-dashed" startContent={<SettingsIcon className="w-4 h-4" />}>显示列</Button>
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
            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto [&>*]:shrink-0">
              <Button size="sm" variant="bordered" onPress={handleAdd} startContent={<UserIcon className="w-4 h-4" />}>添加用户</Button>
              <Button size="sm" variant="bordered" onPress={() => setSearchModalOpen(true)} startContent={<SearchIcon className="w-4 h-4" />}>
                {searchKeyword.trim() ? `搜索：${searchKeyword.trim()}` : '搜索用户'}
              </Button>
              <RefreshButton onRefresh={() => loadUsers(false)} />
            </div>
            <div className="settings-table-scroll">
            <Table
              aria-label="用户列表"
              removeWrapper
              sortDescriptor={sortDescriptor}
              onSortChange={(d) => { setSortDescriptor(d); setPage(1); }}
              classNames={{ th: "management-table-heading", td: "management-table-cell" }}
            >
              <TableHeader columns={visibleColumns}>
                {(column) => (
                  <TableColumn key={column.key} allowsSorting={column.sortable}>{column.label}</TableColumn>
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
                    {(columnKey) => <TableCell>{renderUserCell(user, String(columnKey))}</TableCell>}
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
            <div className="-mx-4 -mb-4 border-t border-default-100">
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
        <Modal isOpen={searchModalOpen} onOpenChange={setSearchModalOpen} size="sm" placement="center" backdrop="blur">
          <ModalContent>
            <ModalHeader>搜索用户</ModalHeader>
            <ModalBody className="pb-6">
              <Input
                size="sm"
                autoComplete="off"
                autoFocus
                placeholder="按用户名、昵称或 UID 搜索"
                value={searchKeyword}
                onChange={(e) => { setSearchKeyword(e.target.value); setPage(1); }}
                variant="bordered"
                startContent={<SearchIcon className="w-4 h-4 text-default-400" />}
                isClearable
                onClear={() => { setSearchKeyword(''); setPage(1); }}
              />
              <p className="text-xs text-default-400 mt-2">共匹配 {sortedUsers.length} 位用户</p>
            </ModalBody>
          </ModalContent>
        </Modal>


      {/* 用户表单模态框 */}
      <Modal
        isOpen={isUserModalOpen}
        onClose={onUserModalClose}
        size="md"
      scrollBehavior="outside"
      backdrop="blur"
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
                <FieldLabel tip="封禁后该用户无法登录与使用转发功能">封禁</FieldLabel>
                <Switch
                  size="sm"
                  aria-label="封禁"
                  isSelected={userForm.status === 0}
                  onValueChange={(checked) => setUserForm(prev => ({ ...prev, status: checked ? 0 : 1 }))}
                />
              </div>

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
                <DatePicker
                  aria-label="过期时间" variant="bordered"
                  value={userForm.expTime ? parseDate(userForm.expTime.toISOString().split('T')[0]) as any : null}
                  placeholderValue={today(getLocalTimeZone())}
                  onChange={(date) => {
                    if (date) {
                      const jsDate = new Date(date.year, date.month - 1, date.day, 23, 59, 59);
                      setUserForm(prev => ({ ...prev, expTime: jsDate }));
                    } else {
                      setUserForm(prev => ({ ...prev, expTime: null }));
                    }
                  }}
                  showMonthAndYearPickers
                  className="cursor-pointer"
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
      backdrop="blur"
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
                            <Button
                              size="sm"
                              variant="flat"
                              color="default"
                              isIconOnly
                              onClick={() => handleResetTunnelFlow(userTunnel)}
                              title="重置流量"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                              </svg>
                            </Button>
                            <Button
                              size="sm"
                              variant="flat"
                              color="danger"
                              isIconOnly
                              onClick={() => handleRemoveTunnel(userTunnel)}
                            >
                              <DeleteIcon className="w-4 h-4" />
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
      <Modal isOpen={isPackageModalOpen} onClose={onPackageModalClose} size="sm" backdrop="blur" placement="center">
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
            <p>你确定要重置用户 {userToReset?.user} 的流量吗？该操作只会重置账号流量不会重置隧道权限流量，重置后该用户的上下行流量将归零，此操作不可撤销。</p>
            <div className="mt-2 p-2 bg-warning-50 dark:bg-warning-100/10 rounded text-xs">
              <div className="text-warning-700 dark:text-warning-300">当前流量使用情况：</div>
              <div className="mt-1 space-y-1">
                <div className="flex justify-between"><span>上行流量：</span><span className="font-mono">{userToReset ? formatFlow(userToReset.inFlow || 0) : '-'}</span></div>
                <div className="flex justify-between"><span>下行流量：</span><span className="font-mono">{userToReset ? formatFlow(userToReset.outFlow || 0) : '-'}</span></div>
                <div className="flex justify-between font-medium"><span>总计：</span><span className="font-mono text-warning-700 dark:text-warning-300">{userToReset ? formatFlow(calculateUserTotalUsedFlow(userToReset)) : '-'}</span></div>
              </div>
            </div>
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
            <p>你确定要重置用户 {currentUser?.user} 对隧道 {tunnelToReset?.tunnelName} 的流量吗？该操作只会重置隧道权限流量不会重置账号流量，重置后该隧道权限的上下行流量将归零，此操作不可撤销。</p>
            <div className="mt-2 p-2 bg-warning-50 dark:bg-warning-100/10 rounded text-xs">
              <div className="text-warning-700 dark:text-warning-300">当前流量使用情况：</div>
              <div className="mt-1 space-y-1">
                <div className="flex justify-between"><span>上行流量：</span><span className="font-mono">{tunnelToReset ? formatFlow(tunnelToReset.inFlow || 0) : '-'}</span></div>
                <div className="flex justify-between"><span>下行流量：</span><span className="font-mono">{tunnelToReset ? formatFlow(tunnelToReset.outFlow || 0) : '-'}</span></div>
                <div className="flex justify-between font-medium"><span>总计：</span><span className="font-mono text-warning-700 dark:text-warning-300">{tunnelToReset ? formatFlow(calculateTunnelUsedFlow(tunnelToReset)) : '-'}</span></div>
              </div>
            </div>
          </>
        }
      />
      </div>
    
  );
} 
