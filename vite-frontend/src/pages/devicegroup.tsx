import { useState, useEffect, useRef } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Spinner } from "@heroui/spinner";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/table";
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownSection } from "@heroui/dropdown";
import { Switch } from "@heroui/switch";
import toast from 'react-hot-toast';
import { copyText } from '@/utils/clipboard';

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
import { EditIcon, DeleteIcon, SettingsIcon } from "@/components/icons";
import { HelpTooltip } from "@/components/help-tooltip";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";

const DockIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-2.828 2.828a4 4 0 11-5.656-5.656l1.414-1.414M10.172 13.828a4 4 0 010-5.656l2.828-2.828a4 4 0 115.656 5.656l-1.414 1.414" />
  </svg>
);

const KeyIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1121 9z" />
  </svg>
);

const DragHandleIcon = () => (
  <svg className="w-4 h-4 text-default-400" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
  </svg>
);

const IconCopy = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" />
  </svg>
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
  userGroupIds: number[];
  ratio: number;
  hideInProbe: number;
  direction?: 'inbound' | 'outbound' | 'monitor' | 'both' | 'chain';
  protocol?: string;
  remark?: string;
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
  chainHops: ChainHopForm[];
  nodeGroupIds: number[];
}

const MAX_CHAIN_HOPS = 3;
const MAX_ENTRY_IPS = 5;

