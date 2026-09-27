import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input, Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Spinner } from "@heroui/spinner";
import { Switch } from "@heroui/switch";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/table";
import { Tooltip } from "@heroui/tooltip";
import toast from 'react-hot-toast';
import { getConfigs, updateConfigs, testTelegramNotify, getDeviceGroupList, updateDeviceGroupOfflineConfig, getTelegramSendLogs } from '@/api';
import { isAdmin } from '@/utils/auth';

interface TemplateMeta {
  key: string;
  title: string;
  placeholders: string;
  defaultValue: string;
}

const TEMPLATE_META: TemplateMeta[] = [
  { key: 'telegram_tpl_payment_success', title: '充值成功', placeholders: '{amount} 充值金额　{balance} 当前余额', defaultValue: '金额：¥{amount}\n当前余额：¥{balance}' },
  { key: 'telegram_tpl_device_offline', title: '设备离线', placeholders: '{name} 设备名称', defaultValue: '设备「{name}」已离线' },
  { key: 'telegram_tpl_device_online', title: '设备恢复在线', placeholders: '{name} 设备名称', defaultValue: '设备「{name}」已恢复在线' },
  { key: 'telegram_tpl_renew_success', title: '自动续费成功', placeholders: '{amount} 扣款金额', defaultValue: '扣款金额：¥{amount}' },
  { key: 'telegram_tpl_renew_failed', title: '自动续费失败', placeholders: '{reason} 失败原因', defaultValue: '原因：{reason}' },
  { key: 'telegram_tpl_expiry_reminder', title: '套餐到期提醒', placeholders: '{days} 距到期天数', defaultValue: '您的套餐将于 {days} 天后到期，请及时续费' },
  { key: 'telegram_tpl_flow_reminder', title: '流量即将用尽提醒', placeholders: '{percent} 已用流量百分比', defaultValue: '您的套餐流量已使用 {percent}%，即将用尽，请留意' },
];

const LOG_TYPE_LABELS: Record<string, string> = {
  PAYMENT_SUCCESS: '充值成功',
  DEVICE_OFFLINE: '设备离线',
  DEVICE_ONLINE: '设备恢复',
  RENEW_SUCCESS: '自动续费成功',
  RENEW_FAILED: '自动续费失败',
  EXPIRY_REMINDER: '到期提醒',
  FLOW_REMINDER: '流量提醒',
  TEST: '测试消息',
};

interface TelegramLogRow {
  id: number;
  userId: number | null;
  userName: string | null;
  chatId: string;
  type: string;
  content: string;
  status: string;
  error: string | null;
  createdTime: number;
}

