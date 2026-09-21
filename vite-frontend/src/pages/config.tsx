import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Input, Textarea } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Switch } from "@heroui/switch";
import { Select, SelectItem } from "@heroui/select";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, useDisclosure } from "@heroui/modal";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/table";
import { Tooltip } from "@heroui/tooltip";
import toast from 'react-hot-toast';
import { updateConfigs, testTelegramNotify } from '@/api';

import { isAdmin } from '@/utils/auth';
import { getCachedConfigs, clearConfigCache, updateSiteConfig } from '@/config/site';

interface ConfigItem {
  key: string;
  section: 'basic' | 'announcement' | 'payment' | 'telegram';
  label: string;
  placeholder?: string;
  description?: string;
  type: 'input' | 'switch' | 'select' | 'textarea' | 'paymentChannels' | 'readonly';
  options?: { label: string; value: string; description?: string }[];
  dependsOn?: string; // 依赖的配置项key
  dependsValue?: string; // 依赖的配置项值
}

interface PaymentChannel {
  id: string;
  name: string;
  type: 'epay' | 'epusdt' | 'tokenpay' | 'cyber' | 'cryptomus';
  enabled: boolean;
  config?: Record<string, string>;
}

const PAYMENT_TYPES: { label: string; value: PaymentChannel['type'] }[] = [
  { label: 'EPay', value: 'epay' },
  { label: 'EPUSDT', value: 'epusdt' },
  { label: 'TokenPay', value: 'tokenpay' },
  { label: 'Cyber', value: 'cyber' },
  { label: 'Cryptomus', value: 'cryptomus' }
];