// 入口 IP/域名 存进后端时是逗号拼接的单个字符串（跟转发规则的目标地址是同一套约定），
// 这里负责跟表单里"一行一个输入框"的字符串数组互相转换
const parseEntryIps = (value?: string | null): string[] => {
  const parts = (value || '').split(',').map(s => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [''];
};
const joinEntryIps = (values: string[]): string => values.map(v => v.trim()).filter(Boolean).join(',');

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
  protocol: 'tls',
  remark: '',
  chainHops: [],
  nodeGroupIds: []
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
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configTarget, setConfigTarget] = useState<{ node: NodeItem | null; group: DeviceGroupItem | null }>({ node: null, group: null });
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState<InstallInfo | null>(null);
  const [offlineTitle, setOfflineTitle] = useState('');

  const [advancedModalOpen, setAdvancedModalOpen] = useState(false);
  const [advancedTarget, setAdvancedTarget] = useState<NodeItem | null>(null);
  const [advancedForm, setAdvancedForm] = useState<{ http: number; tls: number; socks: number; nodeGroupIds: number[] }>({ http: 0, tls: 0, socks: 0, nodeGroupIds: [] });
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
    loadData();
    fetch('https://ipwho.is/').then(res => res.json()).then(data => {
      if (data?.success && data.country_code) setUserCountry(String(data.country_code).toUpperCase());
    }).catch(() => {});
  }, []);

  const loadData = async () => {
    setLoading(true);
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
    setForm(DEFAULT_FORM);
    setErrors({});
    setModalOpen(true);
  };

  const handleEdit = (group: DeviceGroupItem) => {
    setIsEdit(true);
    setForm({
      id: group.id,
      name: group.name,
      nodeId: group.nodeId,
      serverIp: nodes.find(node => node.id === group.nodeId)?.serverIp || '',
      entryIps: parseEntryIps(nodes.find(node => node.id === group.nodeId)?.ip),
      portSta: nodes.find(node => node.id === group.nodeId)?.portSta || 1000,
      portEnd: nodes.find(node => node.id === group.nodeId)?.portEnd || 65535,
      userGroupIds: group.userGroupIds || [],
      ratio: group.ratio,
      hideInProbe: group.hideInProbe,
      direction: group.direction || 'inbound',
      protocol: group.protocol || 'tls',
      remark: group.remark || '',
      nodeGroupIds: nodes.find(node => node.id === group.nodeId)?.nodeGroupIds || [],
      chainHops: (group.chainHops || [])
        .slice()
        .sort((a, b) => a.hopOrder - b.hopOrder)
        .map(hop => ({ targetDeviceGroupId: hop.targetDeviceGroupId, mux: hop.mux }))
    });
    setErrors({});
    setModalOpen(true);
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    if (!form.name.trim()) newErrors.name = '请输入设备组名称';
    if (form.direction === 'chain') {
      if (form.chainHops.length === 0) {
        newErrors.chainHops = '链式出口至少需要配置 1 跳';
      } else if (form.chainHops.some(hop => !hop.targetDeviceGroupId)) {
        newErrors.chainHops = '每一跳都必须选择出口设备组';
      }
    } else {
      if (!form.serverIp.trim()) newErrors.serverIp = '请输入服务器 IP 或域名';
      if (!form.entryIps.some(ip => ip.trim())) newErrors.entryIp = '请至少输入一个入口 IP 或域名';
      if (form.portSta < 1 || form.portSta > 65535) newErrors.portSta = '端口号必须在1-65535之间';
      if (form.portEnd < 1 || form.portEnd > 65535) newErrors.portEnd = '端口号必须在1-65535之间';
    }
    if (form.ratio < 0) newErrors.ratio = '流量倍率不能小于0';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitLoading(true);
    try {
      // 链式出口设备组没有自己的物理节点，不需要创建/更新 Node，直接提交设备组本身
      if (form.direction === 'chain') {
        const groupData = {
          id: form.id,
          name: form.name,
          direction: form.direction,
          userGroupIds: form.userGroupIds,
          ratio: form.ratio,
          hideInProbe: form.hideInProbe,
          remark: form.remark,
          chainHops: form.chainHops.map(hop => ({ targetDeviceGroupId: hop.targetDeviceGroupId, mux: hop.mux }))
        };
        const res = isEdit ? await updateDeviceGroup(groupData) : await createDeviceGroup(groupData);
        if (res.code === 0) {
          toast.success(isEdit ? '修改成功' : '创建成功');
          setModalOpen(false);
          loadData();
        } else {
          toast.error(res.msg || '操作失败');
        }
        return;
      }

      let nodeId = form.nodeId;
      const joinedEntryIp = joinEntryIps(form.entryIps);
      const nodeData = { name: form.name, ip: joinedEntryIp, serverIp: form.serverIp, portSta: form.portSta, portEnd: form.portEnd, nodeGroupIds: form.nodeGroupIds };
      if (nodeId) {
        // 编辑已有设备组，或补全一个已存在但尚未建立设备组的节点，都是更新同一个节点记录
        const nodeRes = await updateNode({ id: nodeId, ...nodeData });
        if (nodeRes.code !== 0) { toast.error(nodeRes.msg || '更新设备失败'); return; }
      } else {
        const nodeRes = await createNode(nodeData);
        if (nodeRes.code !== 0) { toast.error(nodeRes.msg || '创建设备失败'); return; }
        nodeId = nodeRes.data?.id ?? null;
        // 兼容旧版后端：创建成功时只返回“节点创建成功”字串。
        if (!nodeId) {
          const listRes = await getNodeList();
          if (listRes.code === 0) {
            const candidates = (listRes.data || []).filter((node: NodeItem) => node.name === form.name && node.ip === joinedEntryIp && node.serverIp === form.serverIp);
            nodeId = candidates.sort((a: NodeItem, b: NodeItem) => b.id - a.id)[0]?.id ?? null;
          }
        }
        if (!nodeId) { toast.error('设备已创建，但无法识别其 ID；请刷新后在“未配置设备”中补全配置'); return; }
      }
      const groupData = { ...form, nodeId };
      const res = isEdit ? await updateDeviceGroup(groupData) : await createDeviceGroup(groupData);
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
    setConfigTarget({
      node: nodes.find(node => node.id === nodeId) || null,
      group: groups.find(group => group.nodeId === nodeId) || null
    });
    setConfigModalOpen(true);
  };

  const handleAdvancedEdit = (nodeId: number) => {
    const node = nodes.find(n => n.id === nodeId) || orphanNodes.find(n => n.id === nodeId) || null;
    setAdvancedTarget(node);
    setAdvancedForm({ http: node?.http || 0, tls: node?.tls || 0, socks: node?.socks || 0, nodeGroupIds: node?.nodeGroupIds || [] });
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

  const handleResetSecret = (nodeId: number) => {
    setResetTargetId(nodeId);
    setResetModalOpen(true);
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
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <Button isIconOnly size="sm" variant="flat" isLoading={dockLoadingNodeId === nodeId} title="对接" onPress={() => prefetchInstallInfo(nodeId)}>
          <DockIcon className="w-4 h-4" />
        </Button>
      </DropdownTrigger>
      <DropdownMenu aria-label="对接操作" onAction={(key) => handleDockAction(nodeId, key as string, title)}>
        <DropdownSection title={title}>
          <DropdownItem key="copy-auto">复制在线安装命令（自动探测线路）</DropdownItem>
          <DropdownItem key="copy-overseas">复制在线安装命令（海外主线路）</DropdownItem>
          <DropdownItem key="offline">离线部署</DropdownItem>
          <DropdownItem key="view-config">查看节点配置</DropdownItem>
        </DropdownSection>
      </DropdownMenu>
    </Dropdown>
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
          <div><h1 className="text-base font-semibold text-foreground">设备管理</h1><p className="mt-1 text-xs text-default-500">创建并管理入口、出口、监控设备及其访问权限</p></div>
          <div className="flex gap-2">
            {selectedGroupIds.length > 0 && <Button size="sm" color="danger" variant="flat" onPress={() => setBatchDeleteModalOpen(true)}>批量删除（{selectedGroupIds.length}）</Button>}
            <Button size="sm" variant="bordered" onPress={loadData}>刷新</Button>
            <Button size="sm" color="default" onPress={handleAdd}>添加设备</Button>
          </div>
        </CardHeader>
        <CardBody className="p-0"><Table removeWrapper aria-label="设备列表" selectionMode="multiple" selectedKeys={selectedKeys} onSelectionChange={setSelectedKeys} disabledKeys={orphanNodes.map(node => `node-${node.id}`)} classNames={{ base: "w-full", table: "w-full management-table-selectable", th: "management-table-heading", td: "management-table-cell" }}>
          <TableHeader><TableColumn className="w-16">排序</TableColumn><TableColumn>设备 ID</TableColumn><TableColumn>名称</TableColumn><TableColumn>角色</TableColumn><TableColumn>服务器</TableColumn><TableColumn>可见用户组</TableColumn><TableColumn>倍率</TableColumn><TableColumn>备注</TableColumn><TableColumn align="end">操作</TableColumn></TableHeader>
          <TableBody emptyContent={<EmptyState />}>{[
            ...groups.map(group => { const isChainGroup = group.direction === 'chain'; return <TableRow key={`group-${group.id}`} onDragOver={(e: React.DragEvent) => e.preventDefault()} onDrop={() => handleGroupRowDrop(group.id)}><TableCell><span draggable className="cursor-grab active:cursor-grabbing inline-flex" onDragStart={() => { draggedGroupIdRef.current = group.id; }}><DragHandleIcon /></span></TableCell><TableCell>#{group.id}</TableCell><TableCell className="font-medium">{group.name}</TableCell><TableCell>{{ inbound: '入口', outbound: '出口', monitor: '监控', both: '入口＋出口', chain: '链式出口' }[group.direction || 'inbound']}</TableCell><TableCell>{isChainGroup ? <span className="text-default-500">{(group.chainHops || []).length} 跳链路</span> : group.nodeName}</TableCell><TableCell>{userGroupNames(group.userGroupIds)}</TableCell><TableCell>{group.ratio}</TableCell><TableCell>{group.remark || '—'}</TableCell><TableCell><div className="flex justify-end items-center gap-1">{!isChainGroup && group.nodeId && renderDockMenu(group.nodeId, `${group.name} (#${group.id})`)}<Button isIconOnly size="sm" variant="flat" onPress={() => handleEdit(group)} title="编辑"><EditIcon className="w-4 h-4" /></Button>{!isChainGroup && group.nodeId && <Button isIconOnly size="sm" variant="flat" color="default" onPress={() => handleResetSecret(group.nodeId!)} title="重置 Token"><KeyIcon className="w-4 h-4" /></Button>}{!isChainGroup && group.nodeId && <Button isIconOnly size="sm" variant="flat" onPress={() => handleAdvancedEdit(group.nodeId!)} title="高级编辑"><SettingsIcon className="w-4 h-4" /></Button>}<Button isIconOnly size="sm" variant="flat" color="danger" onPress={() => handleDelete(group)} title="删除"><DeleteIcon className="w-4 h-4" /></Button></div></TableCell></TableRow>; }),
            ...orphanNodes.map(node => <TableRow key={`node-${node.id}`}><TableCell>—</TableCell><TableCell>—</TableCell><TableCell className="font-medium">{node.name}</TableCell><TableCell><span className="text-warning">未配置</span></TableCell><TableCell>{node.serverIp || node.ip || '—'}</TableCell><TableCell>—</TableCell><TableCell>—</TableCell><TableCell>此设备尚未建立设备组</TableCell><TableCell><div className="flex justify-end items-center gap-1">{renderDockMenu(node.id, `${node.name} (#${node.id})`)}<Button isIconOnly size="sm" variant="flat" color="default" onPress={() => handleResetSecret(node.id)} title="重置 Token"><KeyIcon className="w-4 h-4" /></Button><Button isIconOnly size="sm" variant="flat" onPress={() => handleAdvancedEdit(node.id)} title="高级编辑"><SettingsIcon className="w-4 h-4" /></Button><Button isIconOnly size="sm" variant="flat" color="danger" onPress={() => handleDeleteNode(node)} title="删除"><DeleteIcon className="w-4 h-4" /></Button><Button size="sm" color="default" onPress={() => handleConfigureOrphan(node)}>补全配置</Button></div></TableCell></TableRow>)
          ]}</TableBody>
        </Table></CardBody>
      </Card>

      <Modal isOpen={modalOpen} onOpenChange={setModalOpen} size="lg" scrollBehavior="outside" backdrop="blur" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-xl font-bold">{isEdit ? '编辑设备组' : '添加设备组'}</h2>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    size="sm" autoComplete="off"
                    label="名称"
                    value={form.name}
                    onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                    isInvalid={!!errors.name}
                    errorMessage={errors.name}
                    variant="bordered"
                  />

                  <Select
                    size="sm"
                    label={<HelpTooltip content="监控设备仅用于观测；入口＋出口可同时用于两种转发角色；链式出口不绑定自己的物理设备，而是把多个已有的出口设备组串成一条多跳链路">设备角色</HelpTooltip>}
                    selectedKeys={[form.direction]}
                    onSelectionChange={(keys) => {
                      const selectedKey = Array.from(keys)[0] as DeviceGroupForm['direction'];
                      setForm(prev => ({ ...prev, direction: selectedKey || 'inbound' }));
                    }}
                    variant="bordered"
                  >
                    <SelectItem key="inbound">入口</SelectItem>
                    <SelectItem key="outbound">出口</SelectItem>
                    <SelectItem key="monitor">监控</SelectItem>
                    <SelectItem key="both">入口＋出口</SelectItem>
                    <SelectItem key="chain">链式出口</SelectItem>
                  </Select>

                  {form.direction === 'chain' ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">链式出口配置</span>
                        <span className="text-xs text-default-400">{form.chainHops.length} / {MAX_CHAIN_HOPS} 跳</span>
                      </div>
                      {errors.chainHops && <p className="text-xs text-danger">{errors.chainHops}</p>}
                      {form.chainHops.length === 0 && (
                        <p className="text-xs text-default-400">当前没有配置任何出口链，请点击“添加跳数”按钮。</p>
                      )}
                      <div className="space-y-3">
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
                                  <Switch
                                    size="sm"
                                    isSelected={hop.mux}
                                    onValueChange={(v) => setForm(prev => ({
                                      ...prev,
                                      chainHops: prev.chainHops.map((h, i) => i === index ? { ...h, mux: v } : h)
                                    }))}
                                  />
                                </div>
                                <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => setForm(prev => ({ ...prev, chainHops: prev.chainHops.filter((_, i) => i !== index) }))} title="删除这一跳">
                                  <DeleteIcon className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                            <Select
                              size="sm"
                              placeholder="请选择出口"
                              selectedKeys={hop.targetDeviceGroupId ? [hop.targetDeviceGroupId.toString()] : []}
                              onSelectionChange={(keys) => {
                                const selectedKey = Array.from(keys)[0] as string;
                                setForm(prev => ({
                                  ...prev,
                                  chainHops: prev.chainHops.map((h, i) => i === index ? { ...h, targetDeviceGroupId: selectedKey ? parseInt(selectedKey) : null } : h)
                                }));
                              }}
                              variant="bordered"
                            >
                              {groups.filter(g => g.direction === 'outbound').map(g => (
                                <SelectItem key={g.id.toString()} description={g.nodeName}>{g.name}</SelectItem>
                              ))}
                            </Select>
                          </div>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        variant="flat"
                        className="w-full"
                        isDisabled={form.chainHops.length >= MAX_CHAIN_HOPS}
                        onPress={() => setForm(prev => ({ ...prev, chainHops: [...prev.chainHops, { targetDeviceGroupId: null, mux: false }] }))}
                      >
                        + 添加跳数（{form.chainHops.length} / {MAX_CHAIN_HOPS}）
                      </Button>
                      {form.chainHops.length >= MAX_CHAIN_HOPS && (
                        <p className="text-xs text-warning">已达到最大跳数限制（{MAX_CHAIN_HOPS} 跳）。</p>
                      )}
                    </div>
                  ) : (
                    <>
                      <Input size="sm" autoComplete="off" label="服务器 IP / 域名" placeholder="例如：203.0.113.10 或 node.example.com" value={form.serverIp} onChange={(e) => setForm(prev => ({ ...prev, serverIp: e.target.value }))} isInvalid={!!errors.serverIp} errorMessage={errors.serverIp} variant="bordered" />

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">入口 IP / 域名</span>
                          <span className="text-xs text-default-400">{form.entryIps.length} / {MAX_ENTRY_IPS}</span>
                        </div>
                        {errors.entryIp && <p className="text-xs text-danger">{errors.entryIp}</p>}
                        <div className="space-y-2">
                          {form.entryIps.map((ip, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <Input
                                size="sm" autoComplete="off"
                                placeholder="用户连接使用的 IP 或域名"
                                value={ip}
                                onChange={(e) => setForm(prev => ({ ...prev, entryIps: prev.entryIps.map((v, i) => i === index ? e.target.value : v) }))}
                                variant="bordered"
                                className="flex-1"
                              />
                              <Button
                                isIconOnly size="sm" variant="light" color="danger"
                                isDisabled={form.entryIps.length <= 1}
                                onPress={() => setForm(prev => ({ ...prev, entryIps: prev.entryIps.filter((_, i) => i !== index) }))}
                                title="删除这一行"
                              >
                                <DeleteIcon className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <Button
                          size="sm" variant="flat" className="w-full"
                          isDisabled={form.entryIps.length >= MAX_ENTRY_IPS}
                          onPress={() => setForm(prev => ({ ...prev, entryIps: [...prev.entryIps, ''] }))}
                        >
                          + 添加一行（{form.entryIps.length} / {MAX_ENTRY_IPS}）
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <Input size="sm" autoComplete="off" label="起始端口" type="number" value={form.portSta.toString()} onChange={(e) => setForm(prev => ({ ...prev, portSta: Number(e.target.value) || 1000 }))} isInvalid={!!errors.portSta} errorMessage={errors.portSta} variant="bordered" />
                        <Input size="sm" autoComplete="off" label="结束端口" type="number" value={form.portEnd.toString()} onChange={(e) => setForm(prev => ({ ...prev, portEnd: Number(e.target.value) || 65535 }))} isInvalid={!!errors.portEnd} errorMessage={errors.portEnd} variant="bordered" />
                      </div>

                      <Select
                        size="sm"
                        selectionMode="multiple"
                        label={<HelpTooltip content="该节点所属的节点组，用于分配套餐/用户组可使用的节点范围；一个节点可以同时属于多个节点组">节点组</HelpTooltip>}
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
                        <Select
                          size="sm"
                          label={<HelpTooltip content="该出口设备组作为隧道转发出口节点时使用的传输协议">协议类型</HelpTooltip>}
                          selectedKeys={[form.protocol]}
                          onSelectionChange={(keys) => {
                            const selectedKey = Array.from(keys)[0] as string;
                            if (selectedKey) {
                              setForm(prev => ({ ...prev, protocol: selectedKey }));
                            }
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

                  <Select
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

                  <Input
                    size="sm" autoComplete="off"
                    label="流量倍率"
                    type="number"
                    value={form.ratio.toString()}
                    onChange={(e) => setForm(prev => ({ ...prev, ratio: parseFloat(e.target.value) || 0 }))}
                    isInvalid={!!errors.ratio}
                    errorMessage={errors.ratio}
                    variant="bordered"
                  />

                  <Select
                    size="sm"
                    label="在探针中隐藏"
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

                  <Textarea
                    size="sm" autoComplete="off"
                    label="备注（仅管理员可见）"
                    value={form.remark}
                    onChange={(e) => setForm(prev => ({ ...prev, remark: e.target.value }))}
                    variant="bordered"
                    minRows={2}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>取消</Button>
                <Button color="default" onPress={handleSubmit} isLoading={submitLoading}>
                  {isEdit ? '保存修改' : '创建'}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <ConfirmDialog
        isOpen={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="确认删除"
        message={<>你确定要删除设备组 {groupToDelete?.name}（#{groupToDelete?.id}）吗？</>}
        confirmText="确定"
        confirmColor="danger"
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />

      <Modal isOpen={configModalOpen} onOpenChange={setConfigModalOpen} size="lg" scrollBehavior="outside" backdrop="blur" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-lg font-bold">查看节点配置 - {configTarget.node?.name || '—'}</h2>
              </ModalHeader>
              <ModalBody>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="text-default-500">设备名称</div><div className="font-medium">{configTarget.node?.name || '—'}</div>
                  <div className="text-default-500">服务器 IP / 域名</div><div className="font-medium">{configTarget.node?.serverIp || '—'}</div>
                  <div className="text-default-500">入口 IP / 域名</div><div className="font-medium">{configTarget.node?.ip || '—'}</div>
                  <div className="text-default-500">端口范围</div><div className="font-medium">{configTarget.node?.portSta || '—'} - {configTarget.node?.portEnd || '—'}</div>
                  <div className="text-default-500">设备角色</div><div className="font-medium">{configTarget.group ? { inbound: '入口', outbound: '出口', monitor: '监控', both: '入口＋出口', chain: '链式出口' }[configTarget.group.direction || 'inbound'] : '未配置设备组'}</div>
                  <div className="text-default-500">可见用户组</div><div className="font-medium">{configTarget.group ? userGroupNames(configTarget.group.userGroupIds) : '—'}</div>
                  <div className="text-default-500">流量倍率</div><div className="font-medium">{configTarget.group?.ratio ?? '—'}</div>
                  <div className="text-default-500">备注</div><div className="font-medium">{configTarget.group?.remark || '—'}</div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>关闭</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal isOpen={offlineModalOpen} onOpenChange={setOfflineModalOpen} size="lg" scrollBehavior="outside" backdrop="blur" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center gap-2">
                <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="11" fill="#6f9bff" />
                  <circle cx="12" cy="7.4" r="1.5" fill="#15161a" />
                  <rect x="10.7" y="10.2" width="2.6" height="7.6" rx="1.3" fill="#15161a" />
                </svg>
                <h2 className="text-lg font-bold">离线部署</h2>
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
                <Button onPress={onClose}>知道了</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal isOpen={advancedModalOpen} onOpenChange={setAdvancedModalOpen} size="lg" scrollBehavior="outside" backdrop="blur" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-lg font-bold">高级编辑 - {advancedTarget?.name || '—'}</h2>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-2">
                  <div className="text-sm font-medium text-default-700">屏蔽协议</div>
                  <div className="text-xs text-default-500 mb-2">开启开关以屏蔽对应协议</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-default-50 dark:bg-default-100 p-3 rounded-md border border-default-200 dark:border-default-100/30">
                    {(['http', 'tls', 'socks'] as const).map(key => (
                      <div key={key} className="px-3 py-3 rounded-lg bg-white dark:bg-default-50 border border-default-200 dark:border-default-100/30">
                        <div className="text-sm font-medium text-default-700 mb-2 uppercase">{key}</div>
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-default-500">禁用/启用</div>
                          <Switch size="sm" isSelected={advancedForm[key] === 1} onValueChange={(v) => setAdvancedForm(prev => ({ ...prev, [key]: v ? 1 : 0 }))} />
                        </div>
                        <div className="mt-1 text-xs text-default-400">{advancedForm[key] === 1 ? '已开启' : '已关闭'}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <Select
                  size="sm"
                  className="mt-4"
                  selectionMode="multiple"
                  label={<HelpTooltip content="该节点所属的节点组，用于分配套餐/用户组可使用的节点范围；一个节点可以同时属于多个节点组">节点组</HelpTooltip>}
                  placeholder="未归属任何节点组"
                  selectedKeys={new Set(advancedForm.nodeGroupIds.map(String))}
                  onSelectionChange={(keys) => {
                    const ids = Array.from(keys as Set<string>).map(Number);
                    setAdvancedForm(prev => ({ ...prev, nodeGroupIds: ids }));
                  }}
                  variant="bordered"
                >
                  {nodeGroups.map(group => (
                    <SelectItem key={group.id.toString()}>{group.name || `#${group.id}`}</SelectItem>
                  ))}
                </Select>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>取消</Button>
                <Button color="default" onPress={submitAdvancedEdit} isLoading={advancedLoading}>保存</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <ConfirmDialog
        isOpen={resetModalOpen}
        onOpenChange={setResetModalOpen}
        title="重置 Token"
        message={<>你确定要重置设备 {[...nodes, ...orphanNodes].find(n => n.id === resetTargetId)?.name}（#{resetTargetId}）的 Token 吗？重置后原有 Token 将立即失效，需要重新在节点上执行安装命令或更新离线配置，才能恢复连接。</>}
        confirmText="确定"
        confirmColor="warning"
        onConfirm={confirmResetSecret}
        loading={resetLoading}
      />

      <ConfirmDialog
        isOpen={batchDeleteModalOpen}
        onOpenChange={setBatchDeleteModalOpen}
        title="批量删除"
        message={<>你确定要删除选中的 {selectedGroupIds.length} 个设备吗？</>}
        confirmText="确定"
        confirmColor="danger"
        onConfirm={handleBatchDelete}
        loading={batchDeleteLoading}
      />

      <ConfirmDialog
        isOpen={deleteNodeModalOpen}
        onOpenChange={setDeleteNodeModalOpen}
        title="确认删除"
        message={<>你确定要彻底删除设备 {nodeToDelete?.name} 吗？此设备尚未建立设备组，删除后该设备及其密钥将被完全移除，不会再出现在此列表中。</>}
        confirmText="确定"
        confirmColor="danger"
        onConfirm={confirmDeleteNode}
        loading={deleteNodeLoading}
      />
    </div>
  );
}
