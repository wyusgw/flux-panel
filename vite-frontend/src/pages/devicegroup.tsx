import { TipButton } from "@/components/tip-button";
import { CopyOutlined, DisconnectOutlined, EditFilled, InboxOutlined, InfoCircleOutlined, PlusOutlined, SettingOutlined } from "@/components/ant-icons";
import { JsonEditor } from "@/components/json-editor";
import { useState, useEffect, useRef } from "react";
import { ToolbarAddIcon, ToolbarDeleteIcon } from "@/components/toolbar-icons";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Spinner } from "@heroui/spinner";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/table";
import { DropdownMenu, DropdownItem, DropdownSection } from "@heroui/dropdown";
import { HoverDropdown } from "@/components/hover-dropdown";
import { Switch } from "@heroui/switch";
import toast from 'react-hot-toast';
import { copyText } from '@/utils/clipboard';
import { DEFAULT_PORT_END, DEFAULT_PORT_STA, parsePortRange, PORT_RANGE_ERROR } from '@/utils/port-range';

import {
  createDeviceGroup,
  getDeviceGroupList,
  updateDeviceGroup,
  deleteDeviceGroup,
  batchDeleteDeviceGroups,
  reorderDeviceGroups,
  getNodeList,
  createNode,
  updateNode,
  deleteNode,
  getUserGroupList,
  getNodeGroupList,
  getNodeInstallCommand,
  resetNodeSecret
} from "@/api";
import { EditIcon, DeleteIcon } from "@/components/icons";
import { HelpTooltip } from "@/components/help-tooltip";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import RefreshButton from "@/components/refresh-button";

const DeviceSettingIcon = () => <SettingOutlined />;

const KeyIcon = () => <DisconnectOutlined />;

const DragHandleIcon = () => (
  <svg className="w-4 h-4 text-default-400" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
  </svg>
);

const IconCopy = () => (
  <CopyOutlined />
);

interface ChainHopItem {
  hopOrder: number;
  targetDeviceGroupId: number;
  mux: boolean;
  targetName?: string;
  targetNodeName?: string;
}

interface DeviceGroupItem {
  id: number;
  name: string;
  nodeId: number | null;
  nodeName?: string;
  /** 绑定设备的摘要（列表接口返回），status 为 1 表示在线 */
  node?: { status?: number } | null;
  userGroupIds: number[];
  ratio: number;
  hideInProbe: number;
  direction?: 'inbound' | 'outbound' | 'monitor' | 'both' | 'chain';
  protocol?: string;
  remark?: string;
  allowedOutGroupIds?: string | null;
  allowedInGroupIds?: string | null;
  failoverGroupId?: number | null;
  udpSourceInOut?: boolean;
  directForwardMode?: number;
  sort?: number;
  chainHops?: ChainHopItem[];
}

interface NodeItem {
  id: number;
  name: string;
  ip?: string;
  serverIp?: string;
  portSta?: number;
  portEnd?: number;
  http?: number;
  tls?: number;
  socks?: number;
  ss?: number;
  proxy?: string;
  nodeGroupIds?: number[];
}

interface UserGroupItem {
  id: number;
  name: string;
}

interface NodeGroupItem {
  id: number;
  name: string;
}

interface InstallInfo {
  commandAuto: string;
  commandOverseas: string;
  addr: string;
  secret: string;
  offlineCommand: string;
  downloadUrls: { offlineAmd64: string; offlineArm64: string };
}

interface ChainHopForm {
  targetDeviceGroupId: number | null;
  mux: boolean;
}

interface DeviceGroupForm {
  id?: number;
  name: string;
  nodeId: number | null;
  serverIp: string;
  entryIps: string[];
  portSta: number;
  portEnd: number;
  userGroupIds: number[];
  ratio: number;
  hideInProbe: number;
  direction: 'inbound' | 'outbound' | 'monitor' | 'both' | 'chain';
  protocol: string;
  remark: string;
  allowedOutGroupIds: string;
  allowedInGroupIds: string;
  failoverGroupId: number;
  udpSourceInOut: boolean;
  directForwardMode: number;
  chainHops: ChainHopForm[];
  nodeGroupIds: number[];
}

const MAX_CHAIN_HOPS = 3;

// 设备状态小标签（与转发规则列表的标签同一样式）：没有绑定设备显示「无设备」，否则按设备是否在线显示「在线」/「离线」
const DEVICE_TAG_STYLES = {
  success: 'text-success border-success/40 bg-success/10',
  danger: 'text-danger border-danger/40 bg-danger/10',
};
const deviceStatusOf = (group: DeviceGroupItem): { text: string; color: keyof typeof DEVICE_TAG_STYLES } => {
  if (!group.nodeId || !group.node) return { text: '无设备', color: 'danger' };
  return group.node.status === 1 ? { text: '在线', color: 'success' } : { text: '离线', color: 'danger' };
};
const DeviceStatusTag = ({ group }: { group: DeviceGroupItem }) => {
  const status = deviceStatusOf(group);
  return <span className={`inline-flex items-center h-5 px-1.5 rounded border text-xs leading-none whitespace-nowrap ${DEVICE_TAG_STYLES[status.color]}`}>{status.text}</span>;
};

