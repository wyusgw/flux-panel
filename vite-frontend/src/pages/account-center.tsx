import { useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from "@heroui/modal";
import { Input } from "@heroui/input";
import { Switch } from "@heroui/switch";
import { Checkbox } from "@heroui/checkbox";
import { Spinner } from "@heroui/spinner";
import toast from 'react-hot-toast';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { safeLogout } from '@/utils/logout';
import {
  getUserPackageInfo,
  updateAutoRenew,
  purchasePackage,
  getPackagePlanList,
  getDeviceGroupList,
  resetPassword,
  updateNotifySettings,
  getTelegramBindCode,
  unbindTelegram,
} from '@/api';

interface UserInfo {
  user: string;
  groupName: string | null;
  packageId: number | null;
  packageName: string | null;
  expTime: number | null;
  flow: number;
  inFlow: number;
  outFlow: number;
  num: number;
  walletBalance: number;
  autoRenew: number;
  telegramBound: boolean;
  notifyPaymentMode: number;
  notifyDeviceMode: number;
  notifyDeviceGroupIds: number[];
}

interface PackagePlanItem {
  id: number;
  name: string;
  price: number;
}

interface DeviceGroupOption {
  id: number;
  name: string;
}

const GB = 1024 * 1024 * 1024;

const ModePicker = ({
  value,
  options,
  onChange,
}: {
  value: number;
  options: { value: number; label: string }[];
  onChange: (value: number) => void;
}) => (
  <div className="flex gap-2">
    {options.map((opt) => (
      <Button
        key={opt.value}
        size="sm"
        variant={value === opt.value ? 'solid' : 'flat'}
        color={value === opt.value ? 'primary' : 'default'}
        onPress={() => onChange(opt.value)}
      >
        {opt.label}
      </Button>
    ))}
  </div>
);

export default function AccountCenterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [plans, setPlans] = useState<PackagePlanItem[]>([]);
  const [deviceGroups, setDeviceGroups] = useState<DeviceGroupOption[]>([]);

  const [autoRenewLoading, setAutoRenewLoading] = useState(false);
  const [renewLoading, setRenewLoading] = useState(false);

  // 重置密码
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const { isOpen: isGeneratedOpen, onOpenChange: onGeneratedOpenChange } = useDisclosure();
  const [generatedPassword, setGeneratedPassword] = useState('');

  // Telegram 绑定
  const { isOpen: isBindOpen, onOpen: openBind, onOpenChange: onBindOpenChange } = useDisclosure();
  const [bindCode, setBindCode] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [bindLoading, setBindLoading] = useState(false);
  const [bindChecking, setBindChecking] = useState(false);
  const [unbindDialogOpen, setUnbindDialogOpen] = useState(false);
  const [unbindLoading, setUnbindLoading] = useState(false);

  // 推送设置
  const { isOpen: isPushOpen, onOpen: openPush, onOpenChange: onPushOpenChange } = useDisclosure();
  const [paymentMode, setPaymentMode] = useState(0);
  const [deviceMode, setDeviceMode] = useState(0);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [pushSaving, setPushSaving] = useState(false);

  useEffect(() => {
    let adminFlag = localStorage.getItem('admin') === 'true';
    if (localStorage.getItem('admin') === null) {
      const roleId = parseInt(localStorage.getItem('role_id') || '1', 10);
      adminFlag = roleId === 0;
      localStorage.setItem('admin', adminFlag.toString());
    }
    setIsAdminUser(adminFlag);
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [userRes, plansRes, groupsRes] = await Promise.all([
        getUserPackageInfo(),
        getPackagePlanList(),
        getDeviceGroupList(),
      ]);

      if (userRes.code === 0 && userRes.data?.userInfo) {
        const info = userRes.data.userInfo;
        setUserInfo(info);
        setPaymentMode(info.notifyPaymentMode ?? 0);
        setDeviceMode(info.notifyDeviceMode ?? 0);
        setSelectedGroupIds(info.notifyDeviceGroupIds ?? []);
      } else {
        toast.error(userRes.msg || '获取用户信息失败');
      }

      if (plansRes.code === 0) {
        setPlans(plansRes.data || []);
      }

      if (groupsRes.code === 0) {
        setDeviceGroups((groupsRes.data || []).map((g: any) => ({ id: g.id, name: g.name })));
      }
    } catch (error) {
      toast.error('加载个人信息失败');
    } finally {
      setLoading(false);
    }
  };

  const currentPlan = plans.find((p) => p.id === userInfo?.packageId) || null;

  const handleAutoRenewChange = async (checked: boolean) => {
    setAutoRenewLoading(true);
    try {
      const res = await updateAutoRenew(checked);
      if (res.code === 0) {
        setUserInfo((prev) => (prev ? { ...prev, autoRenew: checked ? 1 : 0 } : prev));
      } else {
        toast.error(res.msg || '设置失败');
      }
    } catch {
      toast.error('设置失败');
    } finally {
      setAutoRenewLoading(false);
    }
  };

  const handleRenew = async () => {
    if (!userInfo?.packageId) return;
    setRenewLoading(true);
    try {
      const res = await purchasePackage(userInfo.packageId);
      if (res.code === 0) {
        toast.success('续费成功');
        loadData();
      } else {
        toast.error(res.msg || '续费失败');
      }
    } catch {
      toast.error('续费失败');
    } finally {
      setRenewLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!currentPassword) {
      toast.error('请输入当前密码');
      return;
    }
    if (newPassword && newPassword.length < 6) {
      toast.error('新密码长度不能少于6位');
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      toast.error('两次输入的新密码不一致');
      return;
    }

    setResetLoading(true);
    try {
      const res = await resetPassword(currentPassword, newPassword || undefined);
      if (res.code === 0) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        if (res.data?.generatedPassword) {
          setGeneratedPassword(res.data.generatedPassword);
          onGeneratedOpenChange();
        } else {
          toast.success('密码重置成功，请使用新密码重新登录');
          safeLogout();
          navigate('/', { replace: true });
        }
      } else {
        toast.error(res.msg || '重置失败');
      }
    } catch {
      toast.error('重置失败');
    } finally {
      setResetLoading(false);
    }
  };

  const handleGeneratedConfirm = () => {
    onGeneratedOpenChange();
    safeLogout();
    navigate('/', { replace: true });
  };

  const handleOpenBind = async () => {
    setBindLoading(true);
    try {
      const res = await getTelegramBindCode();
      if (res.code === 0) {
        setBindCode(res.data.code);
        setBotUsername(res.data.botUsername || '');
        openBind();
      } else {
        toast.error(res.msg || '获取绑定码失败');
      }
    } catch {
      toast.error('获取绑定码失败');
    } finally {
      setBindLoading(false);
    }
  };

  const handleRefreshBindStatus = async () => {
    setBindChecking(true);
    try {
      const res = await getUserPackageInfo();
      if (res.code === 0 && res.data?.userInfo?.telegramBound) {
        toast.success('绑定成功');
        onBindOpenChange();
        loadData();
      } else {
        toast('尚未检测到绑定，请在 Telegram 中完成操作后重试');
      }
    } finally {
      setBindChecking(false);
    }
  };

  const handleUnbind = async () => {
    setUnbindLoading(true);
    try {
      const res = await unbindTelegram();
      if (res.code === 0) {
        toast.success('已取消关联');
        setUnbindDialogOpen(false);
        loadData();
      } else {
        toast.error(res.msg || '取消关联失败');
      }
    } catch {
      toast.error('取消关联失败');
    } finally {
      setUnbindLoading(false);
    }
  };

  const toggleGroupSelected = (id: number) => {
    setSelectedGroupIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSavePushSettings = async () => {
    setPushSaving(true);
    try {
      const res = await updateNotifySettings(paymentMode, deviceMode, deviceMode === 0 ? [] : selectedGroupIds);
      if (res.code === 0) {
        toast.success('推送设置已保存');
        onPushOpenChange();
        loadData();
      } else {
        toast.error(res.msg || '保存失败');
      }
    } catch {
      toast.error('保存失败');
    } finally {
      setPushSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" label="加载中..." />
      </div>
    );
  }

  if (!userInfo) {
    return (
      <div className="p-6 text-center text-default-500 text-sm">未获取到用户信息</div>
    );
  }

  const usedFlowGiB = (userInfo.inFlow + userInfo.outFlow) / GB;

  return (
    <div className="px-3 lg:px-6 py-6 max-w-[1600px] mx-auto space-y-4">
      <Card className="border border-default-200 shadow-sm">
        <CardBody className="p-5 space-y-4">
          <h2 className="text-base font-semibold text-foreground">用户信息</h2>

          <Row label="用户名" value={userInfo.user} />
          <Row label="用户类型" value={isAdminUser ? '管理员' : '普通用户'} />
          <Row label="用户组" value={userInfo.groupName || '未分组'} />
          <Row label="套餐" value={userInfo.packageName || '无'} />
          {userInfo.expTime && (
            <Row label="套餐失效" value={new Date(userInfo.expTime).toLocaleString('zh-CN')} />
          )}
          {currentPlan && (
            <Row
              label="续费价格"
              value={`${currentPlan.price} 元`}
              action={
                <Button size="sm" variant="flat" color="primary" isLoading={renewLoading} onPress={handleRenew}>
                  立即续费
                </Button>
              }
            />
          )}
          <Row label="流量" value={`${usedFlowGiB.toFixed(2)} GiB / ${userInfo.flow.toFixed(2)} GiB`} />
          <Row label="最大规则数" value={String(userInfo.num)} />
          <Row
            label="钱包余额"
            value={`${(userInfo.walletBalance ?? 0).toFixed(2)} 元`}
            action={
              <Button size="sm" variant="flat" onPress={() => navigate('/shop')}>
                充值
              </Button>
            }
          />
          <Row
            label="Telegram 关联"
            value={userInfo.telegramBound ? '已关联' : '未关联'}
            action={
              userInfo.telegramBound ? (
                <Button size="sm" variant="flat" color="danger" onPress={() => setUnbindDialogOpen(true)}>
                  取消关联
                </Button>
              ) : (
                <Button size="sm" variant="flat" isLoading={bindLoading} onPress={handleOpenBind}>
                  关联
                </Button>
              )
            }
          />
          <Row
            label="推送信息"
            value=""
            action={
              <Button size="sm" variant="flat" onPress={openPush}>
                设置
              </Button>
            }
          />
        </CardBody>
      </Card>

      <Card className="border border-default-200 shadow-sm">
        <CardBody className="p-5 space-y-5">
          <h2 className="text-base font-semibold text-foreground">账户设置</h2>

          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-foreground">自动续费</p>
              <p className="mt-1 text-xs text-default-500 max-w-md">如果您的套餐临近到期，或者流量用完，系统将自动续费。请保证余额充足，否则会续费失败。</p>
            </div>
            <Switch isSelected={userInfo.autoRenew === 1} isDisabled={autoRenewLoading} onValueChange={handleAutoRenewChange} />
          </div>

          <div className="pt-3 border-t border-default-100 space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">重置密码</p>
              <p className="mt-1 text-xs text-default-500">验证当前密码后即可重置，新密码留空将由系统随机生成。</p>
            </div>
            <Input autoComplete="off" type="password" label="当前密码" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} variant="bordered" size="sm" />
            <Input autoComplete="off" type="password" label="新密码，留空随机生成" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} variant="bordered" size="sm" />
            <Input autoComplete="off" type="password" label="确认新密码" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} variant="bordered" size="sm" />
            <Button color="danger" variant="flat" isLoading={resetLoading} onPress={handleResetPassword}>
              重置密码
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Telegram 绑定码弹窗 */}
      <Modal isOpen={isBindOpen} onOpenChange={onBindOpenChange} size="sm" placement="center" backdrop="blur">
        <ModalContent>
          <ModalHeader>关联 Telegram</ModalHeader>
          <ModalBody className="space-y-3 text-sm">
            <p className="text-default-600">
              请在 Telegram 中打开机器人{botUsername ? <b> @{botUsername}</b> : ''}，发送以下指令完成绑定：
            </p>
            <div className="px-3 py-2 rounded-medium bg-default-100 font-mono text-center text-base">/bind {bindCode}</div>
            {botUsername && (
              <Button
                as="a"
                href={`https://t.me/${botUsername}?start=${bindCode}`}
                target="_blank"
                rel="noopener noreferrer"
                color="primary"
                variant="flat"
                className="w-full"
              >
                打开 Telegram
              </Button>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => onBindOpenChange()}>关闭</Button>
            <Button color="primary" isLoading={bindChecking} onPress={handleRefreshBindStatus}>刷新状态</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 推送设置弹窗 */}
      <Modal isOpen={isPushOpen} onOpenChange={onPushOpenChange} size="md" placement="center" backdrop="blur">
        <ModalContent>
          <ModalHeader>推送设置</ModalHeader>
          <ModalBody className="space-y-4">
            <p className="text-xs text-default-500">通道：Telegram（需先完成账号关联）</p>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">收款信息</p>
              <ModePicker
                value={paymentMode}
                options={[{ value: 0, label: '不接收' }, { value: 1, label: '接收' }]}
                onChange={setPaymentMode}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">设备离线与恢复</p>
              <ModePicker
                value={deviceMode}
                options={[{ value: 0, label: '不接收' }, { value: 1, label: '白名单' }, { value: 2, label: '黑名单' }]}
                onChange={setDeviceMode}
              />
              {deviceMode !== 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto border border-default-200 rounded-medium p-2 flex flex-col gap-1">
                  {deviceGroups.length === 0 && <p className="text-xs text-default-400 px-1 py-2">暂无设备组</p>}
                  {deviceGroups.map((group) => (
                    <Checkbox
                      key={group.id}
                      size="sm"
                      isSelected={selectedGroupIds.includes(group.id)}
                      onValueChange={() => toggleGroupSelected(group.id)}
                    >
                      <span className="text-sm">{group.name}</span>
                    </Checkbox>
                  ))}
                  <p className="text-xs text-default-400 px-1 pt-1">
                    {deviceMode === 1 ? '仅勾选的设备组会收到通知' : '除勾选的设备组外，其余都会收到通知'}
                  </p>
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => onPushOpenChange()}>取消</Button>
            <Button color="primary" isLoading={pushSaving} onPress={handleSavePushSettings}>确定</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 随机生成密码展示 */}
      <Modal isOpen={isGeneratedOpen} onOpenChange={() => {}} isDismissable={false} size="sm" placement="center" backdrop="blur">
        <ModalContent>
          <ModalHeader>密码重置成功</ModalHeader>
          <ModalBody className="space-y-3 text-sm">
            <p className="text-default-600">您的新密码为（仅显示一次，请妥善保存）：</p>
            <div className="px-3 py-2 rounded-medium bg-default-100 font-mono text-center text-base select-all">{generatedPassword}</div>
            <p className="text-xs text-default-500">请使用新密码重新登录。</p>
          </ModalBody>
          <ModalFooter>
            <Button color="primary" className="w-full" onPress={handleGeneratedConfirm}>我已保存，重新登录</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmDialog
        isOpen={unbindDialogOpen}
        onOpenChange={setUnbindDialogOpen}
        title="取消关联"
        message="确定要取消关联 Telegram 账号吗？取消后将无法接收推送通知。"
        confirmText="取消关联"
        confirmColor="danger"
        onConfirm={handleUnbind}
        loading={unbindLoading}
      />
    </div>
  );
}

const Row = ({ label, value, action }: { label: string; value: string; action?: ReactNode }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-sm text-default-600 flex-shrink-0">{label}</span>
    <div className="flex items-center gap-2">
      {value && <span className="text-sm font-medium text-foreground">{value}</span>}
      {action}
    </div>
  </div>
);
