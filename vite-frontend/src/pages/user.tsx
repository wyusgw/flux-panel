import { useState, useEffect } from 'react';
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
import { 
  Modal, 
  ModalContent, 
  ModalHeader, 
  ModalBody, 
  ModalFooter,
  useDisclosure 
} from "@heroui/modal";
import { Chip } from "@heroui/chip";
import { Select, SelectItem } from "@heroui/select";
import { RadioGroup, Radio } from "@heroui/radio";
import { DatePicker } from "@heroui/date-picker";
import { Spinner } from "@heroui/spinner";

import toast from 'react-hot-toast';
import { 
  User,
  UserForm,
  UserTunnel,
  UserTunnelForm,
  Tunnel,
  Pagination as PaginationType
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
import { parseDate } from "@internationalized/date";


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

export default function UserPage() {
  // 状态管理
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [pagination, setPagination] = useState<PaginationType>({
    current: 1,
    size: 10,
    total: 0
  });

  // 用户表单相关状态
  const { isOpen: isUserModalOpen, onOpen: onUserModalOpen, onClose: onUserModalClose } = useDisclosure();
  const [isEdit, setIsEdit] = useState(false);
  const [userForm, setUserForm] = useState<UserForm>({
    user: '',
    pwd: '',
    status: 1,
    flow: 100,
    num: 10,
    expTime: null,
    flowResetTime: 0,
    groupId: null,
    packageId: null,
    walletBalance: 0
  });
  const [userFormLoading, setUserFormLoading] = useState(false);

  // 用户组 / 套餐
  const [userGroups, setUserGroups] = useState<{ id: number; name: string }[]>([]);
  const [packagePlans, setPackagePlans] = useState<{ id: number; name: string }[]>([]);

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
  }, [pagination.current, pagination.size, searchKeyword]);

  // 数据加载函数
  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await getAllUsers({
        current: pagination.current,
        size: pagination.size,
        keyword: searchKeyword
      });
      
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
  const handleSearch = () => {
    setPagination(prev => ({ ...prev, current: 1 }));
    loadUsers();
  };

  const handleAdd = () => {
    setIsEdit(false);
    setUserForm({
      user: '',
      pwd: '',
      status: 1,
      flow: 100,
      num: 10,
      expTime: null,
      flowResetTime: 0,
      groupId: null,
      packageId: null,
      walletBalance: 0
    });
    onUserModalOpen();
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
      groupId: user.groupId ?? null,
      packageId: user.packageId ?? null,
      walletBalance: user.walletBalance ?? 0
    });
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
    if (!userForm.user || (!userForm.pwd && !isEdit) || !userForm.expTime) {
      toast.error('请填写完整信息');
      return;
    }

    setUserFormLoading(true);
    try {
      const submitData: any = {
        ...userForm,
        expTime: userForm.expTime.getTime()
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

  return (
    
      <div className="management-page px-4 lg:px-6 py-5 lg:py-6">
        <Card className="management-table-card max-w-[1600px] mx-auto">
          <CardHeader className="flex-col items-stretch gap-4 p-4 border-b border-default-100">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-base font-semibold text-foreground">用户管理</h1>
                <p className="mt-1 text-xs text-default-500">管理用户账户、配额与隧道权限</p>
              </div>
              <span className="text-xs text-default-500">共 {users.length} 位用户</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" color="default" onPress={handleAdd} startContent={<UserIcon className="w-4 h-4" />}>
                添加用户
              </Button>
              <Input autoComplete="off"
                size="sm"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜索用户名"
                startContent={<SearchIcon className="w-4 h-4 text-default-400" />}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full sm:w-56"
                classNames={{ inputWrapper: "management-search" }}
              />
              <Button size="sm" variant="bordered" onPress={handleSearch}>搜索</Button>
              <Button size="sm" variant="bordered" onPress={loadUsers} isLoading={loading}>刷新</Button>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <Table
              aria-label="用户列表"
              removeWrapper
              classNames={{ th: "management-table-heading", td: "management-table-cell" }}
            >
              <TableHeader>
                <TableColumn>UID</TableColumn>
                <TableColumn>用户名</TableColumn>
                <TableColumn>状态</TableColumn>
                <TableColumn>过期时间</TableColumn>
                <TableColumn>流量</TableColumn>
                <TableColumn>用户组</TableColumn>
                <TableColumn>套餐</TableColumn>
                <TableColumn>最大规则数</TableColumn>
                <TableColumn>钱包余额</TableColumn>
                <TableColumn>操作</TableColumn>
              </TableHeader>
              <TableBody
                isLoading={loading}
                loadingContent={<Spinner size="sm" label="正在加载..." />}
                emptyContent={<EmptyState />}
              >
                {users.map((user) => {
                  const userStatus = getUserStatus(user);
                  const expStatus = user.expTime ? getExpireStatus(user.expTime) : null;
                  return (
                    <TableRow key={user.id}>
                      <TableCell>#{user.id}</TableCell>
                      <TableCell>
                        <div className="min-w-24">
                          <p className="font-medium text-foreground">{user.name || user.user}</p>
                          {user.name && <p className="mt-0.5 text-xs text-default-500">@{user.user}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Chip color={userStatus.color} variant="flat" size="sm">{userStatus.text}</Chip>
                      </TableCell>
                      <TableCell>
                        {user.expTime ? (
                          <div className="min-w-30">
                            <p className="text-sm whitespace-nowrap">{formatDate(user.expTime)}</p>
                            {expStatus && expStatus.color !== 'success' && <p className="mt-0.5 text-xs text-danger">{expStatus.text}</p>}
                          </div>
                        ) : <span className="text-default-500">永久</span>}
                      </TableCell>
                      <TableCell>
                        <div className="min-w-32">
                          <p className="whitespace-nowrap">{formatFlow(calculateUserTotalUsedFlow(user))} / {formatFlow(user.flow, 'gb')}</p>
                          <p className="mt-0.5 text-xs text-default-500">{user.flowResetTime ? `每月 ${user.flowResetTime} 日重置` : '不重置'}</p>
                        </div>
                      </TableCell>
                      <TableCell>{groupNameOf(user.groupId)}</TableCell>
                      <TableCell>{packageNameOf(user.packageId) || <span className="text-default-500">—</span>}</TableCell>
                      <TableCell>{user.num}</TableCell>
                      <TableCell className="whitespace-nowrap">{(user.walletBalance ?? 0).toFixed(2)} 元</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button isIconOnly size="sm" variant="flat" onPress={() => handleManageTunnels(user)} title="隧道权限">
                            <SettingsIcon className="w-4 h-4" />
                          </Button>
                          <Button isIconOnly size="sm" variant="flat" onPress={() => handleEdit(user)} isDisabled={user.roleId === 0} title="编辑">
                            <EditIcon className="w-4 h-4" />
                          </Button>
                          <Button isIconOnly size="sm" variant="flat" color="default" onPress={() => handleResetFlow(user)} title="重置流量">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1z" clipRule="evenodd" /></svg>
                          </Button>
                          <Button isIconOnly size="sm" variant="flat" color="danger" onPress={() => handleDelete(user)} isDisabled={user.roleId === 0} title="删除">
                            <DeleteIcon className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardBody>
        </Card>


      {/* 用户表单模态框 */}
      <Modal
        isOpen={isUserModalOpen}
        onClose={onUserModalClose}
        size="2xl"
      scrollBehavior="outside"
      backdrop="blur"
      placement="center"
      >
        <ModalContent>
          <ModalHeader>
            {isEdit ? '编辑用户' : '新增用户'}
          </ModalHeader>
          <ModalBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                size="sm" autoComplete="off"
                label="用户名"
                value={userForm.user}
                onChange={(e) => setUserForm(prev => ({ ...prev, user: e.target.value }))}
                isRequired
              />
              <Input
                size="sm" autoComplete="off"
                label="密码"
                type="password"
                value={userForm.pwd}
                onChange={(e) => setUserForm(prev => ({ ...prev, pwd: e.target.value }))}
                placeholder={isEdit ? '留空则不修改密码' : '请输入密码'}
                isRequired={!isEdit}
              />
              <Input
                size="sm" autoComplete="off"
                label="流量限制(GB)"
                type="number"
                value={userForm.flow.toString()}
                onChange={(e) => {
                  const value = Math.min(Math.max(Number(e.target.value) || 0, 1), 99999);
                  setUserForm(prev => ({ ...prev, flow: value }));
                }}
                min="1"
                max="99999"
                isRequired
              />
              <Input
                size="sm" autoComplete="off"
                label="转发数量"
                type="number"
                value={userForm.num.toString()}
                onChange={(e) => {
                  const value = Math.min(Math.max(Number(e.target.value) || 0, 1), 99999);
                  setUserForm(prev => ({ ...prev, num: value }));
                }}
                min="1"
                max="99999"
                isRequired
              />
              <Select
                size="sm"
                label="流量重置日期"
                selectedKeys={[userForm.flowResetTime.toString()]}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as string;
                  setUserForm(prev => ({ ...prev, flowResetTime: Number(value) }));
                }}
              >
                <>
                  <SelectItem key="0" textValue="不重置">
                    不重置
                  </SelectItem>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                  <SelectItem key={day.toString()} textValue={`每月${day}号（0点重置）`}>
                    每月{day}号（0点重置）
                  </SelectItem>
                ))}
                </>
              </Select>
              <DatePicker
                size="sm"
                label="过期时间"
                value={userForm.expTime ? parseDate(userForm.expTime.toISOString().split('T')[0]) as any : null}
                onChange={(date) => {
                  if (date) {
                    const jsDate = new Date(date.year, date.month - 1, date.day, 23, 59, 59);
                    setUserForm(prev => ({ ...prev, expTime: jsDate }));
                  } else {
                    setUserForm(prev => ({ ...prev, expTime: null }));
                  }
                }}
                isRequired
                showMonthAndYearPickers
                className="cursor-pointer"
              />
              <Select
                size="sm"
                label="用户组"
                placeholder="未分组"
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
              <Select
                size="sm"
                label="套餐"
                placeholder="无套餐"
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
              <Input
                size="sm" autoComplete="off"
                label="钱包余额"
                type="number"
                value={(userForm.walletBalance ?? 0).toString()}
                onChange={(e) => setUserForm(prev => ({ ...prev, walletBalance: parseFloat(e.target.value) || 0 }))}
                endContent={<span className="px-2 py-0.5 -mr-1 rounded-md bg-default-100 dark:bg-default-50/10 text-default-500 text-xs font-medium">元</span>}
              />
            </div>

            <RadioGroup
              size="sm"
              label="状态"
              value={userForm.status.toString()}
              onValueChange={(value: string) => setUserForm(prev => ({ ...prev, status: Number(value) }))}
              orientation="horizontal"
              className="mt-3"
            >
              <Radio value="1">正常</Radio>
              <Radio value="0">禁用</Radio>
            </RadioGroup>
          </ModalBody>
          <ModalFooter>
            <Button onPress={onUserModalClose}>
              取消
            </Button>
            <Button
              color="default"
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
            用户 {currentUser?.user} 的隧道权限管理
          </ModalHeader>
          <ModalBody>
            <div className="space-y-6">
              {/* 分配新权限部分：流量/转发数量/到期时间等额度统一由账号自身的套餐控制，
                  这里只代表"该用户可以使用这条隧道" */}
              <div>
                <h3 className="text-lg font-semibold mb-4">分配新权限</h3>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                  <Select
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
                    th: "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium"
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
                          <Chip
                            color={userTunnel.status === 1 ? 'success' : 'danger'}
                            size="sm"
                            variant="flat"
                          >
                            {userTunnel.status === 1 ? '正常' : '禁用'}
                          </Chip>
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
            <Button onPress={onTunnelModalClose}>
              关闭
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 删除确认对话框 */}
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
