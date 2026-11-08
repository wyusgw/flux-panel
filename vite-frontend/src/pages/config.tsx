import { FileAddOutlined } from "@/components/ant-icons";
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
import toast from 'react-hot-toast';
import { showApiFailure } from '@/components/error-dialog';
import { updateConfigs } from '@/api';

import { isAdmin } from '@/utils/auth';
import { getCachedConfigs, clearConfigCache, updateSiteConfig } from '@/config/site';
import { HelpTooltip } from '@/components/help-tooltip';
import { DayOfMonthPicker } from '@/components/day-of-month-picker';
import { EmptyState } from "@/components/empty-state";
import { ToastWarningIcon } from '@/components/toast-icons';

interface ConfigItem {
  key: string;
  section: 'basic' | 'announcement' | 'payment';
  label: string;
  placeholder?: string;
  description?: string;
  type: 'input' | 'switch' | 'select' | 'textarea' | 'dayOfMonth' | 'time' | 'paymentChannels' | 'readonly';
  options?: { label: string; value: string; description?: string }[];
  dependsOn?: string; // 依赖的配置项key
  dependsValue?: string; // 依赖的配置项值
  secret?: boolean; // 密钥类输入框：以密码形式显示
  defaultValue?: string; // 没配置过（或配置值无效）时按这个值处理；下拉框会据此显示默认选中项，依赖它的项也据此判断显示
}

interface PaymentChannel {
  id: string;
  name: string;
  type: 'epay' | 'epusdt' | 'tokenpay' | 'cyber' | 'cryptomus';
  enabled: boolean;
  payTypes?: string[];
  config?: Record<string, string>;
}

/** 易支付付款方式，与后端 RechargeServiceImpl.PAY_TYPE_LABELS 一致 */
const EPAY_PAY_TYPES = [
  { value: 'alipay', label: '支付宝' },
  { value: 'wxpay', label: '微信支付' },
  { value: 'qqpay', label: 'QQ钱包' }
];

const PAYMENT_TYPES: { label: string; value: PaymentChannel['type'] }[] = [
  { label: 'EPay', value: 'epay' },
  { label: 'EPUSDT', value: 'epusdt' },
  { label: 'TokenPay', value: 'tokenpay' },
  { label: 'Cyber', value: 'cyber' },
  { label: 'Cryptomus', value: 'cryptomus' }
];


const CONFIG_SECTIONS = [
  { key: 'basic', title: '基本设置', description: '站点名称、注册权限与主题展示策略' },
  { key: 'announcement', title: '站点公告', description: '显示在用户主页的公告内容' },
  { key: 'payment', title: '支付设置', description: '支付功能开关与服务商配置' }
] as const;