const HelpIcon = () => (
  <svg className="w-3.5 h-3.5 text-default-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.5 9a2.5 2.5 0 114.096 1.929c-.596.487-1.096 1.054-1.096 1.821V13" />
    <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

const CONFIG_SECTIONS = [
  { key: 'basic', title: '基本设置', description: '站点名称、注册权限与主题展示策略' },
  { key: 'announcement', title: '站点公告', description: '显示在用户主页的公告内容' },
  { key: 'payment', title: '支付设置', description: '支付功能开关与服务商配置' },
  { key: 'telegram', title: 'Telegram 机器人', description: '配置机器人以启用账号绑定与个人中心推送通知' }
] as const;

// 网站配置项定义
const CONFIG_ITEMS: ConfigItem[] = [
  {
    key: 'ip',
    section: 'basic',
    label: '面板后端地址',
    placeholder: '请输入面板后端IP:PORT',
    description: '格式“ip:port”,用于对接节点时使用,ip是你安装面板服务器的公网ip,端口是安装脚本内输入的后端端口。不要套CDN,不支持https,通讯数据有加密',
    type: 'input'
  },
  {
    key: 'app_name',
    section: 'basic',
    label: '应用名称',
    placeholder: '请输入应用名称',
    description: '在浏览器标签页和导航栏显示的应用名称',
    type: 'input'
  },
  {
    key: 'allow_register',
    section: 'basic',
    label: '允许注册',
    description: '关闭后，站点将不再接受新用户自助注册',
    type: 'switch'
  },
  {
    key: 'invite_register_policy',
    section: 'basic',
    label: '邀请码注册策略',
    description: '设为仅邀请码时，注册页面必须填写有效的邀请码',
    type: 'select',
    options: [
      { label: '不使用邀请码', value: 'disabled' },
      { label: '可选填写', value: 'optional' },
      { label: '仅邀请码注册', value: 'required' }
    ]
  },
  {
    key: 'captcha_enabled',
    section: 'basic',
    label: '注册验证码',
    description: '开启后，用户登录时需要完成验证码验证',
    type: 'switch'
  },
  {
    key: 'captcha_type',
    section: 'basic',
    label: '验证码类型',
    description: '选择验证码的显示类型，不同类型有不同的安全级别',
    type: 'select',
    dependsOn: 'captcha_enabled',
    dependsValue: 'true',
    options: [
      { 
        label: '随机类型', 
        value: 'RANDOM', 
        description: '系统随机选择验证码类型' 
      },
      { 
        label: '滑块验证码', 
        value: 'SLIDER', 
        description: '拖动滑块完成拼图验证' 
      },
      { 
        label: '文字点选验证码', 
        value: 'WORD_IMAGE_CLICK', 
        description: '按顺序点击指定文字' 
      },
      { 
        label: '旋转验证码', 
        value: 'ROTATE', 
        description: '旋转图片到正确角度' 
      },
      { 
        label: '拼图验证码', 
        value: 'CONCAT', 
        description: '拖动滑块完成图片拼接' 
      }
    ]
  },
  {
    key: 'allow_user_custom_exit',
    section: 'basic',
    label: '允许用户自带出口',
    description: '允许用户在创建转发时自行指定出口相关配置',
    type: 'switch'
  },
  {
    key: 'allow_looking_glass',
    section: 'basic',
    label: '允许 Looking Glass 诊断',
    description: '允许用户使用节点网络诊断功能',
    type: 'switch'
  },
  {
    key: 'looking_glass_hide_ip',
    section: 'basic',
    label: '诊断结果隐藏 IP',
    description: '在 Looking Glass 结果中隐藏服务器与目标 IP 地址',
    type: 'switch'
  },
  {
    key: 'theme_policy',
    section: 'basic',
    label: '主题策略',
    description: '决定用户端默认使用的明暗主题',
    type: 'select',
    options: [
      { label: '跟随系统', value: 'system' },
      { label: '浅色主题', value: 'light' },
      { label: '深色主题', value: 'dark' }
    ]
  },
  {
    key: 'transparent_theme_enabled',
    section: 'basic',
    label: '透明主题',
    description: '开启后允许在用户端使用透明主题背景',
    type: 'switch'
  },
  {
    key: 'transparent_theme_landscape_url',
    section: 'basic',
    label: '透明主题背景图 URL（横屏）',
    placeholder: 'https://example.com/background-landscape.jpg',
    description: '建议使用宽幅图片，适用于桌面与横屏设备',
    type: 'input',
    dependsOn: 'transparent_theme_enabled',
    dependsValue: 'true'
  },
  {
    key: 'transparent_theme_portrait_url',
    section: 'basic',
    label: '透明主题背景图 URL（竖屏）',
    placeholder: 'https://example.com/background-portrait.jpg',
    description: '建议使用直幅图片，适用于手机竖屏设备',
    type: 'input',
    dependsOn: 'transparent_theme_enabled',
    dependsValue: 'true'
  },
  {
    key: 'site_announcement',
    section: 'announcement',
    label: '站点公告',
    placeholder: '请输入站点公告内容，将显示在用户首页',
    description: '显示在所有用户首页的公告内容，留空则不显示',
    type: 'textarea'
  },
  {
    key: 'payment_enabled',
    section: 'payment',
    label: '启用在线支付',
    description: '开启后用户可以在购买套餐时使用已配置的支付渠道',
    type: 'switch'
  },
  {
    key: 'payment_min_amount',
    section: 'payment',
    label: '最小支付金额',
    placeholder: '例如：10.00',
    description: '订单金额低于该数值时不允许创建支付订单，单位为元',
    type: 'input'
  },
  {
    key: 'payment_config_json',
    section: 'payment',
    label: '支付渠道配置',
    description: '添加支付渠道后，配置渠道名称、类型与是否启用',
    type: 'paymentChannels'
  },
  {
    key: 'telegram_enabled',
    section: 'telegram',
    label: '启用 Telegram 通知',
    description: '开启后用户可在个人中心绑定 Telegram 账号并接收推送通知',
    type: 'switch'
  },
  {
    key: 'telegram_bot_token',
    section: 'telegram',
    label: 'Bot Token',
    placeholder: '从 @BotFather 获取',
    description: '保存后将自动校验并获取机器人用户名',
    type: 'input'
  },
  {
    key: 'telegram_bot_username',
    section: 'telegram',
    label: 'Bot 用户名',
    description: 'Bot Token 校验成功后自动填充，用于生成绑定跳转链接，无需手动填写',
    type: 'readonly'
  }
];

// 初始化时从缓存读取配置，避免闪烁
const getInitialConfigs = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  
  const configKeys = CONFIG_ITEMS.map(item => item.key);
  const initialConfigs: Record<string, string> = {};
  
  try {
    configKeys.forEach(key => {
      const cachedValue = localStorage.getItem('vite_config_' + key);
      if (cachedValue) {
        initialConfigs[key] = cachedValue;
      }
    });
  } catch (error) {
  }
  
  return initialConfigs;
};

