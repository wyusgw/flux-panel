import { CheckOutlined, DisconnectOutlined, DownOutlined, LinkOutlined, LockOutlined, PlusCircleOutlined, RightOutlined, SearchOutlined, SettingOutlined, SyncOutlined, UserOutlined } from "@/components/ant-icons";
import { useState, useEffect, useRef, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from "@heroui/modal";
import { Input } from "@heroui/input";
import { Switch } from "@heroui/switch";
import { Spinner } from "@heroui/spinner";
import toast from 'react-hot-toast';

import { EmptyState } from '@/components/empty-state';
import { showInfoDialog } from '@/components/error-dialog';
import { HelpTooltip } from '@/components/help-tooltip';
import { PopConfirm } from '@/components/pop-confirm';
import { getCachedConfigs } from '@/config/site';
import { copyText } from '@/utils/clipboard';
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
  notifyRenewMode: number;
  notifyExpiryMode: number;
  notifyFlowMode: number;
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

// 这个页面的按钮和输入框用细边框，和用户信息的文字同样大小
const OUTLINE_BUTTON = 'border-1 border-default-300 text-sm font-normal';
const DANGER_OUTLINE_BUTTON = 'border-1 !border-red-500 !text-red-500 text-sm font-normal';
const THIN_INPUT = { inputWrapper: 'border-1' };

const LockIcon = () => (
  <LockOutlined className="w-4 h-4 text-default-400 flex-shrink-0" />
);

const UserFieldIcon = () => (
  <UserOutlined className="w-4 h-4 text-default-400 flex-shrink-0" />
);

const RenewIcon = () => <SyncOutlined />;
const RechargeIcon = () => <PlusCircleOutlined />;
const LinkIcon = () => <LinkOutlined />;
const UnlinkIcon = () => <DisconnectOutlined />;
const SettingsIcon = () => <SettingOutlined />;

const ModePicker = ({
  value,
  options,
  onChange,
}: {
  value: number;
  options: { value: number; label: string }[];
  onChange: (value: number) => void;
}) => (
  <div role="radiogroup" className="flex w-full sm:inline-flex sm:w-auto rounded-small border-1 border-default-300 overflow-hidden">
    {options.map((opt, index) => (
      <button
        key={opt.value}
        type="button"
        role="radio"
        aria-checked={value === opt.value}
        onClick={() => onChange(opt.value)}
        className={`h-8 min-w-0 flex-1 sm:flex-none px-1 sm:px-3.5 whitespace-nowrap text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${index > 0 ? 'border-l-1 border-default-300' : ''} ${value === opt.value ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-default-100'}`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

const RECEIVE_OPTIONS = [{ value: 0, label: '不接收' }, { value: 1, label: '接收' }];

/** 推送设置里的一种通知：标题 + 模式等配置行 */
const NotifyCard = ({ title, children }: { title: ReactNode; children: ReactNode }) => (
  <div className="rounded-medium border-1 border-default-200">
    <div className="px-3 py-2.5 border-b-1 border-default-200 text-sm font-semibold text-foreground">{title}</div>
    <div className="px-3 py-3 space-y-2.5">{children}</div>
  </div>
);

const NotifyRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-center gap-2 sm:gap-3">
    <span className="w-8 sm:w-14 flex-shrink-0 text-sm text-foreground">{label}</span>
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

/** 可搜索的多选框：聚焦时搜索并勾选，失去焦点后显示已选的名称 */
const GroupMultiSelect = ({
  placeholder,
  options,
  selected,
  onToggle,
}: {
  placeholder: string;
  options: DeviceGroupOption[];
  selected: number[];
  onToggle: (id: number) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as globalThis.Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const keyword = query.trim().toLowerCase();
  const filtered = options.filter((group) => group.name.toLowerCase().includes(keyword));
  const selectedNames = options.filter((group) => selected.includes(group.id)).map((group) => group.name).join('，');

  return (
    <div ref={containerRef} className="relative">
      <Input
        autoComplete="off"
        size="sm"
        variant="bordered"
        aria-label={placeholder}
        classNames={{ inputWrapper: 'border-1' }}
        placeholder={placeholder}
        value={open ? query : selectedNames}
        onFocus={() => setOpen(true)}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.stopPropagation();
            setOpen(false);
            setQuery('');
          }
        }}
        endContent={
          open ? <SearchOutlined className="w-4 h-4 text-default-400 flex-shrink-0" /> : <DownOutlined className="w-4 h-4 text-default-400 flex-shrink-0" />
        }
      />
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-medium border-1 border-default-200 bg-content1 shadow-medium p-1">
          {filtered.length === 0 ? (
            <EmptyState compact className="py-3" />
          ) : (
            filtered.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => onToggle(group.id)}
                className={`flex w-full items-center justify-between rounded-small px-2.5 py-1.5 text-left text-sm hover:bg-default-100 ${selected.includes(group.id) ? 'text-primary' : 'text-foreground'}`}
              >
                <span className="truncate">{group.name}</span>
                {selected.includes(group.id) && (
                  <CheckOutlined className="w-4 h-4 flex-shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

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
  const [newUsername, setNewUsername] = useState('');
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
  const [unbindLoading, setUnbindLoading] = useState(false);

  // 推送设置
  const { isOpen: isPushOpen, onOpen: openPush, onOpenChange: onPushOpenChange } = useDisclosure();
  const [paymentMode, setPaymentMode] = useState(0);
  const [deviceMode, setDeviceMode] = useState(0);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [renewMode, setRenewMode] = useState(1);
  const [expiryMode, setExpiryMode] = useState(1);
  const [flowMode, setFlowMode] = useState(1);
  const [pushSaving, setPushSaving] = useState(false);
  const [pushChannelOpen, setPushChannelOpen] = useState(false);

  useEffect(() => {
    let adminFlag = localStorage.getItem('admin') === 'true';
    if (localStorage.getItem('admin') === null) {
      const roleId = parseInt(localStorage.getItem('role_id') || '1', 10);
      adminFlag = roleId === 0;
      localStorage.setItem('admin', adminFlag.toString());
    }
    setIsAdminUser(adminFlag);
    loadData(true);
  }, []);

  const loadData = async (notify = false) => {
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
        setRenewMode(info.notifyRenewMode ?? 1);
        setExpiryMode(info.notifyExpiryMode ?? 1);
        setFlowMode(info.notifyFlowMode ?? 1);
        if (notify) toast.success('刷新用户信息成功', { id: 'account-refresh' });
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
        toast.success('保存成功', { id: 'auto-renew-saved' });
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
      if (res.code === 0 && res.data?.pending) {
        toast(res.msg || '订单处理中，请稍后查看');
        loadData();
      } else if (res.code === 0) {
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
    if (newUsername.trim() && newUsername.trim().length < 3) {
      toast.error('用户名长度至少3位');
      return;
    }
    if (!currentPassword) {
      toast.error('请输入当前密码');
      return;
    }
    if (newPassword && newPassword.length < 5) {
      toast.error('新密码长度不能少于5位');
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      toast.error('两次输入的新密码不一致');
      return;
    }

    setResetLoading(true);
    try {
      const res = await resetPassword(currentPassword, newPassword || undefined, newUsername.trim() || undefined);
      if (res.code === 0) {
        setNewUsername('');
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

  const handleCopyGeneratedPassword = async () => {
    const success = await copyText(generatedPassword);
    if (success) {
      toast.success('已复制');
    } else {
      toast.error('复制失败');
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
      const configs = await getCachedConfigs();
      if (configs.telegram_enabled !== 'true') {
        showInfoDialog({ title: '绑定 Telegram', message: '本站未启用 Telegram Bot' });
        return;
      }
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
      const res = await updateNotifySettings({
        paymentMode,
        deviceMode,
        deviceGroupIds: (deviceMode === 1 || deviceMode === 2) ? selectedGroupIds : [],
        renewMode,
        expiryMode,
        flowMode,
      });
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
  // 没有流量配额或已用完时用橙色提醒
  const flowWarning = userInfo.flow <= 0 || usedFlowGiB >= userInfo.flow;

  return (
    <div className="management-page px-4 lg:px-6 py-5 lg:py-6 max-w-[1600px] mx-auto space-y-4">
      <Card className="management-table-card">
        <CardHeader className="p-4 border-b border-default-100">
          <h2 className="text-base font-semibold text-foreground">用户信息</h2>
        </CardHeader>
        <CardBody className="p-4 lg:p-5 space-y-1.5">
          <Row label="用户名" value={userInfo.user} />
          <Row label="用户类型" value={isAdminUser ? '管理员' : '普通用户'} />
          <Row label="用户组" value={userInfo.groupName || '未分组'} />
          <Row label="套餐" value={userInfo.packageName || '无'} />
          {userInfo.expTime && (
            <Row label="套餐失效" value={new Date(userInfo.expTime).toLocaleString('zh-CN', { hour12: true })} />
          )}
          {currentPlan && (
            <Row
              label="续费价格"
              value={`${currentPlan.price} 元`}
              action={
                <Button size="sm" variant="bordered" className={OUTLINE_BUTTON} startContent={<RenewIcon />} isLoading={renewLoading} onPress={handleRenew}>
                  立即续费
                </Button>
              }
            />
          )}
          <Row label="流量" value={`${usedFlowGiB.toFixed(2)} GiB / ${userInfo.flow.toFixed(2)} GiB`} valueClassName={flowWarning ? 'text-orange-500' : undefined} />
          <Row label="最大规则数" value={String(userInfo.num)} />
          <Row
            label="钱包余额"
            value={`${Number(userInfo.walletBalance ?? 0)} 元`}
            action={
              <Button size="sm" variant="bordered" className={OUTLINE_BUTTON} startContent={<RechargeIcon />} onPress={() => navigate('/shop')}>
                充值
              </Button>
            }
          />
          <Row
            label="Telegram 关联"
            value={userInfo.telegramBound ? '已绑定' : '未绑定'}
            action={
              <>
                <PopConfirm title="关联 Telegram 帐号" onConfirm={handleOpenBind}>
                  <Button size="sm" variant="bordered" className={OUTLINE_BUTTON} startContent={<LinkIcon />} isLoading={bindLoading}>关联</Button>
                </PopConfirm>
                {userInfo.telegramBound && (
                  <PopConfirm title="取消关联 Telegram 帐号" onConfirm={handleUnbind}>
                    <Button size="sm" variant="bordered" className={DANGER_OUTLINE_BUTTON} startContent={<UnlinkIcon />} isLoading={unbindLoading}>取消关联</Button>
                  </PopConfirm>
                )}
              </>
            }
          />
          <Row
            label="推送信息"
            value=""
            action={
              <Button size="sm" variant="bordered" className={OUTLINE_BUTTON} startContent={<SettingsIcon />} onPress={() => { setPushChannelOpen(false); openPush(); }}>
                设置
              </Button>
            }
          />
        </CardBody>
      </Card>

      <Card className="management-table-card">
        <CardHeader className="p-4 border-b border-default-100">
          <h2 className="text-base font-semibold text-foreground">账户设置</h2>
        </CardHeader>
        <CardBody className="p-4 lg:p-5 space-y-10">
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3">
            <div className="min-w-0">
              <p className="text-lg font-semibold text-foreground">自动续费</p>
              <p className="mt-2.5 pl-2.5 border-l-[3px] border-default-200 text-sm text-default-600">如果您的套餐临近到期，或者流量用完，系统将自动续费。请保证余额充足，否则会续费失败。</p>
            </div>
            <Switch size="sm" aria-label="自动续费" isSelected={userInfo.autoRenew === 1} isDisabled={autoRenewLoading} onValueChange={handleAutoRenewChange} />
          </div>

          <div className="space-y-6">
            <div>
              <p className="text-lg font-semibold text-foreground">重置密码</p>
              <p className="mt-2.5 pl-2.5 border-l-[3px] border-default-200 text-sm text-default-600">如果您的密码已泄漏，可以在这里重置。用户名留空则不修改。重置操作会强制下线您在其他地方的登录。</p>
            </div>
            <div className="space-y-6 max-w-[530px]">
              <Input autoComplete="off" placeholder="新用户名(选填)" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} variant="bordered" size="sm" classNames={THIN_INPUT} startContent={<UserFieldIcon />} />
              <Input autoComplete="off" type="password" placeholder="当前密码" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} variant="bordered" size="sm" classNames={THIN_INPUT} startContent={<LockIcon />} />
              <Input autoComplete="off" type="password" placeholder="新密码，留空随机生成。" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} variant="bordered" size="sm" classNames={THIN_INPUT} startContent={<LockIcon />} />
              <Input autoComplete="off" type="password" placeholder="确认新密码" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} variant="bordered" size="sm" classNames={THIN_INPUT} startContent={<LockIcon />} />
            </div>
            <Button size="sm" className="bg-[#c23c3c] text-white text-sm font-normal" isLoading={resetLoading} onPress={handleResetPassword}>重置密码</Button>
          </div>
        </CardBody>
      </Card>

      {/* Telegram 绑定码弹窗 */}
      <Modal isOpen={isBindOpen} onOpenChange={onBindOpenChange} size="sm" placement="center" backdrop="opaque">
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
                color="default"
                variant="flat"
                className="w-full"
              >
                打开 Telegram
              </Button>
            )}
          </ModalBody>
          <ModalFooter>
            <Button size="sm" variant="bordered" className={OUTLINE_BUTTON} onPress={() => onBindOpenChange()}>关闭</Button>
            <Button size="sm" color="primary" className="text-sm font-normal" isDisabled={bindChecking} onPress={handleRefreshBindStatus}>刷新状态</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 推送设置弹窗 */}
      <Modal isOpen={isPushOpen} onOpenChange={onPushOpenChange} placement="center" backdrop="opaque" classNames={{ base: 'max-w-[600px] overflow-visible' }}>
        <ModalContent>
          <ModalHeader className="!px-4 sm:!px-6 pb-3">推送设置</ModalHeader>
          <ModalBody className="px-4 sm:px-6 py-0">
            <div className="rounded-medium border-1 border-default-200">
              <button
                type="button"
                aria-expanded={pushChannelOpen}
                onClick={() => setPushChannelOpen((open) => !open)}
                className={`flex w-full items-center gap-2.5 rounded-medium bg-default-100 px-4 py-3 text-left text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary ${pushChannelOpen ? 'rounded-b-none border-b-1 border-default-200' : ''}`}
              >
                <RightOutlined className={`w-4 h-4 flex-shrink-0 transition-transform motion-reduce:transition-none ${pushChannelOpen ? 'rotate-90' : ''}`} />
                <span>通道: Telegram</span>
              </button>
              {pushChannelOpen && (
                <div className="p-3 sm:p-4 space-y-3.5">
                  {isAdminUser ? (
                    <>
                      <NotifyCard title="收款信息">
                        <NotifyRow label="模式">
                          <ModePicker value={paymentMode} options={RECEIVE_OPTIONS} onChange={setPaymentMode} />
                        </NotifyRow>
                      </NotifyCard>
                      <NotifyCard title={<HelpTooltip content="接收全部设备组的通知；白名单只接收勾选的设备组；黑名单接收除勾选之外的所有设备组">设备离线与恢复</HelpTooltip>}>
                        <NotifyRow label="模式">
                          <ModePicker
                            value={deviceMode}
                            options={[{ value: 0, label: '不接收' }, { value: 3, label: '接收' }, { value: 1, label: '白名单' }, { value: 2, label: '黑名单' }]}
                            onChange={setDeviceMode}
                          />
                        </NotifyRow>
                        {(deviceMode === 1 || deviceMode === 2) && (
                          <NotifyRow label="List">
                            <GroupMultiSelect
                              placeholder={`搜索并选择${deviceMode === 1 ? '白名单' : '黑名单'}设备组`}
                              options={deviceGroups}
                              selected={selectedGroupIds}
                              onToggle={toggleGroupSelected}
                            />
                          </NotifyRow>
                        )}
                      </NotifyCard>
                    </>
                  ) : (
                    <>
                      <NotifyCard title={<HelpTooltip content="套餐即将到期时通过 Telegram 提醒您续费">套餐到期提醒</HelpTooltip>}>
                        <NotifyRow label="模式">
                          <ModePicker value={expiryMode} options={RECEIVE_OPTIONS} onChange={setExpiryMode} />
                        </NotifyRow>
                      </NotifyCard>
                      <NotifyCard title={<HelpTooltip content="套餐流量用量达到阈值时提醒您">流量即将用尽提醒</HelpTooltip>}>
                        <NotifyRow label="模式">
                          <ModePicker value={flowMode} options={RECEIVE_OPTIONS} onChange={setFlowMode} />
                        </NotifyRow>
                      </NotifyCard>
                      <NotifyCard title={<HelpTooltip content="自动续费成功或失败时通知您">自动续费结果</HelpTooltip>}>
                        <NotifyRow label="模式">
                          <ModePicker value={renewMode} options={RECEIVE_OPTIONS} onChange={setRenewMode} />
                        </NotifyRow>
                      </NotifyCard>
                    </>
                  )}
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter className="!px-4 sm:!px-6 pt-3">
            <Button size="sm" variant="bordered" className={OUTLINE_BUTTON} onPress={() => onPushOpenChange()}>取 消</Button>
            <Button size="sm" color="primary" className="text-sm font-normal" isLoading={pushSaving} onPress={handleSavePushSettings}>确 定</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 随机生成密码展示 */}
      <Modal isOpen={isGeneratedOpen} onOpenChange={() => {}} isDismissable={false} hideCloseButton size="sm" placement="center" backdrop="opaque">
        <ModalContent>
          <ModalHeader>密码重置成功</ModalHeader>
          <ModalBody className="space-y-3 text-sm">
            <p className="text-default-600">您的新密码为:</p>
            <button
              type="button"
              title="点击复制"
              aria-label="复制新密码"
              onClick={handleCopyGeneratedPassword}
              className="w-full px-3 py-2 rounded-medium bg-default-100 hover:bg-default-200 font-mono text-center text-base break-all transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {generatedPassword}
            </button>
            <p className="text-xs text-default-500">请使用新密码重新登录。</p>
          </ModalBody>
          <ModalFooter>
            <Button size="sm" color="primary" className="w-full text-sm font-normal" onPress={handleGeneratedConfirm}>我已保存，重新登录</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

    </div>
  );
}

const Row = ({ label, value, action, valueClassName }: { label: string; value: string; action?: ReactNode; valueClassName?: string }) => (
  <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 min-h-8">
    <span className="text-sm font-semibold text-foreground flex-shrink-0">{label}</span>
    {value && <span className={`text-sm ${valueClassName || 'text-foreground'}`}>{value}</span>}
    {action}
  </div>
);