// 网站配置项定义
const CONFIG_ITEMS: ConfigItem[] = [
  {
    key: 'ip',
    section: 'basic',
    label: '面板后端地址',
    // 留空时自动使用当前访问面板的地址，输入框里只显示这个识别到的值
    placeholder: typeof window !== 'undefined' ? window.location.host : '',
    description: '用于对接节点，格式 ip:port。留空则自动使用你当前访问面板的地址生成节点安装命令；面板套了 CDN 或节点需要走其他地址时再手动填写面板服务器的公网 IP 和后端端口，不要套 CDN',
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
    key: 'user_device_group_enabled',
    section: 'basic',
    label: '单端隧道',
    description: '开启后，普通用户可以自建设备组（入口或出口），把自己的设备接入面板用于转发规则',
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
    label: '验证码',
    description: '开启后，用户登录时需要完成验证码验证',
    type: 'switch'
  },
  {
    key: 'captcha_provider',
    section: 'basic',
    label: '验证码类型',
    description: '自带验证码是面板内置的滑块、点选等验证；也可以改用 Google reCAPTCHA 或 Cloudflare Turnstile',
    type: 'select',
    defaultValue: 'BUILT_IN',
    dependsOn: 'captcha_enabled',
    dependsValue: 'true',
    options: [
      { label: '自带验证码', value: 'BUILT_IN', description: '面板内置，不依赖第三方服务' },
      { label: 'Google reCAPTCHA', value: 'GOOGLE', description: 'Google reCAPTCHA v2（我不是机器人），需要填写下方的站点密钥和服务端密钥' },
      { label: 'Cloudflare Turnstile', value: 'CLOUDFLARE', description: 'Cloudflare Turnstile，需要填写下方的站点密钥和服务端密钥' }
    ]
  },
  {
    key: 'captcha_type',
    section: 'basic',
    label: '自带验证码类型',
    description: '选择自带验证码的显示类型，不同类型有不同的安全级别',
    type: 'select',
    dependsOn: 'captcha_provider',
    dependsValue: 'BUILT_IN',
    options: [
      { label: '随机类型', value: 'RANDOM', description: '系统随机选择验证码类型' },
      { label: '滑块验证码', value: 'SLIDER', description: '拖动滑块完成拼图验证' },
      { label: '文字点选验证码', value: 'WORD_IMAGE_CLICK', description: '按顺序点击指定文字' },
      { label: '旋转验证码', value: 'ROTATE', description: '旋转图片到正确角度' },
      { label: '拼图验证码', value: 'CONCAT', description: '拖动滑块完成图片拼接' }
    ]
  },
  {
    key: 'captcha_google_site_key',
    section: 'basic',
    label: 'Google 站点密钥 (Site Key)',
    placeholder: '6Lc...',
    description: '在 Google reCAPTCHA 管理后台创建 v2 复选框类型的密钥后获得，显示在登录页上。需要服务端也能访问 Google，两个密钥没填全时自动退回自带验证码',
    type: 'input',
    dependsOn: 'captcha_provider',
    dependsValue: 'GOOGLE'
  },
  {
    key: 'captcha_google_secret_key',
    section: 'basic',
    label: 'Google 服务端密钥 (Secret Key)',
    description: '只保存在服务端用于校验，不会出现在页面上，也不会返回给普通用户',
    type: 'input',
    secret: true,
    dependsOn: 'captcha_provider',
    dependsValue: 'GOOGLE'
  },
  {
    key: 'captcha_cloudflare_site_key',
    section: 'basic',
    label: 'Cloudflare 站点密钥 (Site Key)',
    placeholder: '0x4AAA...',
    description: '在 Cloudflare 控制台的 Turnstile 里添加站点后获得，显示在登录页上。两个密钥没填全时自动退回自带验证码',
    type: 'input',
    dependsOn: 'captcha_provider',
    dependsValue: 'CLOUDFLARE'
  },
  {
    key: 'captcha_cloudflare_secret_key',
    section: 'basic',
    label: 'Cloudflare 服务端密钥 (Secret Key)',
    description: '只保存在服务端用于校验，不会出现在页面上，也不会返回给普通用户',
    type: 'input',
    secret: true,
    dependsOn: 'captcha_provider',
    dependsValue: 'CLOUDFLARE'
  },
  {
    key: 'allow_looking_glass',
    section: 'basic',
    label: '允许 Looking Glass 诊断',
    description: '允许用户使用节点网络诊断功能',
    type: 'switch'
  },
  {
    key: 'allow_private_forward_target',
    section: 'basic',
    label: '允许转发到内网地址',
    description: '开启后普通用户可以把规则转发到内网地址，也可以诊断内网地址。回环和节点自身地址始终不允许，管理员和用户自己的节点不受限',
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
    defaultValue: 'classic_only',
    description: '决定用户端可以使用哪种主题：仅允许其中一种，或两种都允许、默认优先显示其中一种。使用透明主题需要先配置下方的背景图 URL',
    type: 'select',
    options: [
      { label: '仅允许经典主题', value: 'classic_only' },
      { label: '仅允许透明主题', value: 'transparent_only' },
      { label: '优先显示经典主题', value: 'prefer_classic' },
      { label: '优先显示透明主题', value: 'prefer_transparent' }
    ]
  },
  {
    key: 'transparent_theme_landscape_url',
    section: 'basic',
    label: '透明主题背景图 URL （横屏视角）',
    type: 'input'
  },
  {
    key: 'transparent_theme_portrait_url',
    section: 'basic',
    label: '透明主题背景图 URL （竖屏视角）',
    type: 'input'
  },
  {
    key: 'error_log_retention_days',
    section: 'basic',
    label: '报错日志保留天数',
    placeholder: '7',
    description: '队列监控中的报错日志超过该天数后由定时任务自动删除，留空则按 7 天处理',
    type: 'input'
  },
  {
    key: 'node_traffic_reset_day',
    section: 'basic',
    label: '节点流量重置日',
    type: 'dayOfMonth'
  },
  {
    key: 'node_traffic_reset_time',
    section: 'basic',
    label: '节点流量重置时间',
    type: 'time'
  },
  {
    key: 'diagnosis_ping_count',
    section: 'basic',
    label: '诊断连接次数',
    placeholder: '4',
    description: '转发、隧道诊断时每段做几次 TCP 连接（结果卡片里显示的就是这一次的结果），范围 1-30，次数越多耗时越长，留空则按 4 次处理',
    type: 'input'
  },
  {
    key: 'diagnosis_detail_ping_count',
    section: 'basic',
    label: '诊断详情连接次数',
    placeholder: '8',
    description: '在诊断结果里点开某一段的详细结果时，会对这一段重新测试，这里设置重新测试的连接次数，范围 1-30，与上面的「诊断连接次数」分开配置，留空则按 8 次处理',
    type: 'input'
  },
  {
    key: 'site_announcement',
    section: 'announcement',
    label: '站点公告',
    placeholder: '以 < 开头则显示为 HTML',
    description: '显示在所有用户首页的公告内容，以 < 开头时按 HTML 显示（会过滤脚本和表单等不安全的内容），否则按纯文本原样换行显示，留空则不显示',
    type: 'textarea'
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
];

// 初始化时从缓存读取配置，避免闪烁
const getInitialConfigs = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  
  const configKeys = CONFIG_ITEMS.map(item => item.key);
  const initialConfigs: Record<string, string> = {};
  
  try {
    configKeys.forEach(key => {
      const cachedValue = localStorage.getItem('config_' + key);
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
  // 正在保存的分区：只让被点击的保存按钮转圈，其他分区的按钮在此期间仅禁用
  const [savingSection, setSavingSection] = useState<ConfigItem['section'] | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalConfigs, setOriginalConfigs] = useState<Record<string, string>>(initialConfigs);
  const [paymentChannels, setPaymentChannels] = useState<PaymentChannel[]>([]);
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

  const addPaymentChannel = () => {
    setConfiguringChannel({
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      name: '', type: 'epay', enabled: true, payTypes: ['alipay'], config: {}
    });
    onChannelConfigOpen();
  };

  const openChannelConfig = (channel: PaymentChannel) => {
    setConfiguringChannel({ ...channel, payTypes: channel.payTypes ?? ['alipay'], config: { ...channel.config } });
    onChannelConfigOpen();
  };

  const saveChannelConfig = () => {
    if (!configuringChannel) return;
    if (configuringChannel.type === 'epay' && !(configuringChannel.payTypes?.length)) {
      toast.error('请至少选择一种付款方式');
      return;
    }
    const feeRate = configuringChannel.config?.feeRate;
    if (feeRate !== undefined && feeRate !== '' && !(Number(feeRate) >= 0 && Number(feeRate) <= 100)) {
      toast.error('费率需在 0～100 之间');
      return;
    }
    const exists = paymentChannels.some(channel => channel.id === configuringChannel.id);
    updatePaymentChannels(exists
      ? paymentChannels.map(channel => channel.id === configuringChannel.id ? configuringChannel : channel)
      : [...paymentChannels, configuringChannel]
    );
    onChannelConfigClose();
  };

  // 保存配置
  const handleSave = async (section: ConfigItem['section']) => {
    const sectionKeys = CONFIG_ITEMS
      .filter(item => item.section === section && item.type !== 'readonly')
      .map(item => item.key);
    const configsToSave = Object.fromEntries(
      sectionKeys.filter(key => key in configs).map(key => [key, configs[key]])
    );

    if (Object.keys(configsToSave).length === 0) {
      toast('没有可保存的配置');
      return;
    }

    setSavingSection(section);
    try {
      const response = await updateConfigs(configsToSave);
      if (response.code === 0) {
        toast.success('配置保存成功');
        // 选了透明主题（或优先显示透明主题）却没配背景图：透明主题不会生效，明确提示，避免以为是保存失败
        const policyValue = configs.theme_policy;
        if ((policyValue === 'transparent_only' || policyValue === 'prefer_transparent')
          && !(configs.transparent_theme_landscape_url || '').trim() && !(configs.transparent_theme_portrait_url || '').trim()) {
          toast('还没有配置透明主题背景图 URL，透明主题暂时不会生效，将继续显示经典主题', { icon: <ToastWarningIcon />, duration: 6000 });
        }
        
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
        showApiFailure('保存', response);
      }
    } catch (error) {
      showApiFailure('保存', { msg: '请求出错，请重试' });
    } finally {
      setSavingSection(null);
    }
  };



  // 检查配置项是否应该显示（依赖检查）
  const shouldShowItem = (item: ConfigItem): boolean => {
    if (!item.dependsOn || !item.dependsValue) {
      return true;
    }
    // 依赖的配置项自己也被隐藏时（例如验证码关闭后「验证码类型」被隐藏），依赖它的项一并隐藏
    const parent = CONFIG_ITEMS.find(candidate => candidate.key === item.dependsOn);
    if (parent && !shouldShowItem(parent)) {
      return false;
    }
    return (configs[item.dependsOn] || parent?.defaultValue) === item.dependsValue;
  };

  // 渲染不同类型的配置项
  const renderConfigItem = (item: ConfigItem) => {
    const isChanged = hasChanges && configs[item.key] !== originalConfigs[item.key];
    
    switch (item.type) {
      case 'input':
        return (
          <Input autoComplete="off"
            type={item.secret ? 'password' : undefined}
            value={configs[item.key] || ''}
            onChange={(e) => handleConfigChange(item.key, e.target.value)}
            placeholder={item.placeholder}
            variant="bordered"
            size="sm"
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
            aria-label={item.label}
            value={configs[item.key] || ''}
            onChange={(e) => handleConfigChange(item.key, e.target.value)}
            placeholder={item.placeholder}
            variant="bordered"
            size="sm"
            disableAutosize
            rows={4}
            classNames={{
              input: "text-sm resize-y min-h-[5.5rem]",
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
            size="sm"
            aria-label={item.label}
            classNames={{
              wrapper: isChanged ? "border-warning-300" : ""
            }}
          />
        );

      case 'select':
        return (
          <Select
            // 没有配置过、或配置的是旧版本留下的取值（如主题策略原来的 system/light/dark）时，显示为该项的默认选项
            selectedKeys={(() => {
              const current = configs[item.key];
              if (item.options?.some(option => option.value === current)) return [current];
              return item.defaultValue ? [item.defaultValue] : current ? [current] : [];
            })()}
            onSelectionChange={(keys) => {
              const selectedKey = Array.from(keys)[0] as string;
              if (selectedKey) {
                handleConfigChange(item.key, selectedKey);
              }
            }}
            placeholder={`请选择${item.label}`}
            aria-label={item.label}
            variant="bordered"
            size="sm"
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

      case 'time':
        return (
          <Input autoComplete="off"
            type="time"
            value={configs[item.key] || '00:00'}
            onChange={(e) => handleConfigChange(item.key, e.target.value || '00:00')}
            variant="bordered"
            size="sm"
            classNames={{
              input: "text-sm",
              inputWrapper: isChanged
                ? "border-warning-300 data-[hover=true]:border-warning-400"
                : ""
            }}
          />
        );

      case 'dayOfMonth':
        return (
          <DayOfMonthPicker
            value={configs[item.key] || ''}
            onChange={(value) => handleConfigChange(item.key, value)}
            isChanged={isChanged}
          />
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
      <div className="settings-page p-4 lg:p-6 max-w-[1600px] mx-auto space-y-4">
        {CONFIG_SECTIONS.map((section) => {
          const items = CONFIG_ITEMS.filter(item => item.section === section.key && shouldShowItem(item));
          if (items.length === 0) return null;
          const sectionHasChanges = items.some(item => configs[item.key] !== originalConfigs[item.key]);
          // 只有主题策略选了透明主题（「仅允许透明主题」「优先显示透明主题」）时，才显示透明主题背景图 URL 两项；
          // 没配置过或是旧版本留下的取值，按「仅允许经典主题」处理
          const showTransparentUrls = configs.theme_policy === 'transparent_only' || configs.theme_policy === 'prefer_transparent';
          const visibleItems = items.filter(item =>
            item.type !== 'paymentChannels' &&
            (showTransparentUrls || (item.key !== 'transparent_theme_landscape_url' && item.key !== 'transparent_theme_portrait_url'))
          );

          // 一行配置：左边标签（有说明的带问号提示），右边控件；多行文本框独占整行，不显示左侧标签
          const renderRow = (item: ConfigItem) => item.type === 'textarea' ? (
            <div key={item.key} className="py-1">{renderConfigItem(item)}</div>
          ) : (
            <div key={item.key} className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-1.5 items-center py-1.5">
              <div>
                {item.description ? (
                  <HelpTooltip content={item.description}><span className="text-sm font-semibold text-foreground">{item.label}</span></HelpTooltip>
                ) : (
                  <label className="text-sm font-semibold text-foreground">{item.label}</label>
                )}
              </div>
              <div className="w-full">{renderConfigItem(item)}</div>
            </div>
          );

          return (
            <Card key={section.key} className="settings-panel">
              <CardHeader className="px-5 py-4 border-b border-default-100">
                <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
              </CardHeader>
              <CardBody className="px-5 py-4 gap-0">
                {section.key === 'payment' ? (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-1.5 items-center py-1.5">
                      <div><HelpTooltip content="订单金额低于该数值时不允许创建支付订单，单位为元"><span className="text-sm font-semibold text-foreground">最小充值金额</span></HelpTooltip></div>
                      <Input size="sm" autoComplete="off" variant="bordered" value={configs.payment_min_amount || ''} onChange={(event) => handleConfigChange('payment_min_amount', event.target.value)} placeholder="10.00" endContent={<span className="text-sm text-default-500">元</span>} className="w-full" />
                    </div>
                    <div className="flex flex-wrap gap-2 py-2">
                      <Button size="sm" variant="bordered" onPress={addPaymentChannel} startContent={<FileAddOutlined />}>添加支付渠道</Button>
                    </div>
                    <div className="settings-table-scroll">
                        <Table removeWrapper aria-label="支付渠道列表" classNames={{ base: "w-full", th: "management-table-heading", td: "management-table-cell", table: "w-full payment-channel-table" }}>
                          <TableHeader><TableColumn className="w-16">排序</TableColumn><TableColumn className="w-32">类型</TableColumn><TableColumn>名称</TableColumn><TableColumn className="w-28">是否启用</TableColumn><TableColumn align="end" className="w-44 text-right">操作</TableColumn></TableHeader>
                          <TableBody emptyContent={<EmptyState text="暂无支付渠道" />}>
                            {paymentChannels.map((channel, index) => <TableRow key={channel.id}>
                              <TableCell>{index + 1}</TableCell><TableCell>{PAYMENT_TYPES.find(type => type.value === channel.type)?.label}</TableCell><TableCell>{channel.name || '未命名渠道'}</TableCell><TableCell>{channel.enabled ? '启用' : '禁用'}</TableCell>
                              <TableCell><div className="flex justify-end gap-2"><Button size="sm" variant="flat" onPress={() => openChannelConfig(channel)}>编辑</Button><Button size="sm" variant="light" color="danger" onPress={() => updatePaymentChannels(paymentChannels.filter(item => item.id !== channel.id))}>删除</Button></div></TableCell>
                            </TableRow>)}
                          </TableBody>
                        </Table>
                      </div>
                  </>
                ) : (
                  <>
                    {visibleItems.map(renderRow)}
                  </>
                )}
                <div className="flex justify-end pt-3">
                  <Button
                    size="sm"
                    color="primary"
                    onPress={() => handleSave(section.key)}
                    isLoading={savingSection === section.key}
                    isDisabled={!sectionHasChanges || savingSection !== null}
                  >
                    保 存
                  </Button>
                </div>
              </CardBody>
            </Card>
          );
        })}
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

        <Modal isOpen={isChannelConfigOpen} onClose={onChannelConfigClose} size="lg" scrollBehavior="outside" backdrop="opaque" placement="center">
          <ModalContent>
            <ModalHeader>{paymentChannels.some(channel => channel.id === configuringChannel?.id) ? '编辑支付渠道' : '添加支付渠道'}</ModalHeader>
            <ModalBody>
              <div className="space-y-3">
                <Input labelPlacement="outside-top" size="sm" autoComplete="off" label="名称" placeholder="名称不能重复，且不能为空。" value={configuringChannel?.name || ''} onChange={(event) => setConfiguringChannel(channel => channel ? { ...channel, name: event.target.value } : null)} />
                <Select labelPlacement="outside-top" listboxProps={{ emptyContent: <EmptyState compact /> }} size="sm" label="类型" selectedKeys={configuringChannel ? [configuringChannel.type] : []} onSelectionChange={(keys) => setConfiguringChannel(channel => channel ? { ...channel, type: Array.from(keys)[0] as PaymentChannel['type'] } : null)}>
                  {PAYMENT_TYPES.map(type => <SelectItem key={type.value}>{type.value}</SelectItem>)}
                </Select>
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm font-medium text-foreground">启用</span>
                  <Switch isSelected={configuringChannel?.enabled ?? false} onValueChange={(enabled) => setConfiguringChannel(channel => channel ? { ...channel, enabled } : null)} />
                </div>
                {configuringChannel?.type === 'epay' && (
                  <Select labelPlacement="outside-top" size="sm" selectionMode="multiple"
                    label={<HelpTooltip content="用户充值时可选的付款方式，需支付服务商已开通">付款方式</HelpTooltip>}
                    placeholder="请选择付款方式"
                    selectedKeys={new Set(configuringChannel?.payTypes ?? [])}
                    onSelectionChange={(keys) => {
                      const selected = Array.from(keys) as string[];
                      // 按固定顺序保存，商城页按钮顺序稳定
                      const payTypes = EPAY_PAY_TYPES.map(type => type.value).filter(value => selected.includes(value));
                      setConfiguringChannel(channel => channel ? { ...channel, payTypes } : null);
                    }}>
                    {EPAY_PAY_TYPES.map(type => <SelectItem key={type.value}>{type.label}</SelectItem>)}
                  </Select>
                )}
                <Input labelPlacement="outside-top"
                  size="sm" autoComplete="off"
                  label={<HelpTooltip content="支付服务商提供的 API 接口地址">URL</HelpTooltip>}
                  value={configuringChannel?.config?.url || ''}
                  onChange={(event) => setConfiguringChannel(channel => channel ? { ...channel, config: { ...channel.config, url: event.target.value } } : null)}
                />
                <Input labelPlacement="outside-top"
                  size="sm" autoComplete="off"
                  label="PID / 商户号"
                  placeholder="只有部分支付类型需要填写"
                  value={configuringChannel?.config?.pid || ''}
                  onChange={(event) => setConfiguringChannel(channel => channel ? { ...channel, config: { ...channel.config, pid: event.target.value } } : null)}
                />
                <Input labelPlacement="outside-top"
                  size="sm" autoComplete="off"
                  label="Secret / 密钥"
                  type="password"
                  value={configuringChannel?.config?.secret || ''}
                  onChange={(event) => setConfiguringChannel(channel => channel ? { ...channel, config: { ...channel.config, secret: event.target.value } } : null)}
                />
                <Input labelPlacement="outside-top"
                  size="sm" autoComplete="off"
                  label="回调 Host"
                  placeholder="示例：https://xxx.com，留空则使用用户访问的域名"
                  value={configuringChannel?.config?.callbackHost || ''}
                  onChange={(event) => setConfiguringChannel(channel => channel ? { ...channel, config: { ...channel.config, callbackHost: event.target.value } } : null)}
                />
                <Input labelPlacement="outside-top"
                  size="sm" autoComplete="off"
                  label={<HelpTooltip content="用户充值时额外支付的手续费比例，例如 3 表示充值 100 元需付 103 元，钱包到账 100 元">费率</HelpTooltip>}
                  type="number"
                  value={configuringChannel?.config?.feeRate ?? '0.0'}
                  onChange={(event) => setConfiguringChannel(channel => channel ? { ...channel, config: { ...channel.config, feeRate: event.target.value } } : null)}
                  endContent={<span className="text-sm text-default-500">%</span>}
                />
              </div>
            </ModalBody>
            <ModalFooter><Button size="sm" variant="bordered" onPress={onChannelConfigClose}>取消</Button><Button size="sm" color="primary" onPress={saveChannelConfig}>确定</Button></ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    
  );
} 