export default function ConfigPage() {
  const navigate = useNavigate();
  const initialConfigs = getInitialConfigs();
  const [configs, setConfigs] = useState<Record<string, string>>(initialConfigs);
  const [loading, setLoading] = useState(Object.keys(initialConfigs).length === 0); // 如果有缓存数据，不显示loading
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalConfigs, setOriginalConfigs] = useState<Record<string, string>>(initialConfigs);
  const [paymentChannels, setPaymentChannels] = useState<PaymentChannel[]>([]);
  const [telegramTesting, setTelegramTesting] = useState(false);
  const { isOpen: isChannelConfigOpen, onOpen: onChannelConfigOpen, onClose: onChannelConfigClose } = useDisclosure();
  const [configuringChannel, setConfiguringChannel] = useState<PaymentChannel | null>(null);

  // 权限检查
  useEffect(() => {
    if (!isAdmin()) {
      toast.error('权限不足，只有管理员可以访问此页面');
      navigate('/dashboard', { replace: true });
      return;
    }
  }, [navigate]);

  // 加载配置数据（优先从缓存）
  const loadConfigs = async (currentConfigs?: Record<string, string>) => {
    const configsToCompare = currentConfigs || configs;
    const hasInitialData = Object.keys(configsToCompare).length > 0;
    
    // 如果已有缓存数据，不显示loading，静默更新
    if (!hasInitialData) {
      setLoading(true);
    }
    
    try {
      const configData = await getCachedConfigs();

      // 支付渠道列表要每次都同步，不能只在 configs 整体有变化时才解析——
      // 否则页面刷新后，若缓存值恰好与服务器一致（最常见的情况），
      // paymentChannels 会一直停留在初始的空数组，表格就会显示"暂无支付渠道"，
      // 即使 payment_config_json 里其实是有数据的。
      try {
        const parsedChannels = JSON.parse(configData.payment_config_json || '[]');
        setPaymentChannels(Array.isArray(parsedChannels) ? parsedChannels : []);
      } catch {
        setPaymentChannels([]);
      }

      // 只有在数据有变化时才更新
      const hasDataChanged = JSON.stringify(configData) !== JSON.stringify(configsToCompare);
      if (hasDataChanged) {
        setConfigs(configData);
        setOriginalConfigs({ ...configData });
        setHasChanges(false);
      }
    } catch (error) {
      // 只有在没有缓存数据时才显示错误
      if (!hasInitialData) {
        toast.error('加载配置出错，请重试');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 延迟加载，避免阻塞初始渲染
    const timer = setTimeout(() => {
      loadConfigs(initialConfigs);
    }, 100);

    return () => clearTimeout(timer);
  }, []); // 只在组件挂载时执行一次

  // 处理配置项变更
  const handleConfigChange = (key: string, value: string) => {
    let newConfigs = { ...configs, [key]: value };
    
    // 特殊处理：启用验证码时，如果验证码类型未设置，默认为随机
    if (key === 'captcha_enabled' && value === 'true') {
      if (!newConfigs.captcha_type) {
        newConfigs.captcha_type = 'RANDOM';
      }
    }
    
    setConfigs(newConfigs);
    
    // 检查是否有变更
    const hasChangesNow = Object.keys(newConfigs).some(
      k => newConfigs[k] !== originalConfigs[k]
    ) || Object.keys(originalConfigs).some(
      k => originalConfigs[k] !== newConfigs[k]
    );
    setHasChanges(hasChangesNow);
  };

  const updatePaymentChannels = (channels: PaymentChannel[]) => {
    setPaymentChannels(channels);
    handleConfigChange('payment_config_json', JSON.stringify(channels));
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

  const addPaymentChannel = () => {
    setConfiguringChannel({
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      name: '', type: 'epay', enabled: true, config: {}
    });
    onChannelConfigOpen();
  };

  const openChannelConfig = (channel: PaymentChannel) => {
    setConfiguringChannel({ ...channel, config: { ...channel.config } });
    onChannelConfigOpen();
  };

  const saveChannelConfig = () => {
    if (!configuringChannel) return;
    const exists = paymentChannels.some(channel => channel.id === configuringChannel.id);
    updatePaymentChannels(exists
      ? paymentChannels.map(channel => channel.id === configuringChannel.id ? configuringChannel : channel)
      : [...paymentChannels, configuringChannel]
    );
    onChannelConfigClose();
  };

  // 保存配置
  const handleSave = async (section?: ConfigItem['section']) => {
    const sectionKeys = CONFIG_ITEMS
      .filter(item => (!section || item.section === section) && item.type !== 'readonly')
      .map(item => item.key);
    const configsToSave = Object.fromEntries(
      sectionKeys.filter(key => key in configs).map(key => [key, configs[key]])
    );

    if (Object.keys(configsToSave).length === 0) {
      toast('没有可保存的配置');
      return;
    }

    setSaving(true);
    try {
      const response = await updateConfigs(configsToSave);
      if (response.code === 0) {
        toast.success('配置保存成功');
        
        // 清除所有配置缓存，强制下次重新获取
        clearConfigCache();
        
        // 获取变更的配置项
        const changedKeys = Object.keys(configsToSave).filter(
          key => configs[key] !== originalConfigs[key]
        );
        
        const nextOriginalConfigs = { ...originalConfigs, ...configsToSave };
        setOriginalConfigs(nextOriginalConfigs);
        setHasChanges(Object.keys(configs).some(key => configs[key] !== nextOriginalConfigs[key]));
        
        // 如果应用名称发生变化，立即更新网站配置
        if (changedKeys.includes('app_name')) {
          await updateSiteConfig();
        }
        
        // 触发配置更新事件，通知其他组件
        window.dispatchEvent(new CustomEvent('configUpdated', { 
          detail: { changedKeys } 
        }));
      } else {
        toast.error('保存配置失败: ' + response.msg);
      }
    } catch (error) {
      toast.error('保存配置出错，请重试');
    } finally {
      setSaving(false);
    }
  };



  // 检查配置项是否应该显示（依赖检查）
  const shouldShowItem = (item: ConfigItem): boolean => {
    if (!item.dependsOn || !item.dependsValue) {
      return true;
    }
    return configs[item.dependsOn] === item.dependsValue;
  };

  // 渲染不同类型的配置项
  const renderConfigItem = (item: ConfigItem) => {
    const isChanged = hasChanges && configs[item.key] !== originalConfigs[item.key];
    
    switch (item.type) {
      case 'input':
        return (
          <Input autoComplete="off"
            value={configs[item.key] || ''}
            onChange={(e) => handleConfigChange(item.key, e.target.value)}
            placeholder={item.placeholder}
            variant="bordered"
            size="md"
            classNames={{
              input: "text-sm",
              inputWrapper: isChanged 
                ? "border-warning-300 data-[hover=true]:border-warning-400" 
                : ""
            }}
          />
        );

      case 'textarea':
        return (
          <Textarea autoComplete="off"
            value={configs[item.key] || ''}
            onChange={(e) => handleConfigChange(item.key, e.target.value)}
            placeholder={item.placeholder}
            variant="bordered"
            size="md"
            minRows={3}
            maxRows={8}
            classNames={{
              input: "text-sm",
              inputWrapper: isChanged
                ? "border-warning-300 data-[hover=true]:border-warning-400"
                : ""
            }}
          />
        );

      case 'switch':
        return (
          <Switch
            isSelected={configs[item.key] === 'true'}
            onValueChange={(checked) => handleConfigChange(item.key, checked ? 'true' : 'false')}
            color="primary"
            size="md"
            classNames={{
              wrapper: isChanged ? "border-warning-300" : ""
            }}
          >
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {configs[item.key] === 'true' ? '已启用' : '已禁用'}
            </span>
          </Switch>
        );

      case 'select':
        return (
          <Select
            selectedKeys={configs[item.key] ? [configs[item.key]] : []}
            onSelectionChange={(keys) => {
              const selectedKey = Array.from(keys)[0] as string;
              if (selectedKey) {
                handleConfigChange(item.key, selectedKey);
              }
            }}
            placeholder={`请选择${item.label}`}
            variant="bordered"
            size="md"
            classNames={{
              trigger: isChanged 
                ? "border-warning-300 data-[hover=true]:border-warning-400" 
                : ""
            }}
          >
            {item.options?.map((option) => (
              <SelectItem 
                key={option.value}
                description={option.description}
              >
                {option.label}
              </SelectItem>
            )) || []}
          </Select>
        );

      case 'paymentChannels':
        return (
          <div />
        );

      case 'readonly':
        return (
          <div className="px-3 py-2 rounded-medium border border-default-200 bg-default-50 dark:bg-white/[0.03] text-sm text-default-600">
            {configs[item.key] || '未获取'}
          </div>
        );

      default:
        return null;
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
    
      <div className="settings-page p-4 lg:p-6 max-w-[1600px] mx-auto">
        <Card className="settings-panel">
          <CardHeader className="flex flex-row items-center justify-between gap-4 p-4 border-b border-default-100">
            <div>
              <h1 className="text-base font-semibold text-foreground">站点设置</h1>
              <p className="mt-1 text-xs text-default-500">配置站点基本信息、安全选项与用户可见内容</p>
            </div>
          </CardHeader>

          <CardBody className="p-0">
            {CONFIG_SECTIONS.map((section) => {
              const items = CONFIG_ITEMS.filter(item => item.section === section.key && shouldShowItem(item));
              if (items.length === 0) return null;
              const sectionHasChanges = items.some(item => configs[item.key] !== originalConfigs[item.key]);

              return (
                <section key={section.key} className="settings-section">
                  <div className="flex items-center justify-between gap-4 px-4 py-4 lg:px-5 border-b border-default-100 bg-default-50/50 dark:bg-white/[0.015]">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
                      <p className="mt-1 text-xs text-default-500">{section.description}</p>
                    </div>
                    <Button
                      size="sm"
                      color="primary"
                      variant={sectionHasChanges ? 'solid' : 'flat'}
                      onClick={() => handleSave(section.key)}
                      isLoading={saving}
                      isDisabled={!sectionHasChanges}
                    >
                      保存
                    </Button>
                  </div>
                  {section.key === 'payment' ? (
                    <div className="p-4 lg:p-5">
                      <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,0.75fr)_minmax(360px,1.25fr)] gap-3 lg:gap-8 pb-5 border-b border-default-100">
                        <div className="pt-1"><p className="text-sm font-medium text-foreground">最小充值金额</p><p className="mt-1 text-xs text-default-500">订单金额不得低于此金额，单位为元</p></div>
                        <Input autoComplete="off" value={configs.payment_min_amount || ''} onChange={(event) => handleConfigChange('payment_min_amount', event.target.value)} placeholder="10.00" endContent={<span className="text-sm text-default-500">元</span>} className="w-full max-w-2xl lg:justify-self-end" />
                      </div>
                      <div className="flex items-center justify-between gap-3 py-4">
                        <div><p className="text-sm font-medium text-foreground">支付渠道</p><p className="mt-1 text-xs text-default-500">添加并配置可用的在线支付渠道</p></div>
                        <Button size="sm" variant="bordered" onPress={addPaymentChannel}>添加支付渠道</Button>
                      </div>
                      <Table removeWrapper aria-label="支付渠道列表" classNames={{ th: "management-table-heading", td: "management-table-cell", table: "payment-channel-table" }}>
                        <TableHeader><TableColumn>排序</TableColumn><TableColumn>类型</TableColumn><TableColumn>名称</TableColumn><TableColumn>是否启用</TableColumn><TableColumn>操作</TableColumn></TableHeader>
                        <TableBody emptyContent="暂无支付渠道">
                          {paymentChannels.map((channel, index) => <TableRow key={channel.id}>
                            <TableCell>{index + 1}</TableCell><TableCell>{PAYMENT_TYPES.find(type => type.value === channel.type)?.label}</TableCell><TableCell>{channel.name || '未命名渠道'}</TableCell><TableCell>{channel.enabled ? 'True' : 'False'}</TableCell>
                            <TableCell><div className="flex gap-2"><Button size="sm" variant="flat" onPress={() => openChannelConfig(channel)}>编辑</Button><Button size="sm" variant="light" color="danger" onPress={() => updatePaymentChannels(paymentChannels.filter(item => item.id !== channel.id))}>删除</Button></div></TableCell>
                          </TableRow>)}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <>
                      {items.map((item, index) => (
                        <div
                          key={item.key}
                          className={`grid grid-cols-1 lg:grid-cols-[minmax(260px,0.75fr)_minmax(360px,1.25fr)] gap-3 lg:gap-8 px-4 py-5 lg:px-5 ${index < items.length - 1 || section.key === 'telegram' ? 'border-b border-default-100' : ''}`}
                        >
                          <div className="pt-1">
                            <label className="text-sm font-medium text-foreground">{item.label}</label>
                            {item.description && <p className="mt-1 text-xs leading-5 text-default-500 max-w-md">{item.description}</p>}
                          </div>
                          <div className="w-full max-w-2xl lg:justify-self-end">{renderConfigItem(item)}</div>
                        </div>
                      ))}
                      {section.key === 'telegram' && (
                        <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,0.75fr)_minmax(360px,1.25fr)] gap-3 lg:gap-8 px-4 py-5 lg:px-5">
                          <div className="pt-1">
                            <p className="text-sm font-medium text-foreground">发送测试消息</p>
                            <p className="mt-1 text-xs text-default-500 max-w-md">向当前管理员账号已绑定的 Telegram 发送一条测试消息，验证 Bot Token 配置是否正确（需先在个人中心绑定 Telegram）</p>
                          </div>
                          <div className="w-full max-w-2xl lg:justify-self-end">
                            <Button size="sm" variant="bordered" isLoading={telegramTesting} onPress={handleTestTelegram}>
                              发送测试消息
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </section>
              );
            })}
          </CardBody>
        </Card>

        {/* 操作提示 */}
        {hasChanges && (
          <Card className="mt-4 bg-warning-50 dark:bg-warning-900/20 border-warning-200 dark:border-warning-800">
            <CardBody className="py-3">
              <div className="flex items-center gap-2 text-warning-700 dark:text-warning-300">
                <div className="w-2 h-2 bg-warning-500 rounded-full animate-pulse" />
                <span className="text-sm">
                  检测到配置变更，请记得保存您的修改
                </span>
              </div>
            </CardBody>
          </Card>
        )}

        <Modal isOpen={isChannelConfigOpen} onClose={onChannelConfigClose} size="lg" backdrop="blur">
          <ModalContent>
            <ModalHeader>{paymentChannels.some(channel => channel.id === configuringChannel?.id) ? '编辑支付渠道' : '添加支付渠道'}</ModalHeader>
            <ModalBody>
              <div className="space-y-3">
                <Input autoComplete="off" label="名称" placeholder="名称不能重复，且不能为空。" value={configuringChannel?.name || ''} onChange={(event) => setConfiguringChannel(channel => channel ? { ...channel, name: event.target.value } : null)} />
                <Select label="类型" selectedKeys={configuringChannel ? [configuringChannel.type] : []} onSelectionChange={(keys) => setConfiguringChannel(channel => channel ? { ...channel, type: Array.from(keys)[0] as PaymentChannel['type'] } : null)}>
                  {PAYMENT_TYPES.map(type => <SelectItem key={type.value}>{type.value}</SelectItem>)}
                </Select>
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm font-medium text-foreground">启用</span>
                  <Switch isSelected={configuringChannel?.enabled ?? false} onValueChange={(enabled) => setConfiguringChannel(channel => channel ? { ...channel, enabled } : null)} />
                </div>
                <Input autoComplete="off"
                  label={<span className="inline-flex items-center gap-1">URL<Tooltip content="支付服务商提供的 API 接口地址"><span><HelpIcon /></span></Tooltip></span>}
                  value={configuringChannel?.config?.url || ''}
                  onChange={(event) => setConfiguringChannel(channel => channel ? { ...channel, config: { ...channel.config, url: event.target.value } } : null)}
                />
                <Input autoComplete="off"
                  label="PID / 商户号"
                  placeholder="只有部分支付类型需要填写"
                  value={configuringChannel?.config?.pid || ''}
                  onChange={(event) => setConfiguringChannel(channel => channel ? { ...channel, config: { ...channel.config, pid: event.target.value } } : null)}
                />
                <Input autoComplete="off"
                  label="Secret / 密钥"
                  type="password"
                  value={configuringChannel?.config?.secret || ''}
                  onChange={(event) => setConfiguringChannel(channel => channel ? { ...channel, config: { ...channel.config, secret: event.target.value } } : null)}
                />
                <Input autoComplete="off"
                  label="回调 Host"
                  placeholder="示例：https://xxx.com，留空则使用用户访问的域名"
                  value={configuringChannel?.config?.callbackHost || ''}
                  onChange={(event) => setConfiguringChannel(channel => channel ? { ...channel, config: { ...channel.config, callbackHost: event.target.value } } : null)}
                />
                <Input autoComplete="off"
                  label={<span className="inline-flex items-center gap-1">费率<Tooltip content="该支付渠道收取的手续费比例"><span><HelpIcon /></span></Tooltip></span>}
                  type="number"
                  value={configuringChannel?.config?.feeRate ?? '0.0'}
                  onChange={(event) => setConfiguringChannel(channel => channel ? { ...channel, config: { ...channel.config, feeRate: event.target.value } } : null)}
                  endContent={<span className="text-sm text-default-500">%</span>}
                />
              </div>
            </ModalBody>
            <ModalFooter><Button variant="light" onPress={onChannelConfigClose}>取消</Button><Button color="primary" onPress={saveChannelConfig}>确定</Button></ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    
  );
} 