// 入口 IP/域名 存进后端时是逗号拼接的单个字符串（跟转发规则的目标地址是同一套约定），
// 这里负责跟表单里"一行一个输入框"的字符串数组互相转换
const parseEntryIps = (value?: string | null): string[] => {
  const parts = (value || '').split(',').map(s => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [''];
};
const joinEntryIps = (values: string[]): string => values.map(v => v.trim()).filter(Boolean).join(',');

// 限制出口 / 限制入口存进后端是英文逗号分隔的设备组 ID 字符串；下拉框用字符串集合，
// 这里只保留仍存在且类型合适的设备组，已被删除或改了类型的旧 ID 不会显示，重新改动选择后会被去掉
const idListToKeys = (value: string, groups: DeviceGroupItem[], allowed: (g: DeviceGroupItem) => boolean): string[] => {
  const valid = new Set(groups.filter(allowed).map(g => g.id.toString()));
  return value.split(',').map(s => s.trim()).filter(id => id && valid.has(id));
};

const DEFAULT_FORM: DeviceGroupForm = {
  name: '',
  nodeId: null,
  serverIp: '',
  entryIps: [''],
  portSta: 1000,
  portEnd: 65535,
  userGroupIds: [],
  ratio: 1,
  hideInProbe: 0,
  direction: 'inbound',
  protocol: '',
  remark: '',
  allowedOutGroupIds: '',
  allowedInGroupIds: '',
  failoverGroupId: 0,
  udpSourceInOut: false,
  directForwardMode: 1,
  chainHops: [],
  nodeGroupIds: []
};

const ADVANCED_PROTOCOLS = ['tls', 'wss', 'tcp', 'mtls', 'mwss', 'mtcp'];
const ADVANCED_TYPES: DeviceGroupForm['direction'][] = ['inbound', 'outbound', 'monitor', 'both', 'chain'];
const isEntryType = (type: DeviceGroupForm['direction']) => type === 'inbound' || type === 'both';
const isExitType = (type: DeviceGroupForm['direction']) => type === 'outbound' || type === 'both';

/** 高级编辑里该类型可用的字段，与编辑弹窗里该类型显示的选项一一对应 */
const advancedKeysFor = (type: DeviceGroupForm['direction']): string[] => {
  const keys = ['name', 'type', 'user_groups', 'ratio', 'hide_in_probe', 'remark'];
  if (type === 'chain') return [...keys, 'hops'];
  if (type !== 'monitor') keys.push('server_ip', 'entry_ips', 'port_range');
  keys.push('node_groups');
  if (isExitType(type)) keys.push('protocol', 'allowed_in', 'failover');
  if (isEntryType(type)) keys.push('allowed_out', 'direct_forward', 'udp_source_in_out');
  return keys;
};

const csvToIds = (value: string): number[] => value.split(',').map(s => parseInt(s.trim(), 10)).filter(id => Number.isInteger(id) && id > 0);

/** 编辑表单 → 高级编辑的 JSON（只放该类型用得到的字段） */
const formToAdvancedJson = (f: DeviceGroupForm): Record<string, unknown> => {
  const json: Record<string, unknown> = {
    name: f.name,
    type: f.direction,
    user_groups: f.userGroupIds,
    ratio: f.ratio,
    hide_in_probe: f.hideInProbe,
    remark: f.remark,
  };
  if (f.direction === 'chain') {
    json.hops = f.chainHops.map(hop => ({ group: hop.targetDeviceGroupId, mux: hop.mux }));
    return json;
  }
  if (f.direction !== 'monitor') {
    json.server_ip = f.serverIp;
    json.entry_ips = f.entryIps.map(ip => ip.trim()).filter(Boolean);
    json.port_range = `${f.portSta}-${f.portEnd}`;
  }
  json.node_groups = f.nodeGroupIds;
  if (isExitType(f.direction)) {
    json.protocol = f.protocol || 'tls';
    json.allowed_in = csvToIds(f.allowedInGroupIds);
    json.failover = f.failoverGroupId || 0;
  }
  if (isEntryType(f.direction)) {
    json.allowed_out = csvToIds(f.allowedOutGroupIds);
    json.direct_forward = f.directForwardMode;
    json.udp_source_in_out = f.udpSourceInOut;
  }
  return json;
};

/**
 * 校验高级编辑的 JSON，并合并到设备组当前的编辑表单上（没写的字段保持原值）。
 * 链式出口和其它类型之间不能在这里切换（链式出口没有自己的设备），请用编辑
 */
const applyAdvancedJson = (base: DeviceGroupForm, text: string): { form?: DeviceGroupForm; error?: string } => {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { error: `JSON 格式错误：${(error as Error).message}` };
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { error: '应为 JSON 对象' };

  const type = (json.type ?? base.direction) as DeviceGroupForm['direction'];
  if (!ADVANCED_TYPES.includes(type)) return { error: `type 只能是 ${ADVANCED_TYPES.join(' / ')}` };
  if ((type === 'chain') !== (base.direction === 'chain')) return { error: '链式出口和其它类型之间不能在高级编辑里切换，请使用编辑' };
  const allowed = advancedKeysFor(type);
  const unknown = Object.keys(json).filter(key => !allowed.includes(key));
  if (unknown.length > 0) return { error: `不支持的字段：${unknown.join('、')}，可用字段：${allowed.join('、')}` };

  const isIdList = (value: unknown) => Array.isArray(value) && value.every(id => Number.isInteger(id) && (id as number) > 0);
  for (const key of ['user_groups', 'node_groups', 'allowed_in', 'allowed_out']) {
    if (json[key] !== undefined && !isIdList(json[key])) return { error: `${key} 应为设备组 / 用户组 ID 组成的数组，例如 [1, 2]` };
  }
  const f: DeviceGroupForm = { ...base, direction: type };
  if (json.name !== undefined) f.name = String(json.name).trim();
  if (!f.name) return { error: 'name 不能为空' };
  if (json.user_groups !== undefined) f.userGroupIds = json.user_groups;
  if (json.ratio !== undefined) {
    if (typeof json.ratio !== 'number' || json.ratio < 0) return { error: 'ratio 应为不小于 0 的数字' };
    f.ratio = json.ratio;
  }
  if (json.hide_in_probe !== undefined) {
    if (![0, 1, 2].includes(json.hide_in_probe)) return { error: 'hide_in_probe 只能是 0（不隐藏）、1（对非管理员隐藏）、2（对所有用户隐藏）' };
    f.hideInProbe = json.hide_in_probe;
  }
  if (json.remark !== undefined) f.remark = json.remark == null ? '' : String(json.remark);

  if (type === 'chain') {
    if (json.hops !== undefined) {
      if (!Array.isArray(json.hops) || json.hops.some((hop: any) => !hop || typeof hop !== 'object' || !Number.isInteger(hop.group) || hop.group < 1)) {
        return { error: 'hops 应为数组，每一跳形如 {"group": 出口设备组ID, "mux": false}' };
      }
      f.chainHops = json.hops.map((hop: any) => ({ targetDeviceGroupId: hop.group, mux: !!hop.mux }));
    }
    if (f.chainHops.length === 0) return { error: '链式出口至少需要配置 1 跳' };
    if (f.chainHops.length > MAX_CHAIN_HOPS) return { error: `链式出口最多 ${MAX_CHAIN_HOPS} 跳` };
    return { form: f };
  }

  if (json.server_ip !== undefined) f.serverIp = String(json.server_ip).trim();
  if (json.entry_ips !== undefined) {
    const ips = Array.isArray(json.entry_ips) ? json.entry_ips : [json.entry_ips];
    f.entryIps = ips.map((ip: unknown) => String(ip).trim()).filter(Boolean);
    if (f.entryIps.length === 0) f.entryIps = [''];
  }
  if (json.port_range !== undefined) {
    const text = json.port_range == null ? '' : String(json.port_range).trim();
    const parsed = text ? parsePortRange(text) : [DEFAULT_PORT_STA, DEFAULT_PORT_END] as [number, number];
    if (!parsed) return { error: `port_range ${PORT_RANGE_ERROR.replace('端口范围', '')}` };
    [f.portSta, f.portEnd] = parsed;
  }
  if (type !== 'monitor' && !f.serverIp) return { error: 'server_ip 不能为空' };
  if (json.node_groups !== undefined) f.nodeGroupIds = json.node_groups;
  if (json.protocol !== undefined) {
    const protocol = json.protocol == null ? '' : String(json.protocol).trim();
    if (protocol && !ADVANCED_PROTOCOLS.includes(protocol)) return { error: `protocol 只能是 ${ADVANCED_PROTOCOLS.join(' / ')}` };
    f.protocol = protocol;
  }
  if (json.allowed_in !== undefined) f.allowedInGroupIds = json.allowed_in.join(',');
  if (json.allowed_out !== undefined) f.allowedOutGroupIds = json.allowed_out.join(',');
  if (json.failover !== undefined) {
    if (!Number.isInteger(json.failover) || json.failover < 0) return { error: 'failover 应为故障转移设备组 ID，0 表示无' };
    f.failoverGroupId = json.failover;
  }
  if (json.direct_forward !== undefined) {
    if (![0, 1, 2].includes(json.direct_forward)) return { error: 'direct_forward 只能是 0（禁止）、1（可选）、2（强制）' };
    f.directForwardMode = json.direct_forward;
  }
  if (json.udp_source_in_out !== undefined) {
    if (typeof json.udp_source_in_out !== 'boolean') return { error: 'udp_source_in_out 应为 true 或 false' };
    f.udpSourceInOut = json.udp_source_in_out;
  }
  return { form: f };
};

const HIDE_OPTIONS = [
  { key: '0', label: '不隐藏' },
  { key: '1', label: '对非管理员用户隐藏' },
  { key: '2', label: '对所有用户隐藏' }
];

export default function DeviceGroupPage() {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<DeviceGroupItem[]>([]);
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [orphanNodes, setOrphanNodes] = useState<NodeItem[]>([]);
  const [userGroups, setUserGroups] = useState<UserGroupItem[]>([]);
  const [nodeGroups, setNodeGroups] = useState<NodeGroupItem[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  // 新增设备组时，类型选择之前只显示名称、用户组、类型、探针隐藏、备注；选择类型后才显示该类型对应的选项（编辑时始终已有类型）
  const [typeChosen, setTypeChosen] = useState(false);
  const [jsonTarget, setJsonTarget] = useState<DeviceGroupItem | null>(null);
  const [jsonText, setJsonText] = useState('{}');
  const [jsonError, setJsonError] = useState('');
  const [jsonLoading, setJsonLoading] = useState(false);
  const [chainPanelOpen, setChainPanelOpen] = useState(false);
  // 端口范围用单个输入框「起始-结束」填写，这里保存输入框里的原始文字
  const [portRangeText, setPortRangeText] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<DeviceGroupItem | null>(null);
  const [deleteNodeModalOpen, setDeleteNodeModalOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<NodeItem | null>(null);
  const [deleteNodeLoading, setDeleteNodeLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [form, setForm] = useState<DeviceGroupForm>(DEFAULT_FORM);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const [dockLoadingNodeId, setDockLoadingNodeId] = useState<number | null>(null);
  // 对接安装信息按节点缓存：点击对接图标时提前拉取，让后续在下拉菜单里点“复制”能在
  // 同一个点击事件栈里同步执行复制——HTTP 站点降级用的 document.execCommand('copy')
  // 要求紧跟用户操作、中间不能有 await 网络请求，否则会静默失败（仍返回 true，但实际
  // 没有复制到剪贴板），提前取好数据能避开这个坑
  const [installInfoCache, setInstallInfoCache] = useState<Record<number, InstallInfo>>({});
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState<InstallInfo | null>(null);
  const [offlineTitle, setOfflineTitle] = useState('');

  const [advancedModalOpen, setAdvancedModalOpen] = useState(false);
  const [advancedTarget, setAdvancedTarget] = useState<NodeItem | null>(null);
  // 设备设置只改协议屏蔽和代理；节点组在设备组的编辑里设置，这里不提交 nodeGroupIds，后端保持原有归属
  const [advancedForm, setAdvancedForm] = useState<{ http: number; tls: number; socks: number; ss: number; proxy: string }>({ http: 0, tls: 0, socks: 0, ss: 0, proxy: '' });
  const [advancedLoading, setAdvancedLoading] = useState(false);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetTargetId, setResetTargetId] = useState<number | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const [selectedKeys, setSelectedKeys] = useState<any>(new Set([]));
  const [batchDeleteModalOpen, setBatchDeleteModalOpen] = useState(false);
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);
  const draggedGroupIdRef = useRef<number | null>(null);

  // “自动探测线路”当前的国家/地区代码；用于决定复制命令时是否加 CN 加速镜像。
  // 在页面加载时就查一次（而不是点击复制时才查），这样点“复制”时结果已经缓存好，
  // 复制动作能同步执行，避免 execCommand('copy') 因为中间插了一次 await 网络请求而失败
  const [userCountry, setUserCountry] = useState<string | null>(null);

  useEffect(() => {
    // 新建时端口范围默认留空（提交时按默认 1000-65535 处理）；编辑或补全已有设备时显示它当前的范围
    if (modalOpen) setPortRangeText(!isEdit && !form.nodeId ? '' : `${form.portSta}-${form.portEnd}`);
    // 只在弹窗打开时按当前表单初始化输入框文字
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  useEffect(() => {
    loadData();
    fetch('https://ipwho.is/').then(res => res.json()).then(data => {
      if (data?.success && data.country_code) setUserCountry(String(data.country_code).toUpperCase());
    }).catch(() => {});
  }, []);

  const loadData = async (showLoading = true) => {
    setLoading(showLoading);
    try {
      const [groupsRes, nodesRes, userGroupsRes, nodeGroupsRes] = await Promise.all([
        getDeviceGroupList(),
        getNodeList(),
        getUserGroupList(),
        getNodeGroupList()
      ]);

      if (groupsRes.code === 0) {
        setGroups(groupsRes.data || []);
      } else {
        toast.error(groupsRes.msg || '获取设备组失败');
      }

      if (nodesRes.code === 0) {
        const loadedNodes = nodesRes.data || [];
        setNodes(loadedNodes);
        const groupNodeIds = new Set((groupsRes.data || []).map((group: DeviceGroupItem) => group.nodeId));
        setOrphanNodes(loadedNodes.filter((node: NodeItem) => !groupNodeIds.has(node.id)));
      }

      if (userGroupsRes.code === 0) {
        setUserGroups(userGroupsRes.data || []);
      }

      if (nodeGroupsRes.code === 0) {
        setNodeGroups(nodeGroupsRes.data || []);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setIsEdit(false);
    setChainPanelOpen(false);
    setTypeChosen(false);
    setForm(DEFAULT_FORM);
    setErrors({});
    setModalOpen(true);
  };

  // 设备组 → 编辑表单：编辑弹窗和高级编辑共用
  const groupToForm = (group: DeviceGroupItem): DeviceGroupForm => {
    const node = nodes.find(n => n.id === group.nodeId);
    return {
      id: group.id,
      name: group.name,
      nodeId: group.nodeId,
      serverIp: node?.serverIp || '',
      entryIps: parseEntryIps(node?.ip),
      portSta: node?.portSta || 1000,
      portEnd: node?.portEnd || 65535,
      userGroupIds: group.userGroupIds || [],
      ratio: group.ratio,
      hideInProbe: group.hideInProbe,
      direction: group.direction || 'inbound',
      protocol: group.protocol || '',
      remark: group.remark || '',
      allowedOutGroupIds: group.allowedOutGroupIds || '',
      allowedInGroupIds: group.allowedInGroupIds || '',
      failoverGroupId: group.failoverGroupId || 0,
      udpSourceInOut: !!group.udpSourceInOut,
      directForwardMode: group.directForwardMode ?? 1,
      nodeGroupIds: node?.nodeGroupIds || [],
      chainHops: (group.chainHops || [])
        .slice()
        .sort((a, b) => a.hopOrder - b.hopOrder)
        .map(hop => ({ targetDeviceGroupId: hop.targetDeviceGroupId, mux: hop.mux }))
    };
  };

  const handleEdit = (group: DeviceGroupItem) => {
    setIsEdit(true);
    setChainPanelOpen(false);
    setTypeChosen(true);
    setForm(groupToForm(group));
    setErrors({});
    setModalOpen(true);
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    if (!form.name.trim()) newErrors.name = '请输入设备组名称';
    if (!typeChosen) {
      newErrors.direction = '请选择类型';
    } else if (form.direction === 'chain') {
      if (form.chainHops.length === 0) {
        newErrors.chainHops = '链式出口至少需要配置 1 跳';
      } else if (form.chainHops.some(hop => !hop.targetDeviceGroupId)) {
        newErrors.chainHops = '每一跳都必须选择出口设备组';
      }
    } else if (form.direction !== 'monitor') {
      if (!form.serverIp.trim()) newErrors.serverIp = '请输入服务器 IP 或域名';
      if (portRangeText.trim() && !parsePortRange(portRangeText)) newErrors.portRange = PORT_RANGE_ERROR;
    }
    if (form.ratio < 0) newErrors.ratio = '流量倍率不能小于0';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * 把表单保存到后端：链式出口只保存设备组；其它类型先创建 / 更新设备（节点），再保存设备组。
   * 编辑弹窗和高级编辑共用，返回接口结果，提示由调用方显示
   */
  const persistGroupForm = async (f: DeviceGroupForm, editing: boolean): Promise<{ code: number; msg?: string }> => {
    // 链式出口设备组没有自己的物理节点，不需要创建/更新 Node，直接提交设备组本身
    if (f.direction === 'chain') {
      const groupData = {
        id: f.id,
        name: f.name,
        direction: f.direction,
        userGroupIds: f.userGroupIds,
        ratio: f.ratio,
        hideInProbe: f.hideInProbe,
        remark: f.remark,
        chainHops: f.chainHops.map(hop => ({ targetDeviceGroupId: hop.targetDeviceGroupId, mux: hop.mux }))
      };
      return editing ? updateDeviceGroup(groupData) : createDeviceGroup(groupData);
    }

    let nodeId = f.nodeId;
    // 连接地址留空时默认使用服务器地址
    const joinedEntryIp = joinEntryIps(f.entryIps) || f.serverIp.trim();
    const nodeData = { name: f.name, ip: joinedEntryIp, serverIp: f.serverIp, portSta: f.portSta, portEnd: f.portEnd, nodeGroupIds: f.nodeGroupIds };
    if (nodeId) {
      // 编辑已有设备组，或补全一个已存在但尚未建立设备组的节点，都是更新同一个节点记录
      const nodeRes = await updateNode({ id: nodeId, ...nodeData });
      if (nodeRes.code !== 0) return { code: nodeRes.code, msg: nodeRes.msg || '更新设备失败' };
    } else {
      const nodeRes = await createNode(nodeData);
      if (nodeRes.code !== 0) return { code: nodeRes.code, msg: nodeRes.msg || '创建设备失败' };
      nodeId = nodeRes.data?.id ?? null;
      // 兼容旧版后端：创建成功时只返回“节点创建成功”字串。
      if (!nodeId) {
        const listRes = await getNodeList();
        if (listRes.code === 0) {
          const candidates = (listRes.data || []).filter((node: NodeItem) => node.name === f.name && node.ip === joinedEntryIp && node.serverIp === f.serverIp);
          nodeId = candidates.sort((a: NodeItem, b: NodeItem) => b.id - a.id)[0]?.id ?? null;
        }
      }
      if (!nodeId) return { code: -1, msg: '设备已创建，但无法识别其 ID；请刷新后在“未配置设备”中补全配置' };
    }
    const groupData = { ...f, nodeId };
    return editing ? updateDeviceGroup(groupData) : createDeviceGroup(groupData);
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitLoading(true);
    try {
      const res = await persistGroupForm(form, isEdit);
      if (res.code === 0) {
        toast.success(isEdit ? '修改成功' : '创建成功');
        setModalOpen(false);
        loadData();
      } else {
        toast.error(res.msg || '操作失败');
      }
    } catch (error) {
      toast.error('操作失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = (group: DeviceGroupItem) => {
    setGroupToDelete(group);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!groupToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await deleteDeviceGroup(groupToDelete.id);
      if (res.code === 0) {
        toast.success('删除成功');
        setDeleteModalOpen(false);
        loadData();
      } else {
        toast.error(res.msg || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteNode = (node: NodeItem) => {
    setNodeToDelete(node);
    setDeleteNodeModalOpen(true);
  };

  const confirmDeleteNode = async () => {
    if (!nodeToDelete) return;
    setDeleteNodeLoading(true);
    try {
      const res = await deleteNode(nodeToDelete.id);
      if (res.code === 0) {
        toast.success('删除成功');
        setDeleteNodeModalOpen(false);
        loadData();
      } else {
        toast.error(res.msg || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    } finally {
      setDeleteNodeLoading(false);
    }
  };

  const userGroupNames = (ids?: number[]) => {
    if (!ids || ids.length === 0) return '所有用户可见';
    return ids.map(id => userGroups.find(g => g.id === id)?.name || `#${id}`).join('、');
  };

  const handleConfigureOrphan = (node: NodeItem) => {
    setIsEdit(false);
    setTypeChosen(false);
    setForm({ ...DEFAULT_FORM, name: node.name, nodeId: node.id, serverIp: node.serverIp || '', entryIps: parseEntryIps(node.ip), portSta: node.portSta || 1000, portEnd: node.portEnd || 65535, nodeGroupIds: node.nodeGroupIds || [] });
    setErrors({});
    setModalOpen(true);
  };

  const copyToClipboard = async (text: string, successMsg: string) => {
    try {
      const success = await copyText(text);
      if (success) {
        toast.success(successMsg);
      } else {
        toast.error('复制失败，请手动复制');
      }
    } catch (error) {
      toast.error('复制失败，请手动复制');
    }
  };

  const handleViewConfig = (nodeId: number) => {
    window.open(`/nodeConfig?id=${nodeId}`, '_blank');
  };

  // 高级编辑：以 JSON 编辑设备组本身的设置，保存与编辑弹窗走同一套接口，立即生效
  const handleOpenJsonEdit = (group: DeviceGroupItem) => {
    setJsonTarget(group);
    setJsonText(JSON.stringify(formToAdvancedJson(groupToForm(group)), null, 2));
    setJsonError('');
  };

  const submitJsonEdit = async () => {
    if (!jsonTarget) return;
    const { form: next, error } = applyAdvancedJson(groupToForm(jsonTarget), jsonText);
    if (error || !next) {
      setJsonError(error || '保存失败');
      return;
    }
    setJsonLoading(true);
    try {
      const res = await persistGroupForm(next, true);
      if (res.code !== 0) {
        setJsonError(res.msg || '保存失败');
        return;
      }
      toast.success('保存成功');
      setJsonTarget(null);
      loadData(false);
    } catch (error) {
      setJsonError('保存失败');
    } finally {
      setJsonLoading(false);
    }
  };

  const handleAdvancedEdit = (nodeId: number) => {
    const node = nodes.find(n => n.id === nodeId) || orphanNodes.find(n => n.id === nodeId) || null;
    setAdvancedTarget(node);
    setAdvancedForm({ http: node?.http || 0, tls: node?.tls || 0, socks: node?.socks || 0, ss: node?.ss || 0, proxy: node?.proxy || '' });
    setAdvancedModalOpen(true);
  };

  const submitAdvancedEdit = async () => {
    if (!advancedTarget) return;
    setAdvancedLoading(true);
    try {
      const res = await updateNode({
        id: advancedTarget.id,
        name: advancedTarget.name,
        ip: advancedTarget.ip,
        serverIp: advancedTarget.serverIp,
        portSta: advancedTarget.portSta,
        portEnd: advancedTarget.portEnd,
        ...advancedForm
      });
      if (res.code === 0) {
        toast.success('高级配置已保存');
        setAdvancedModalOpen(false);
        loadData();
      } else {
        toast.error(res.msg || '保存失败');
      }
    } catch (error) {
      toast.error('保存失败');
    } finally {
      setAdvancedLoading(false);
    }
  };

  const handleResetSecret = async (nodeId: number) => {
    setResetTargetId(nodeId);
    setResetModalOpen(true);
    if (installInfoCache[nodeId]) return;
    // 当前 Token 只用于提示，取不到时弹窗里不显示这一行
    try {
      const res = await getNodeInstallCommand(nodeId);
      if (res.code === 0) setInstallInfoCache(prev => ({ ...prev, [nodeId]: res.data as InstallInfo }));
    } catch (error) {
      console.warn('获取当前 Token 失败', error);
    }
  };

  const confirmResetSecret = async () => {
    if (!resetTargetId) return;
    setResetLoading(true);
    try {
      const res = await resetNodeSecret(resetTargetId);
      if (res.code === 0) {
        toast.success('Token 已重置，请重新复制安装命令并在节点上重新配置');
        setResetModalOpen(false);
        // 安装命令里带有 Token，重置后旧命令已失效，清掉缓存避免复制出过期命令
        setInstallInfoCache(prev => {
          const next = { ...prev };
          delete next[resetTargetId];
          return next;
        });
      } else {
        toast.error(res.msg || '重置失败');
      }
    } catch (error) {
      toast.error('重置失败');
    } finally {
      setResetLoading(false);
    }
  };

  // 点击对接图标（打开下拉菜单）时提前拉取并缓存，见 installInfoCache 上的注释
  const prefetchInstallInfo = async (nodeId: number) => {
    if (installInfoCache[nodeId]) return;
    try {
      const res = await getNodeInstallCommand(nodeId);
      if (res.code === 0) {
        setInstallInfoCache(prev => ({ ...prev, [nodeId]: res.data as InstallInfo }));
      }
    } catch {
      // 静默失败即可，handleDockAction 里没有命中缓存时会自己重新拉取
    }
  };

  // “自动探测线路”：只有确认是中国大陆网络（userCountry === 'CN'）才用镜像加速，
  // 检测失败/未知时不加镜像——跟安装脚本自身的 COUNTRY 判断逻辑保持一致
  const pickAutoCommand = (info: InstallInfo) => userCountry === 'CN' ? info.commandAuto : info.commandOverseas;

  const handleDockAction = async (nodeId: number, action: string, title: string) => {
    if (action === 'view-config') { handleViewConfig(nodeId); return; }

    const cached = installInfoCache[nodeId];
    if (cached) {
      if (action === 'copy-auto') { copyToClipboard(pickAutoCommand(cached), '已复制在线安装命令（自动探测线路）'); return; }
      if (action === 'copy-overseas') { copyToClipboard(cached.commandOverseas, '已复制在线安装命令（海外主线路）'); return; }
      if (action === 'offline') { setOfflineInfo(cached); setOfflineTitle(title); setOfflineModalOpen(true); return; }
    }

    setDockLoadingNodeId(nodeId);
    try {
      const res = await getNodeInstallCommand(nodeId);
      if (res.code !== 0) { toast.error(res.msg || '获取安装信息失败'); return; }
      const info = res.data as InstallInfo;
      setInstallInfoCache(prev => ({ ...prev, [nodeId]: info }));
      if (action === 'copy-auto') await copyToClipboard(pickAutoCommand(info), '已复制在线安装命令（自动探测线路）');
      else if (action === 'copy-overseas') await copyToClipboard(info.commandOverseas, '已复制在线安装命令（海外主线路）');
      else if (action === 'offline') { setOfflineInfo(info); setOfflineTitle(title); setOfflineModalOpen(true); }
    } catch (error) {
      toast.error('获取安装信息失败');
    } finally {
      setDockLoadingNodeId(null);
    }
  };

  const renderDockMenu = (nodeId: number, title: string) => (
    <HoverDropdown
      onOpen={() => prefetchInstallInfo(nodeId)}
      trigger={<Button size="sm" variant="bordered" className="dialog-btn dock-btn" isLoading={dockLoadingNodeId === nodeId}>对接</Button>}
    >
      <DropdownMenu aria-label="对接操作" className="p-0" itemClasses={{ base: 'gap-2.5 rounded-small px-3 py-1.5', title: 'text-sm font-normal' }} onAction={(key) => handleDockAction(nodeId, key as string, title)}>
        <DropdownSection title={title} classNames={{ base: 'mb-0', heading: 'block border-b-1 border-default-200 px-3 pb-2 pt-1 mb-1 text-sm font-normal text-default-400' }}>
          <DropdownItem key="copy-auto" startContent={<CopyOutlined className="w-3 h-3 flex-shrink-0 text-default-500" />}>复制在线安装命令 (自动探测线路)</DropdownItem>
          <DropdownItem key="copy-overseas" startContent={<CopyOutlined className="w-3 h-3 flex-shrink-0 text-default-500" />}>复制在线安装命令 (海外主线路)</DropdownItem>
          <DropdownItem key="offline" startContent={<InboxOutlined className="w-3 h-3 flex-shrink-0 text-default-500" />}>离线部署</DropdownItem>
          <DropdownItem key="view-config" startContent={<InfoCircleOutlined className="w-3 h-3 flex-shrink-0 text-default-500" />}>查看节点配置（调试用）</DropdownItem>
        </DropdownSection>
      </DropdownMenu>
    </HoverDropdown>
  );

  const handleGroupRowDrop = async (targetId: number) => {
    const draggedId = draggedGroupIdRef.current;
    draggedGroupIdRef.current = null;
    if (draggedId === null || draggedId === targetId) return;

    const fromIndex = groups.findIndex(g => g.id === draggedId);
    const toIndex = groups.findIndex(g => g.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...groups];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setGroups(reordered);

    try {
      const res = await reorderDeviceGroups(reordered.map((g, index) => ({ id: g.id, sort: index })));
      if (res.code !== 0) toast.error(res.msg || '排序保存失败');
    } catch (error) {
      toast.error('排序保存失败');
    }
  };

  const selectedGroupIds = Array.from(selectedKeys === 'all' ? new Set(groups.map(g => `group-${g.id}`)) : (selectedKeys as Set<any>))
    .filter((key: any) => typeof key === 'string' && key.startsWith('group-'))
    .map((key: any) => Number(key.replace('group-', '')));

  const handleBatchDelete = async () => {
    setBatchDeleteLoading(true);
    try {
      const res = await batchDeleteDeviceGroups(selectedGroupIds);
      if (res.code === 0) {
        toast.success('删除成功');
        setBatchDeleteModalOpen(false);
        setSelectedKeys(new Set([]));
        loadData();
      } else {
        toast.error(res.msg || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    } finally {
      setBatchDeleteLoading(false);
    }
  };

  const resetGroup = groups.find(g => g.nodeId === resetTargetId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <Spinner size="sm" />
          <span className="text-default-600">正在加载...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="management-page px-4 lg:px-6 py-5 lg:py-6">
      <Card className="management-table-card max-w-[1600px] mx-auto">
        <CardHeader className="flex-row items-center justify-between gap-4 p-4 border-b border-default-100">
          <h1 className="text-base font-semibold text-foreground">设备管理</h1>
        </CardHeader>
        <CardBody className="p-4 space-y-3">
          {/* 工具列：与转发规则页一致，描边按钮 */}
          <div className="flex flex-wrap items-center gap-3.5">
            <Button size="sm" variant="bordered" startContent={<ToolbarAddIcon />} onPress={handleAdd}>添加设备</Button>
            <Button size="sm" variant="bordered" startContent={<ToolbarDeleteIcon />} isDisabled={selectedGroupIds.length === 0} onPress={() => setBatchDeleteModalOpen(true)}>批量删除{selectedGroupIds.length > 0 ? `（${selectedGroupIds.length}）` : ''}</Button>
            <RefreshButton onRefresh={() => loadData(false)} />
          </div>
          <div><div className="settings-table-scroll"><Table removeWrapper aria-label="设备列表" selectionMode="multiple" selectedKeys={selectedKeys} onSelectionChange={setSelectedKeys} disabledKeys={orphanNodes.map(node => `node-${node.id}`)} classNames={{ base: "w-full", table: "w-full management-table-selectable", th: "management-table-heading", td: "management-table-cell" }}>
          <TableHeader><TableColumn className="w-16">排序</TableColumn><TableColumn>设备 ID</TableColumn><TableColumn>名称</TableColumn><TableColumn>角色</TableColumn><TableColumn>服务器</TableColumn><TableColumn>可见用户组</TableColumn><TableColumn>倍率</TableColumn><TableColumn>备注</TableColumn><TableColumn>操作</TableColumn></TableHeader>
          <TableBody emptyContent={<EmptyState />}>{[
            ...groups.map(group => { const isChainGroup = group.direction === 'chain'; return <TableRow key={`group-${group.id}`} onDragOver={(e: React.DragEvent) => e.preventDefault()} onDrop={() => handleGroupRowDrop(group.id)}><TableCell><span draggable className="cursor-grab active:cursor-grabbing inline-flex" onDragStart={() => { draggedGroupIdRef.current = group.id; }}><DragHandleIcon /></span></TableCell><TableCell>#{group.id}</TableCell><TableCell className="font-medium">{group.name}</TableCell><TableCell>{{ inbound: '入口', outbound: '出口', monitor: '仅监控', both: '入口＋出口', chain: '链式出口' }[group.direction || 'inbound']}</TableCell><TableCell>{isChainGroup ? <span className="text-default-500">{(group.chainHops || []).length} 跳链路</span> : group.nodeName}</TableCell><TableCell>{userGroupNames(group.userGroupIds)}</TableCell><TableCell>{group.ratio}</TableCell><TableCell>{group.remark || '—'}</TableCell><TableCell><div className="flex items-center gap-2">{!isChainGroup && group.nodeId && renderDockMenu(group.nodeId, `${group.name} (#${group.id})`)}{!isChainGroup && group.nodeId && <TipButton isIconOnly size="sm" variant="flat" color="default" onPress={() => handleResetSecret(group.nodeId!)} title="重置 Token"><KeyIcon /></TipButton>}<TipButton isIconOnly size="sm" variant="flat" onPress={() => handleEdit(group)} title="编辑"><EditIcon /></TipButton><TipButton isIconOnly size="sm" variant="flat" onPress={() => handleOpenJsonEdit(group)} title="高级编辑" aria-label="高级编辑"><EditFilled /></TipButton>{!isChainGroup && group.nodeId && <TipButton isIconOnly size="sm" variant="flat" onPress={() => handleAdvancedEdit(group.nodeId!)} title="设备设置" aria-label="设备设置"><DeviceSettingIcon /></TipButton>}<TipButton isIconOnly size="sm" variant="flat" onPress={() => handleDelete(group)} title="删除"><DeleteIcon /></TipButton></div></TableCell></TableRow>; }),
            ...orphanNodes.map(node => <TableRow key={`node-${node.id}`}><TableCell>—</TableCell><TableCell>—</TableCell><TableCell className="font-medium">{node.name}</TableCell><TableCell><span className="text-warning">未配置</span></TableCell><TableCell>{node.serverIp || node.ip || '—'}</TableCell><TableCell>—</TableCell><TableCell>—</TableCell><TableCell>此设备尚未建立设备组</TableCell><TableCell><div className="flex items-center gap-2">{renderDockMenu(node.id, `${node.name} (#${node.id})`)}<TipButton isIconOnly size="sm" variant="flat" color="default" onPress={() => handleResetSecret(node.id)} title="重置 Token"><KeyIcon /></TipButton><TipButton isIconOnly size="sm" variant="flat" onPress={() => handleAdvancedEdit(node.id)} title="设备设置" aria-label="设备设置"><DeviceSettingIcon /></TipButton><TipButton isIconOnly size="sm" variant="flat" onPress={() => handleDeleteNode(node)} title="删除"><DeleteIcon /></TipButton><Button size="sm" color="default" onPress={() => handleConfigureOrphan(node)}>补全配置</Button></div></TableCell></TableRow>)
          ]}</TableBody>
        </Table></div></div></CardBody>
      </Card>

      <Modal isOpen={modalOpen} onOpenChange={setModalOpen} size="sm" scrollBehavior="outside" backdrop="opaque" placement="center" hideCloseButton classNames={{ base: "max-w-[416px]" }}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{isEdit ? '编辑设备组' : '添加设备组'}</ModalHeader>
              <ModalBody className="py-0">
                <div className="dialog-form space-y-3">
                  <Input labelPlacement="outside-top"
                    size="sm" autoComplete="off"
                    label="名称"
                    value={form.name}
                    onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                    isInvalid={!!errors.name}
                    errorMessage={errors.name}
                    variant="bordered"
                  />

                  <Select listboxProps={{ emptyContent: <EmptyState compact /> }} labelPlacement="outside-top"
                    size="sm"
                    selectionMode="multiple"
                    label={<HelpTooltip content="仅所选用户组的用户可在添加转发规则时看到此设备组；一个设备组可以同时对多个用户组可见">用户组</HelpTooltip>}
                    placeholder="留空表示所有用户可见"
                    selectedKeys={new Set(form.userGroupIds.map(String))}
                    onSelectionChange={(keys) => {
                      const ids = Array.from(keys as Set<string>).map(Number);
                      setForm(prev => ({ ...prev, userGroupIds: ids }));
                    }}
                    variant="bordered"
                  >
                    {userGroups.map(group => (
                      <SelectItem key={group.id.toString()}>{group.name || `#${group.id}`}</SelectItem>
                    ))}
                  </Select>

                  {typeChosen && form.direction !== 'monitor' && (
                    <Input labelPlacement="outside-top"
                      size="sm" autoComplete="off"
                      label="倍率"
                      type="number"
                      value={form.ratio.toString()}
                      onChange={(e) => setForm(prev => ({ ...prev, ratio: parseFloat(e.target.value) || 0 }))}
                      isInvalid={!!errors.ratio}
                      errorMessage={errors.ratio}
                      variant="bordered"
                      classNames={{ inputWrapper: 'pr-0 overflow-hidden' }}
                      endContent={<span className="flex h-full items-center border-l-1 border-default-300 bg-default-100 px-3 text-xs font-semibold text-foreground">倍</span>}
                    />
                  )}

                  <Select listboxProps={{ emptyContent: <EmptyState compact /> }} labelPlacement="outside-top"
                    size="sm"
                    label={<HelpTooltip content="监控设备仅用于观测；入口＋出口可同时用于两种转发角色；链式出口不绑定自己的物理设备，而是把多个已有的出口设备组串成一条多跳链路">类型</HelpTooltip>}
                    isInvalid={!!errors.direction}
                    errorMessage={errors.direction}
                    selectedKeys={typeChosen ? [form.direction] : []}
                    onSelectionChange={(keys) => {
                      const selectedKey = Array.from(keys)[0] as DeviceGroupForm['direction'];
                      if (!selectedKey) return;
                      setTypeChosen(true);
                      setForm(prev => ({ ...prev, direction: selectedKey }));
                    }}
                    variant="bordered"
                  >
                    <SelectItem key="monitor">仅监控</SelectItem>
                    <SelectItem key="inbound">入口</SelectItem>
                    <SelectItem key="outbound">出口</SelectItem>
                    <SelectItem key="both">入口＋出口</SelectItem>
                    <SelectItem key="chain">链式出口</SelectItem>
                  </Select>

                  {typeChosen && (form.direction === 'inbound' || form.direction === 'both') && (
                    <Select listboxProps={{ emptyContent: <EmptyState compact /> }} labelPlacement="outside-top"
                      size="sm"
                      selectionMode="multiple"
                      label={<HelpTooltip content="选填，允许使用的「出口」设备组。设置后，用户选择本入口时，未允许使用的出口将不会出现在出口选项中；留空表示不限制">限制出口</HelpTooltip>}
                      placeholder="留空则不限制"
                      selectedKeys={new Set(idListToKeys(form.allowedOutGroupIds, groups, g => (g.direction === 'outbound' || g.direction === 'both' || g.direction === 'chain') && g.id !== form.id))}
                      onSelectionChange={(keys) => setForm(prev => ({ ...prev, allowedOutGroupIds: Array.from(keys as Set<string>).join(',') }))}
                      variant="bordered"
                    >
                      {groups.filter(g => (g.direction === 'outbound' || g.direction === 'both' || g.direction === 'chain') && g.id !== form.id).map(g => (
                        <SelectItem key={g.id.toString()} textValue={`${g.name} (#${g.id})`}>{`${g.name} (#${g.id})`}</SelectItem>
                      ))}
                    </Select>
                  )}

                  {typeChosen && (form.direction === 'outbound' || form.direction === 'both') && (
                    <Select listboxProps={{ emptyContent: <EmptyState compact /> }} labelPlacement="outside-top"
                      size="sm"
                      selectionMode="multiple"
                      label={<HelpTooltip content="选填，允许使用的「入口」设备组。设置后，用户选择某个入口时，若本出口不允许使用，则不会出现在出口选项中；留空表示不限制">限制入口</HelpTooltip>}
                      placeholder="留空则不限制"
                      selectedKeys={new Set(idListToKeys(form.allowedInGroupIds, groups, g => (g.direction === 'inbound' || g.direction === 'both') && g.id !== form.id))}
                      onSelectionChange={(keys) => setForm(prev => ({ ...prev, allowedInGroupIds: Array.from(keys as Set<string>).join(',') }))}
                      variant="bordered"
                    >
                      {groups.filter(g => (g.direction === 'inbound' || g.direction === 'both') && g.id !== form.id).map(g => (
                        <SelectItem key={g.id.toString()} textValue={`${g.name} (#${g.id})`}>{`${g.name} (#${g.id})`}</SelectItem>
                      ))}
                    </Select>
                  )}

                  {/* 选择类型之后才显示该类型对应的选项 */}
                  {typeChosen && (
                    <>
                  {form.direction !== 'chain' && (
                    <>
                      {form.direction !== 'monitor' && (
                        <>
                      <Input labelPlacement="outside-top" size="sm" autoComplete="off" label="服务器 IP / 域名" placeholder="例如：203.0.113.10 或 node.example.com" value={form.serverIp} onChange={(e) => setForm(prev => ({ ...prev, serverIp: e.target.value }))} isInvalid={!!errors.serverIp} errorMessage={errors.serverIp} variant="bordered" />

                      <Textarea labelPlacement="outside-top" size="sm" autoComplete="off" variant="bordered" disableAutosize rows={3}
                        label={<HelpTooltip content="用户连接使用的 IP 或域名，一行一个，数量不限；留空时默认使用服务器 IP / 域名">连接地址</HelpTooltip>}
                        placeholder="留空默认使用服务器 IP / 域名"
                        value={form.entryIps.join('\n')}
                        onChange={(e) => setForm(prev => ({ ...prev, entryIps: e.target.value.split('\n') }))}
                        classNames={{ input: 'resize-y min-h-[4.5rem]' }}
                      />

                      <Input
                        labelPlacement="outside-top" size="sm" autoComplete="off"
                        label={<HelpTooltip content="该设备可分配给转发规则使用的监听端口范围，用 - 连接起止端口，例如 2000-65535；留空时使用默认的 1000-65535">端口范围</HelpTooltip>}
                        placeholder="1000-65535"
                        value={portRangeText}
                        onChange={(e) => {
                          const text = e.target.value;
                          setPortRangeText(text);
                          // 输入形如「起始-结束」时同步到表单；格式不对时保留文字，提交校验时再提示
                          const parsed = parsePortRange(text);
                          if (parsed) setForm(prev => ({ ...prev, portSta: parsed[0], portEnd: parsed[1] }));
                          else if (!text.trim()) setForm(prev => ({ ...prev, portSta: DEFAULT_FORM.portSta, portEnd: DEFAULT_FORM.portEnd }));
                        }}
                        isInvalid={!!errors.portRange}
                        errorMessage={errors.portRange}
                        variant="bordered"
                      />
                        </>
                      )}

                      <Select listboxProps={{ emptyContent: <EmptyState compact /> }} labelPlacement="outside-top"
                        size="sm"
                        selectionMode="multiple"
                        label={<HelpTooltip content="该节点所属的节点组，一个节点可以同时属于多个节点组。用户组设置了「可用节点组」时，该组用户只能使用节点在这些节点组里的设备组；节点状态页也按节点组分类显示">节点组</HelpTooltip>}
                        placeholder="未归属任何节点组"
                        selectedKeys={new Set(form.nodeGroupIds.map(String))}
                        onSelectionChange={(keys) => {
                          const ids = Array.from(keys as Set<string>).map(Number);
                          setForm(prev => ({ ...prev, nodeGroupIds: ids }));
                        }}
                        variant="bordered"
                      >
                        {nodeGroups.map(group => (
                          <SelectItem key={group.id.toString()}>{group.name || `#${group.id}`}</SelectItem>
                        ))}
                      </Select>

                      {(form.direction === 'outbound' || form.direction === 'both') && (
                        <Select listboxProps={{ emptyContent: <EmptyState compact /> }} labelPlacement="outside-top"
                          size="sm"
                          label={<HelpTooltip content="该出口设备组作为隧道转发出口节点时使用的传输协议；不选择时按 TLS 处理">协议</HelpTooltip>}
                          selectedKeys={form.protocol ? [form.protocol] : []}
                          onSelectionChange={(keys) => {
                            const selectedKey = Array.from(keys)[0] as string | undefined;
                            setForm(prev => ({ ...prev, protocol: selectedKey || '' }));
                          }}
                          variant="bordered"
                        >
                          <SelectItem key="tls">TLS</SelectItem>
                          <SelectItem key="wss">WSS</SelectItem>
                          <SelectItem key="tcp">TCP</SelectItem>
                          <SelectItem key="mtls">MTLS</SelectItem>
                          <SelectItem key="mwss">MWSS</SelectItem>
                          <SelectItem key="mtcp">MTCP</SelectItem>
                        </Select>
                      )}
                    </>
                  )}

                    </>
                  )}



                  {typeChosen && (form.direction === 'outbound' || form.direction === 'both') && (
                    <Select listboxProps={{ emptyContent: <EmptyState compact /> }} labelPlacement="outside-top"
                      size="sm"
                      label="故障转移组"
                      disallowEmptySelection
                      selectedKeys={[(form.failoverGroupId || 0).toString()]}
                      onSelectionChange={(keys) => {
                        const selectedKey = Array.from(keys)[0] as string;
                        if (selectedKey !== undefined) setForm(prev => ({ ...prev, failoverGroupId: parseInt(selectedKey) || 0 }));
                      }}
                      variant="bordered"
                    >
                      {[
                        <SelectItem key="0" textValue="无 (#0)">无 (#0)</SelectItem>,
                        ...groups
                          .filter(g => (g.direction === 'outbound' || g.direction === 'both') && g.id !== form.id)
                          .map(g => <SelectItem key={g.id.toString()} textValue={`${g.name} (#${g.id})`}>{`${g.name} (#${g.id})`}</SelectItem>)
                      ]}
                    </Select>
                  )}

                  {typeChosen && (form.direction === 'inbound' || form.direction === 'both') && (
                    <div className="flex items-center gap-3">
                      <span className="whitespace-nowrap text-sm font-semibold text-foreground">
                        <HelpTooltip content="直接转发 / 入口直出策略无需出口节点，不使用隧道，而是由入口直接转发。适用于入口机器可以直接访问国际互联网的情景。禁止：转发规则必须选择出口；可选：出口可选可不选（默认）；强制：只能直接转发，不能选择出口。修改后不影响已创建的转发规则，编辑这些规则时才会按新策略校验">直接转发 / 入口直出策略</HelpTooltip>
                      </span>
                      <Select listboxProps={{ emptyContent: <EmptyState compact /> }}
                        size="sm"
                        aria-label="直接转发 / 入口直出策略"
                        className="flex-1"
                        disallowEmptySelection
                        selectedKeys={[form.directForwardMode.toString()]}
                        onSelectionChange={(keys) => {
                          const selectedKey = Array.from(keys)[0] as string;
                          if (selectedKey) setForm(prev => ({ ...prev, directForwardMode: parseInt(selectedKey) }));
                        }}
                        variant="bordered"
                      >
                        <SelectItem key="0">禁止直接转发</SelectItem>
                        <SelectItem key="1">可选直接转发</SelectItem>
                        <SelectItem key="2">强制直接转发</SelectItem>
                      </Select>
                    </div>
                  )}

                  {typeChosen && (form.direction === 'inbound' || form.direction === 'both') && (
                    <div className="flex items-center gap-3">
                      <span className="whitespace-nowrap text-sm font-semibold text-foreground">
                        <HelpTooltip content="通过监听每个网卡的 IP 地址实现 UDP 源进源出。双 IP 的机器且对 UDP 有需求的，建议打开。需要节点版本 1.2.7 及以上；修改后，已有的转发规则需要重新保存或重启后才会生效">UDP 智能绑定 (源进源出)</HelpTooltip>
                      </span>
                      <Switch size="sm" aria-label="UDP 智能绑定 (源进源出)" isSelected={form.udpSourceInOut} onValueChange={(v) => setForm(prev => ({ ...prev, udpSourceInOut: v }))} />
                    </div>
                  )}

                  {form.direction !== 'chain' && (
                    <div className="flex items-center gap-3">
                      <span className="whitespace-nowrap text-sm font-semibold text-foreground">在探针中隐藏</span>
                  <Select listboxProps={{ emptyContent: <EmptyState compact /> }}
                    size="sm"
                    aria-label="在探针中隐藏"
                    className="flex-1"
                    selectedKeys={[form.hideInProbe.toString()]}
                    onSelectionChange={(keys) => {
                      const selectedKey = Array.from(keys)[0] as string;
                      setForm(prev => ({ ...prev, hideInProbe: parseInt(selectedKey) }));
                    }}
                    variant="bordered"
                  >
                    {HIDE_OPTIONS.map(opt => (
                      <SelectItem key={opt.key}>{opt.label}</SelectItem>
                    ))}
                  </Select>
                    </div>
                  )}

                  <Textarea labelPlacement="outside-top"
                    size="sm" autoComplete="off"
                    label="备注 (仅管理员可见)"
                    value={form.remark}
                    onChange={(e) => setForm(prev => ({ ...prev, remark: e.target.value }))}
                    variant="bordered"
                    disableAutosize
                    rows={3}
                    classNames={{ input: 'resize-y min-h-[4.5rem]' }}
                  />

                  {typeChosen && form.direction === 'chain' && (chainPanelOpen || form.chainHops.length > 0 || !!errors.chainHops ? (
                    <div className="rounded-small border-1 border-foreground/80">
                      <div className="border-b-1 border-default-200 px-3 py-2 text-sm font-semibold text-foreground">链式出口配置</div>
                      <div className="space-y-3 p-3">
                        <p className="text-xs text-default-500">流量依次经过每一跳，最后一跳连到目标地址；修改跳数后，已在使用的转发规则重新保存才会按新配置部署。</p>
                        {errors.chainHops && <p className="text-xs text-danger">{errors.chainHops}</p>}
                        {form.chainHops.length === 0 && (
                          <p className="text-sm text-default-600">当前没有配置任何出口链，请点击“添加跳数”按钮。</p>
                        )}
                        {form.chainHops.map((hop, index) => (
                          <div key={index} className="space-y-2 pb-3 border-b border-dashed border-default-200 last:border-b-0 last:pb-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-foreground">
                                第 {index + 1} 跳：
                                {index < form.chainHops.length - 1 ? ` ${index + 1} → ${index + 2}` : '（最后一跳）'}
                              </span>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-default-500">Mux</span>
                                  <Switch size="sm" isSelected={hop.mux} onValueChange={(v) => setForm(prev => ({ ...prev, chainHops: prev.chainHops.map((h, i) => i === index ? { ...h, mux: v } : h) }))} />
                                </div>
                                <TipButton isIconOnly size="sm" variant="light" onPress={() => setForm(prev => ({ ...prev, chainHops: prev.chainHops.filter((_, i) => i !== index) }))} title="删除这一跳">
                                  <DeleteIcon />
                                </TipButton>
                              </div>
                            </div>
                            <Select listboxProps={{ emptyContent: <EmptyState compact /> }} size="sm" aria-label={`第 ${index + 1} 跳出口`} placeholder="请选择出口" variant="bordered"
                              selectedKeys={hop.targetDeviceGroupId ? [hop.targetDeviceGroupId.toString()] : []}
                              onSelectionChange={(keys) => {
                                const selectedKey = Array.from(keys)[0] as string;
                                setForm(prev => ({ ...prev, chainHops: prev.chainHops.map((h, i) => i === index ? { ...h, targetDeviceGroupId: selectedKey ? parseInt(selectedKey) : null } : h) }));
                              }}
                              renderValue={(items) => items.map((item) => <div key={item.key}>{item.rendered}</div>)}
                            >
                              {/* 每个出口后面显示它的设备是否在线（与添加规则的出口下拉一致），方便避开离线的设备 */}
                              {groups.filter(g => g.direction === 'outbound').map(g => (
                                <SelectItem key={g.id.toString()} textValue={g.name}>
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate">{g.name}</span>
                                    <DeviceStatusTag group={g} />
                                  </div>
                                </SelectItem>
                              ))}
                            </Select>
                          </div>
                        ))}
                        <Button size="sm" variant="bordered" startContent={<PlusOutlined />} className="w-full border-1 border-dashed border-default-300 text-sm font-normal"
                          isDisabled={form.chainHops.length >= MAX_CHAIN_HOPS}
                          onPress={() => setForm(prev => ({ ...prev, chainHops: [...prev.chainHops, { targetDeviceGroupId: null, mux: false }] }))}
                        >
                          添加跳数 ({form.chainHops.length} / {MAX_CHAIN_HOPS})
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="bordered" className="border-1 border-default-300 text-sm font-normal" onPress={() => setChainPanelOpen(true)}>打开链式出口配置</Button>
                  ))}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button size="sm" variant="bordered" className="dialog-btn" onPress={onClose}>取消</Button>
                <Button size="sm" color="primary" className="dialog-btn" onPress={handleSubmit} isLoading={submitLoading}>确定</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <ConfirmDialog
        isOpen={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="删除设备组"
        message={<>你确定要删除设备组 {groupToDelete?.name} (#{groupToDelete?.id}) 吗？</>}
        confirmText="确定"
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />

      {/* 高级编辑：保存设备组的 JSON 配置 */}
      <Modal isOpen={jsonTarget !== null} onOpenChange={(open) => { if (!open) setJsonTarget(null); }} size="lg" scrollBehavior="outside" backdrop="opaque" placement="center" hideCloseButton classNames={{ base: "max-w-[520px]" }}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{jsonTarget?.name} (#{jsonTarget?.id})</ModalHeader>
              <ModalBody className="py-0">
                <JsonEditor ariaLabel="设备组 JSON 配置" value={jsonText} onChange={(value) => { setJsonText(value); setJsonError(''); }} />
                {jsonError && <p className="break-words text-xs text-danger">{jsonError}</p>}
              </ModalBody>
              <ModalFooter>
                <Button size="sm" variant="bordered" className="dialog-btn" onPress={onClose}>取消</Button>
                <Button size="sm" color="primary" className="dialog-btn" isLoading={jsonLoading} onPress={submitJsonEdit}>确定</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal isOpen={offlineModalOpen} onOpenChange={setOfflineModalOpen} size="lg" scrollBehavior="outside" backdrop="opaque" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center gap-2">
                <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="11" fill="#6f9bff" />
                  <circle cx="12" cy="7.4" r="1.5" fill="#15161a" />
                  <rect x="10.7" y="10.2" width="2.6" height="7.6" rx="1.3" fill="#15161a" />
                </svg>
                <h2 className="text-lg font-semibold">离线部署</h2>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4 text-sm">
                  <div className="space-y-2">
                    <div className="text-default-600">请按机器的架构下载合适的包：</div>
                    <div className="flex flex-col gap-1">
                      <a className="text-primary underline break-all" href={offlineInfo?.downloadUrls.offlineAmd64} target="_blank" rel="noopener noreferrer">flux-panel-offline-amd64.zip（x86_64）</a>
                      <a className="text-primary underline break-all" href={offlineInfo?.downloadUrls.offlineArm64} target="_blank" rel="noopener noreferrer">flux-panel-offline-arm64.zip（aarch64）</a>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1 border-t border-default-100">
                    <div className="text-default-600 pt-3">『{offlineTitle}』的离线对接命令：</div>
                    <div className="relative bg-default-100 dark:bg-content2 rounded-lg p-3 pr-10">
                      <code className="block font-mono text-xs whitespace-pre-wrap break-all text-foreground">{offlineInfo?.offlineCommand}</code>
                      <button
                        type="button"
                        className="absolute right-2 top-2 text-default-400 hover:text-foreground"
                        title="复制命令"
                        onClick={() => offlineInfo && copyToClipboard(offlineInfo.offlineCommand, '已复制离线对接命令')}
                      >
                        <IconCopy />
                      </button>
                    </div>
                  </div>

                  <p className="text-default-500 text-xs leading-relaxed">
                    使用方法：上传离线包到【无法在线对接的机器】并重命名为 offline.zip。然后 cd 切换到【离线包所在目录】运行以上命令。
                  </p>
                  <p className="text-default-400 text-xs">提示：离线安装依赖 unzip 命令，请自行安装。</p>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="primary" onPress={onClose}>知道了</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 设备设置：与添加设备组弹窗同一样式（紧凑宽度、无右上角关闭、标签加粗、32px 细边框控件、取消 / 确定带字距） */}
      <Modal isOpen={advancedModalOpen} onOpenChange={setAdvancedModalOpen} size="sm" scrollBehavior="outside" backdrop="opaque" placement="center" hideCloseButton classNames={{ base: "max-w-[416px]" }}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>设备设置 {advancedTarget ? `${advancedTarget.name} (#${advancedTarget.id})` : ''}</ModalHeader>
              <ModalBody className="py-0">
                <div className="dialog-form space-y-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      <HelpTooltip content="开启开关后，该设备屏蔽对应协议">屏蔽协议</HelpTooltip>
                    </div>
                    <div className="mt-1">
                      {([
                        { key: 'http', label: 'HTTP' },
                        { key: 'tls', label: 'TLS' },
                        { key: 'socks', label: 'SOCKS' },
                        { key: 'ss', label: 'Shadowsocks', tip: 'Shadowsocks 没有固定特征，只能按「首包像随机数据」判断：同时会拦截 VMess 等其他全加密协议，也可能误伤传输压缩或加密数据的普通 TCP 业务；UDP 流量不检测。需要节点版本 1.2.5 及以上且在线' },
                      ] as const).map(({ key, label, ...rest }) => (
                        <div key={key} className="flex items-center justify-between py-1.5">
                          <span className="text-sm text-foreground">{'tip' in rest ? <HelpTooltip content={rest.tip}>{label}</HelpTooltip> : label}</span>
                          <Switch size="sm" aria-label={`屏蔽 ${label}`} isSelected={advancedForm[key] === 1} onValueChange={(v) => setAdvancedForm(prev => ({ ...prev, [key]: v ? 1 : 0 }))} />
                        </div>
                      ))}
                    </div>
                  </div>

                  <Input labelPlacement="outside-top" size="sm" autoComplete="off" variant="bordered"
                    label={<HelpTooltip content="节点连接面板使用的 SOCKS5 或 SSH 代理，留空表示直连">代理</HelpTooltip>}
                    placeholder="socks5://用户名:密码@主机:端口 或 ssh://用户名:密码@主机:端口"
                    value={advancedForm.proxy}
                    onChange={(e) => setAdvancedForm(prev => ({ ...prev, proxy: e.target.value }))}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button size="sm" variant="bordered" className="dialog-btn" onPress={onClose}>取消</Button>
                <Button size="sm" color="primary" className="dialog-btn" onPress={submitAdvancedEdit} isLoading={advancedLoading}>确定</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <ConfirmDialog
        isOpen={resetModalOpen}
        onOpenChange={setResetModalOpen}
        title="重置 token"
        message={<>
          <p>{resetGroup ? <>你确定要重置设备组 {resetGroup.name} (#{resetGroup.id}) 的 token 吗？</> : <>你确定要重置设备 {[...nodes, ...orphanNodes].find(n => n.id === resetTargetId)?.name} (#{resetTargetId}) 的 token 吗？</>}</p>
          <p>重置后，一定要卸载节点端，用新的命令重新对接，机器才会上线。</p>
          {resetTargetId !== null && installInfoCache[resetTargetId]?.secret && <p className="break-all">当前token: {installInfoCache[resetTargetId].secret}</p>}
        </>}
        confirmText="确定"
        onConfirm={confirmResetSecret}
        loading={resetLoading}
      />

      <ConfirmDialog
        isOpen={batchDeleteModalOpen}
        onOpenChange={setBatchDeleteModalOpen}
        title="删除设备"
        message={<>你确定要删除选中的 {selectedGroupIds.length} 个设备吗？</>}
        confirmText="确定"
        onConfirm={handleBatchDelete}
        loading={batchDeleteLoading}
      />

      <ConfirmDialog
        isOpen={deleteNodeModalOpen}
        onOpenChange={setDeleteNodeModalOpen}
        title="删除设备"
        message={<>你确定要删除设备 {nodeToDelete?.name} (#{nodeToDelete?.id}) 吗？</>}
        confirmText="确定"
        onConfirm={confirmDeleteNode}
        loading={deleteNodeLoading}
      />
    </div>
  );
}