const HelpIcon = () => (
  <svg className="w-3.5 h-3.5 text-default-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.5 9a2.5 2.5 0 114.096 1.929c-.596.487-1.096 1.054-1.096 1.821V13" />
    <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

const InfoIcon = () => (
  <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
  </svg>
);

interface GroupOverrideForm {
  graceEnabled: boolean;
  graceSeconds: string;
  retainEnabled: boolean;
  retainSeconds: string;
}

interface DeviceGroupRow {
  id: number;
  name: string;
}

export default function PushNotificationPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  // Telegram Bot 推送通道
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramUsername, setTelegramUsername] = useState('');
  const [telegramWebhookUrl, setTelegramWebhookUrl] = useState('');
  const [telegramSaving, setTelegramSaving] = useState(false);
  const [telegramTesting, setTelegramTesting] = useState(false);

  // 设备离线通知：全局默认设置
  const [graceEnabled, setGraceEnabled] = useState(false);
  const [graceSeconds, setGraceSeconds] = useState('20');
  const [retainEnabled, setRetainEnabled] = useState(false);
  const [retainSeconds, setRetainSeconds] = useState('86400');

  // 设备离线通知：按设备组覆盖设置
  const [groups, setGroups] = useState<DeviceGroupRow[]>([]);
  const [groupOverrides, setGroupOverrides] = useState<Record<number, GroupOverrideForm>>({});
  const [offlineSaving, setOfflineSaving] = useState(false);

  // 消息模板与提醒阈值/时间
  const [templates, setTemplates] = useState<Record<string, string>>(
    () => Object.fromEntries(TEMPLATE_META.map(t => [t.key, t.defaultValue]))
  );
  const [expiryReminderDays, setExpiryReminderDays] = useState('7');
  const [flowReminderPercent, setFlowReminderPercent] = useState('90');
  const [reminderHour, setReminderHour] = useState('9');
  const [templatesSaving, setTemplatesSaving] = useState(false);

  // 发送记录
  const [logs, setLogs] = useState<TelegramLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logTypeFilter, setLogTypeFilter] = useState<string>('');
  const [logStatusFilter, setLogStatusFilter] = useState<string>('');

  useEffect(() => {
    if (!isAdmin()) {
      toast.error('权限不足，只有管理员可以访问此页面');
      navigate('/dashboard', { replace: true });
      return;
    }
    loadAll();
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [configRes, groupRes] = await Promise.all([getConfigs(), getDeviceGroupList()]);

      if (configRes.code === 0) {
        const c = configRes.data || {};
        setTelegramEnabled(c.telegram_enabled === 'true');
        setTelegramToken(c.telegram_bot_token || '');
        setTelegramUsername(c.telegram_bot_username || '');
        setTelegramWebhookUrl(c.telegram_webhook_url || '');
        setGraceEnabled(c.device_offline_grace_enabled === 'true');
        setGraceSeconds(c.device_offline_grace_seconds || '20');
        setRetainEnabled(c.device_offline_retain_enabled === 'true');
        setRetainSeconds(c.device_offline_retain_seconds || '86400');
        setTemplates(Object.fromEntries(TEMPLATE_META.map(t => [t.key, c[t.key] || t.defaultValue])));
        setExpiryReminderDays(c.telegram_expiry_reminder_days || '7');
        setFlowReminderPercent(c.telegram_flow_reminder_percent || '90');
        setReminderHour(c.telegram_reminder_hour || '9');
      } else {
        toast.error(configRes.msg || '获取配置失败');
      }

      if (groupRes.code === 0) {
        // 链式出口设备组没有自己的物理设备，不存在"离线"这回事，不出现在覆盖表格里
        const list = (groupRes.data || []).filter((g: any) => g.direction !== 'chain');
        setGroups(list.map((g: any) => ({ id: g.id, name: g.name })));
        const overrides: Record<number, GroupOverrideForm> = {};
        list.forEach((g: any) => {
          overrides[g.id] = {
            graceEnabled: !!g.offlineGraceEnabled,
            graceSeconds: g.offlineGraceSeconds != null ? String(g.offlineGraceSeconds) : '',
            retainEnabled: !!g.offlineRetainEnabled,
            retainSeconds: g.offlineRetainSeconds != null ? String(g.offlineRetainSeconds) : ''
          };
        });
        setGroupOverrides(overrides);
      }
    } catch (error) {
      toast.error('加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  const saveTelegramChannel = async () => {
    setTelegramSaving(true);
    try {
      const res = await updateConfigs({
        telegram_enabled: telegramEnabled ? 'true' : 'false',
        telegram_bot_token: telegramToken,
        telegram_webhook_url: telegramWebhookUrl
      });
      if (res.code === 0) {
        toast.success('通道配置已保存');
        loadAll();
      } else {
        toast.error(res.msg || '保存失败');
      }
    } catch (error) {
      toast.error('保存失败');
    } finally {
      setTelegramSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    setTelegramTesting(true);
    try {
      const res = await testTelegramNotify();
      if (res.code === 0) {
        toast.success(res.msg || '测试消息已发送，请查看 Telegram');
      } else {
        toast.error(res.msg || '发送失败');
      }
    } catch (error) {
      toast.error('发送失败，请重试');
    } finally {
      setTelegramTesting(false);
    }
  };

  const updateGroupOverride = (id: number, patch: Partial<GroupOverrideForm>) => {
    setGroupOverrides(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const resetTemplate = (key: string, defaultValue: string) => {
    setTemplates(prev => ({ ...prev, [key]: defaultValue }));
  };

  const saveTemplates = async () => {
    setTemplatesSaving(true);
    try {
      const res = await updateConfigs({
        ...templates,
        telegram_expiry_reminder_days: expiryReminderDays || '7',
        telegram_flow_reminder_percent: flowReminderPercent || '90',
        telegram_reminder_hour: reminderHour || '9',
      });
      if (res.code === 0) {
        toast.success('消息模板与提醒设置已保存');
      } else {
        toast.error(res.msg || '保存失败');
      }
    } catch (error) {
      toast.error('保存失败');
    } finally {
      setTemplatesSaving(false);
    }
  };

  const loadLogs = async (type = logTypeFilter, status = logStatusFilter) => {
    setLogsLoading(true);
    try {
      const res = await getTelegramSendLogs({ type: type || undefined, status: status || undefined, limit: 100 });
      if (res.code === 0) {
        setLogs(res.data || []);
      } else {
        toast.error(res.msg || '获取发送记录失败');
      }
    } catch (error) {
      toast.error('获取发送记录失败');
    } finally {
      setLogsLoading(false);
    }
  };

  const saveOfflineConfig = async () => {
    setOfflineSaving(true);
    try {
      const globalRes = await updateConfigs({
        device_offline_grace_enabled: graceEnabled ? 'true' : 'false',
        device_offline_grace_seconds: graceSeconds || '20',
        device_offline_retain_enabled: retainEnabled ? 'true' : 'false',
        device_offline_retain_seconds: retainSeconds || '86400'
      });
      if (globalRes.code !== 0) {
        toast.error(globalRes.msg || '保存失败');
        return;
      }

      const groupPayload = groups.map(g => {
        const o = groupOverrides[g.id] || { graceEnabled: false, graceSeconds: '', retainEnabled: false, retainSeconds: '' };
        return {
          id: g.id,
          offlineGraceEnabled: o.graceEnabled,
          offlineGraceSeconds: o.graceSeconds ? parseInt(o.graceSeconds) : null,
          offlineRetainEnabled: o.retainEnabled,
          offlineRetainSeconds: o.retainSeconds ? parseInt(o.retainSeconds) : null
        };
      });
      const groupRes = await updateDeviceGroupOfflineConfig(groupPayload);
      if (groupRes.code === 0) {
        toast.success('离线通知配置已保存');
        loadAll();
      } else {
        toast.error(groupRes.msg || '保存失败');
      }
    } catch (error) {
      toast.error('保存失败');
    } finally {
      setOfflineSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" label="加载配置中..." />
      </div>
    );
  }

  return (
    <div className="settings-page p-4 lg:p-6 max-w-[1600px] mx-auto space-y-4">
      {/* Telegram Bot 推送通道 */}
      <Card className="settings-panel">
        <CardHeader className="flex flex-row items-center justify-between gap-4 p-4 border-b border-default-100">
          <div className="flex items-center gap-1.5">
            <h1 className="text-base font-semibold text-foreground">Telegram Bot 推送通道</h1>
            <Tooltip content="用于向用户 / 管理员发送充值到账、设备上下线等推送通知，采用长轮询方式接收 Telegram 消息，无需公网 HTTPS 入口"><span className="inline-flex items-center"><HelpIcon /></span></Tooltip>
          </div>
          <Button size="sm" color="default" onPress={saveTelegramChannel} isLoading={telegramSaving}>保存通道配置</Button>
        </CardHeader>
        <CardBody className="p-4 lg:p-5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,0.75fr)_minmax(360px,1.25fr)] gap-3 lg:gap-8 items-center">
            <label className="text-sm font-medium text-foreground">启用 Telegram Bot</label>
            <div className="w-full max-w-2xl lg:justify-self-end"><Switch isSelected={telegramEnabled} onValueChange={setTelegramEnabled} /></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,0.75fr)_minmax(360px,1.25fr)] gap-3 lg:gap-8 items-start">
            <label className="text-sm font-medium text-foreground pt-2">Bot Token</label>
            <Input size="sm" autoComplete="off" placeholder="请输入 Bot 的 Token" value={telegramToken} onChange={(e) => setTelegramToken(e.target.value)} variant="bordered" className="w-full max-w-2xl lg:justify-self-end" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,0.75fr)_minmax(360px,1.25fr)] gap-3 lg:gap-8 items-start">
            <label className="text-sm font-medium text-foreground pt-2 inline-flex items-center gap-1 leading-none">
              Bot 用户名
              <Tooltip content="保存 Bot Token 后自动校验并回填，用于生成绑定跳转链接，无需手动填写"><span className="inline-flex items-center"><HelpIcon /></span></Tooltip>
            </label>
            <Input size="sm" autoComplete="off" isReadOnly placeholder="保存 Bot Token 后自动填充" value={telegramUsername} variant="bordered" className="w-full max-w-2xl lg:justify-self-end" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,0.75fr)_minmax(360px,1.25fr)] gap-3 lg:gap-8 items-start">
            <label className="text-sm font-medium text-foreground pt-2 inline-flex items-center gap-1 leading-none">
              Webhook URL
              <Tooltip content="可选。不填则使用长轮询（Poller）模式拉取消息；填写后 Telegram 会改为主动推送到此地址，保存时自动向 Telegram 注册/取消注册"><span className="inline-flex items-center"><HelpIcon /></span></Tooltip>
            </label>
            <Input
              size="sm"
              autoComplete="off"
              placeholder="留空则使用 Poller 模式"
              value={telegramWebhookUrl}
              onChange={(e) => setTelegramWebhookUrl(e.target.value)}
              variant="bordered"
              className="w-full max-w-2xl lg:justify-self-end"
              endContent={
                <button
                  type="button"
                  className="text-xs font-medium text-default-600 hover:text-foreground flex-shrink-0 disabled:text-default-300 disabled:cursor-not-allowed"
                  disabled={!telegramToken}
                  onClick={() => setTelegramWebhookUrl(`${window.location.origin}/api/v1/telegram/webhook/${telegramToken}`)}
                >
                  自动填充
                </button>
              }
            />
          </div>
          {telegramEnabled && telegramToken && (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,0.75fr)_minmax(360px,1.25fr)] gap-3 lg:gap-8 items-center pt-3 border-t border-default-100">
              <div>
                <p className="text-sm font-medium text-foreground">发送测试消息</p>
                <p className="mt-1 text-xs text-default-500 max-w-md">向当前管理员账号已绑定的 Telegram 发送一条测试消息（需先在个人中心绑定 Telegram）</p>
              </div>
              <div className="w-full max-w-2xl lg:justify-self-end">
                <Button size="sm" variant="bordered" isLoading={telegramTesting} onPress={handleTestTelegram}>发送测试消息</Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* 设备离线通知 */}
      <Card className="settings-panel">
        <CardHeader className="flex flex-row items-center gap-1.5 p-4 border-b border-default-100">
          <h1 className="text-base font-semibold text-foreground">设备离线通知</h1>
          <Tooltip content="控制设备断线后多久才判定离线、离线后最后一次状态信息保留多久"><span className="inline-flex items-center"><HelpIcon /></span></Tooltip>
        </CardHeader>
        <CardBody className="p-4 lg:p-5 space-y-5">
          <div className="flex gap-3 p-3 rounded-medium bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300 text-xs leading-6">
            <InfoIcon />
            <div>
              <p className="font-semibold">行为说明</p>
              <p>1. 设备离线宽限期：设备最后一次心跳超过该时间后，会被标记为离线，并触发离线通知。</p>
              <p>2. 设备离线保留期：设备离线后继续保留在线会话信息的最长时间，超过后会被彻底移除。</p>
              <p>3. 全局默认值可以单独开启或关闭；关闭时，系统回退到配置文件中的原始设置。</p>
              <p>4. 若某个设备组未启用自定义值，则自动继承全局默认值；若全局默认也未启用，则继续回退到配置文件默认值。</p>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">全局默认设置</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,0.75fr)_minmax(360px,1.25fr)] gap-3 lg:gap-8 items-center">
                <label className="text-sm text-foreground inline-flex items-center gap-1 leading-none">设备离线宽限期<Tooltip content="设备最后一次心跳超过该时间后才标记为离线"><span className="inline-flex items-center"><HelpIcon /></span></Tooltip></label>
                <div className="w-full max-w-2xl lg:justify-self-end flex items-center gap-2">
                  <Switch size="sm" isSelected={graceEnabled} onValueChange={setGraceEnabled} />
                  <Input autoComplete="off" type="number" isDisabled={!graceEnabled} value={graceSeconds} onChange={(e) => setGraceSeconds(e.target.value)} variant="bordered" size="sm" endContent={<span className="text-xs text-default-400">秒</span>} className="max-w-[160px]" />
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,0.75fr)_minmax(360px,1.25fr)] gap-3 lg:gap-8 items-center">
                <label className="text-sm text-foreground inline-flex items-center gap-1 leading-none">设备离线保留期<Tooltip content="设备离线后，最后一次状态信息继续保留展示的时长"><span className="inline-flex items-center"><HelpIcon /></span></Tooltip></label>
                <div className="w-full max-w-2xl lg:justify-self-end flex items-center gap-2">
                  <Switch size="sm" isSelected={retainEnabled} onValueChange={setRetainEnabled} />
                  <Input autoComplete="off" type="number" isDisabled={!retainEnabled} value={retainSeconds} onChange={(e) => setRetainSeconds(e.target.value)} variant="bordered" size="sm" endContent={<span className="text-xs text-default-400">秒</span>} className="max-w-[160px]" />
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">设备组覆盖设置</h2>
            <div className="settings-table-scroll">
              <Table removeWrapper aria-label="设备组离线通知覆盖设置" classNames={{ th: "management-table-heading", td: "management-table-cell", table: "min-w-[640px]" }}>
                <TableHeader>
                  <TableColumn>设备组</TableColumn>
                  <TableColumn>自定义设备离线宽限期</TableColumn>
                  <TableColumn>自定义设备离线保留期</TableColumn>
                </TableHeader>
                <TableBody emptyContent="暂无设备组">
                  {groups.map(group => {
                    const o = groupOverrides[group.id] || { graceEnabled: false, graceSeconds: '', retainEnabled: false, retainSeconds: '' };
                    return (
                      <TableRow key={group.id}>
                        <TableCell className="font-medium">{group.name} (#{group.id})</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch size="sm" isSelected={o.graceEnabled} onValueChange={(v) => updateGroupOverride(group.id, { graceEnabled: v })} />
                            <Input autoComplete="off" type="number" isDisabled={!o.graceEnabled} value={o.graceSeconds} onChange={(e) => updateGroupOverride(group.id, { graceSeconds: e.target.value })} variant="bordered" size="sm" endContent={<span className="text-xs text-default-400">秒</span>} className="max-w-[140px]" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch size="sm" isSelected={o.retainEnabled} onValueChange={(v) => updateGroupOverride(group.id, { retainEnabled: v })} />
                            <Input autoComplete="off" type="number" isDisabled={!o.retainEnabled} value={o.retainSeconds} onChange={(e) => updateGroupOverride(group.id, { retainSeconds: e.target.value })} variant="bordered" size="sm" endContent={<span className="text-xs text-default-400">秒</span>} className="max-w-[140px]" />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button color="default" onPress={saveOfflineConfig} isLoading={offlineSaving}>保存离线通知配置</Button>
          </div>
        </CardBody>
      </Card>

      {/* Telegram 消息模板与提醒设置 */}
      <Card className="settings-panel">
        <CardHeader className="flex flex-row items-center justify-between gap-4 p-4 border-b border-default-100">
          <div className="flex items-center gap-1.5">
            <h1 className="text-base font-semibold text-foreground">消息模板与提醒设置</h1>
            <Tooltip content="自定义各类 Telegram 通知的正文内容，以及到期/流量提醒的阈值与每日推送时间；标题（含图标）由系统固定生成"><span className="inline-flex items-center"><HelpIcon /></span></Tooltip>
          </div>
          <Button size="sm" color="default" onPress={saveTemplates} isLoading={templatesSaving}>保存模板与设置</Button>
        </CardHeader>
        <CardBody className="p-4 lg:p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">到期提醒阈值（天）</label>
              <Input autoComplete="off" type="number" size="sm" variant="bordered" value={expiryReminderDays} onChange={(e) => setExpiryReminderDays(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">流量提醒阈值（%）</label>
              <Input autoComplete="off" type="number" size="sm" variant="bordered" value={flowReminderPercent} onChange={(e) => setFlowReminderPercent(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block inline-flex items-center gap-1">
                每日推送时间（小时）
                <Tooltip content="0-23 的整数，例如 9 表示每天 9:00 左右检查并推送到期/流量提醒"><span className="inline-flex items-center"><HelpIcon /></span></Tooltip>
              </label>
              <Input autoComplete="off" type="number" size="sm" variant="bordered" value={reminderHour} onChange={(e) => setReminderHour(e.target.value)} />
            </div>
          </div>

          <div className="space-y-4 pt-2 border-t border-default-100">
            {TEMPLATE_META.map((meta) => (
              <div key={meta.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">{meta.title}</label>
                  <button
                    type="button"
                    className="text-xs font-medium text-default-500 hover:text-foreground"
                    onClick={() => resetTemplate(meta.key, meta.defaultValue)}
                  >
                    恢复默认
                  </button>
                </div>
                <Textarea
                  autoComplete="off"
                  size="sm"
                  variant="bordered"
                  minRows={2}
                  value={templates[meta.key] ?? ''}
                  onChange={(e) => setTemplates(prev => ({ ...prev, [meta.key]: e.target.value }))}
                />
                <p className="text-xs text-default-400">可用占位符：{meta.placeholders}</p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Telegram 发送记录 */}
      <Card className="settings-panel">
        <CardHeader className="flex flex-row items-center justify-between gap-4 p-4 border-b border-default-100 flex-wrap">
          <div className="flex items-center gap-1.5">
            <h1 className="text-base font-semibold text-foreground">发送记录</h1>
            <Tooltip content="每次尝试发送 Telegram 通知（无论成功/失败）的历史记录，最多展示最近 100 条；记录保留 30 天"><span className="inline-flex items-center"><HelpIcon /></span></Tooltip>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              size="sm"
              variant="bordered"
              placeholder="全部类型"
              className="w-36"
              selectedKeys={logTypeFilter ? [logTypeFilter] : []}
              onSelectionChange={(keys) => {
                const key = (Array.from(keys)[0] as string) || '';
                setLogTypeFilter(key);
                loadLogs(key, logStatusFilter);
              }}
            >
              {Object.entries(LOG_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value}>{label}</SelectItem>
              ))}
            </Select>
            <Select
              size="sm"
              variant="bordered"
              placeholder="全部状态"
              className="w-32"
              selectedKeys={logStatusFilter ? [logStatusFilter] : []}
              onSelectionChange={(keys) => {
                const key = (Array.from(keys)[0] as string) || '';
                setLogStatusFilter(key);
                loadLogs(logTypeFilter, key);
              }}
            >
              <SelectItem key="SUCCESS">成功</SelectItem>
              <SelectItem key="FAILED">失败</SelectItem>
            </Select>
            <Button size="sm" variant="flat" isLoading={logsLoading} onPress={() => loadLogs()}>刷新</Button>
          </div>
        </CardHeader>
        <CardBody className="p-4 lg:p-5">
          <div className="settings-table-scroll">
            <Table removeWrapper aria-label="Telegram 发送记录" classNames={{ th: "management-table-heading", td: "management-table-cell", table: "min-w-[720px]" }}>
              <TableHeader>
                <TableColumn>时间</TableColumn>
                <TableColumn>接收者</TableColumn>
                <TableColumn>类型</TableColumn>
                <TableColumn>状态</TableColumn>
                <TableColumn>内容/错误</TableColumn>
              </TableHeader>
              <TableBody emptyContent={logsLoading ? '加载中...' : '暂无发送记录'}>
                {logs.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap text-xs text-default-500">{new Date(item.createdTime).toLocaleString()}</TableCell>
                    <TableCell>{item.userName || (item.userId != null ? `用户#${item.userId}` : '-')}</TableCell>
                    <TableCell><Chip size="sm" variant="flat">{LOG_TYPE_LABELS[item.type] || item.type}</Chip></TableCell>
                    <TableCell>
                      {item.status === 'SUCCESS'
                        ? <Chip size="sm" variant="flat" color="success">成功</Chip>
                        : <Chip size="sm" variant="flat" color="danger">失败</Chip>}
                    </TableCell>
                    <TableCell className="max-w-[360px]">
                      <p className="text-xs text-default-500 whitespace-pre-line line-clamp-2">
                        {item.status === 'SUCCESS' ? item.content : (item.error || item.content)}
                      </p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
