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
  getNodeInstallCommand,
  resetNodeSecret
} from "@/api";
import { EditIcon, DeleteIcon, SettingsIcon } from "@/components/icons";
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

interface DeviceGroupItem {
  id: number;
  name: string;
  nodeId: number;
  nodeName: string;
  userGroupId: number | null;
  ratio: number;
  hideInProbe: number;
  direction?: 'inbound' | 'outbound' | 'monitor' | 'both';
  remark?: string;
  sort?: number;
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
}

interface UserGroupItem {
  id: number;
  name: string;
}

interface InstallInfo {
  commandAuto: string;
  commandOverseas: string;
  addr: string;
  secret: string;
  downloadUrls: { amd64: string; arm64: string };
}

interface DeviceGroupForm {
  id?: number;
  name: string;
  nodeId: number | null;
  serverIp: string;
  entryIp: string;
  portSta: number;
  portEnd: number;
  userGroupId: number | null;
  ratio: number;
  hideInProbe: number;
  direction: 'inbound' | 'outbound' | 'monitor' | 'both';
  remark: string;
}

const DEFAULT_FORM: DeviceGroupForm = {
  name: '',
  nodeId: null,
  serverIp: '',
  entryIp: '',
  portSta: 1000,
  portEnd: 65535,
  userGroupId: null,
  ratio: 1,
  hideInProbe: 0,
  direction: 'inbound',
  remark: ''
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
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configTarget, setConfigTarget] = useState<{ node: NodeItem | null; group: DeviceGroupItem | null }>({ node: null, group: null });
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState<InstallInfo | null>(null);

  const [advancedModalOpen, setAdvancedModalOpen] = useState(false);
  const [advancedTarget, setAdvancedTarget] = useState<NodeItem | null>(null);
  const [advancedForm, setAdvancedForm] = useState({ http: 0, tls: 0, socks: 0 });
  const [advancedLoading, setAdvancedLoading] = useState(false);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetTargetId, setResetTargetId] = useState<number | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const [selectedKeys, setSelectedKeys] = useState<any>(new Set([]));
  const [batchDeleteModalOpen, setBatchDeleteModalOpen] = useState(false);
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);
  const draggedGroupIdRef = useRef<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [groupsRes, nodesRes, userGroupsRes] = await Promise.all([
        getDeviceGroupList(),
        getNodeList(),
        getUserGroupList()
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
      entryIp: nodes.find(node => node.id === group.nodeId)?.ip || '',
      portSta: nodes.find(node => node.id === group.nodeId)?.portSta || 1000,
      portEnd: nodes.find(node => node.id === group.nodeId)?.portEnd || 65535,
      userGroupId: group.userGroupId,
      ratio: group.ratio,
      hideInProbe: group.hideInProbe,
      direction: group.direction || 'inbound',
      remark: group.remark || ''
    });
    setErrors({});
    setModalOpen(true);
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    if (!form.name.trim()) newErrors.name = '请输入设备组名称';
    if (!form.serverIp.trim()) newErrors.serverIp = '请输入服务器 IP 或域名';
    if (!form.entryIp.trim()) newErrors.entryIp = '请输入入口 IP 或域名';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitLoading(true);
    try {
      let nodeId = form.nodeId;
      const nodeData = { name: form.name, ip: form.entryIp, serverIp: form.serverIp, portSta: form.portSta, portEnd: form.portEnd };
      if (isEdit && nodeId) {
        const nodeRes = await updateNode({ id: nodeId, ...nodeData });
        if (nodeRes.code !== 0) { toast.error(nodeRes.msg || '更新设备失败'); return; }
      } else if (nodeId) {
        // 已有设备节点但尚未建立设备组：直接补建设备组，不再重复创建节点。
      } else {
        const nodeRes = await createNode(nodeData);
        if (nodeRes.code !== 0) { toast.error(nodeRes.msg || '创建设备失败'); return; }
        nodeId = nodeRes.data?.id ?? null;
        // 兼容旧版后端：创建成功时只返回“节点创建成功”字串。
        if (!nodeId) {
          const listRes = await getNodeList();
          if (listRes.code === 0) {
            const candidates = (listRes.data || []).filter((node: NodeItem) => node.name === form.name && node.ip === form.entryIp && node.serverIp === form.serverIp);
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

  const userGroupName = (id: number | null) => {
    if (!id) return '所有用户可见';
    return userGroups.find(g => g.id === id)?.name || `#${id}`;
  };

  const handleConfigureOrphan = (node: NodeItem) => {
    setIsEdit(false);
    setForm({ ...DEFAULT_FORM, name: node.name, nodeId: node.id, serverIp: node.serverIp || '', entryIp: node.ip || '', portSta: node.portSta || 1000, portEnd: node.portEnd || 65535 });
    setErrors({});
    setModalOpen(true);
  };

  const copyToClipboard = async (text: string, successMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMsg);
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
    setAdvancedForm({ http: node?.http || 0, tls: node?.tls || 0, socks: node?.socks || 0 });
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
      } else {
        toast.error(res.msg || '重置失败');
      }
    } catch (error) {
      toast.error('重置失败');
    } finally {
      setResetLoading(false);
    }
  };

  const handleDockAction = async (nodeId: number, action: string) => {
    if (action === 'view-config') { handleViewConfig(nodeId); return; }

    setDockLoadingNodeId(nodeId);
    try {
      const res = await getNodeInstallCommand(nodeId);
      if (res.code !== 0) { toast.error(res.msg || '获取安装信息失败'); return; }
      const info = res.data as InstallInfo;
      if (action === 'copy-auto') await copyToClipboard(info.commandAuto, '已复制在线安装命令（自动探测线路）');
      else if (action === 'copy-overseas') await copyToClipboard(info.commandOverseas, '已复制在线安装命令（海外主线路）');
      else if (action === 'offline') { setOfflineInfo(info); setOfflineModalOpen(true); }
    } catch (error) {
      toast.error('获取安装信息失败');
    } finally {
      setDockLoadingNodeId(null);
    }
  };

  const renderDockMenu = (nodeId: number, title: string) => (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <Button isIconOnly size="sm" variant="flat" isLoading={dockLoadingNodeId === nodeId} title="对接">
          <DockIcon className="w-4 h-4" />
        </Button>
      </DropdownTrigger>
      <DropdownMenu aria-label="对接操作" onAction={(key) => handleDockAction(nodeId, key as string)}>
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
            <Button size="sm" color="primary" onPress={handleAdd}>添加设备</Button>
          </div>
        </CardHeader>
        <CardBody className="p-0"><Table removeWrapper aria-label="设备列表" selectionMode="multiple" selectedKeys={selectedKeys} onSelectionChange={setSelectedKeys} disabledKeys={orphanNodes.map(node => `node-${node.id}`)} classNames={{ base: "w-full", table: "w-full management-table-selectable", th: "management-table-heading", td: "management-table-cell" }}>
          <TableHeader><TableColumn className="w-16">排序</TableColumn><TableColumn>设备 ID</TableColumn><TableColumn>名称</TableColumn><TableColumn>角色</TableColumn><TableColumn>服务器</TableColumn><TableColumn>可见用户组</TableColumn><TableColumn>倍率</TableColumn><TableColumn>备注</TableColumn><TableColumn align="end">操作</TableColumn></TableHeader>
          <TableBody emptyContent={<EmptyState />}>{[
            ...groups.map(group => <TableRow key={`group-${group.id}`} onDragOver={(e: React.DragEvent) => e.preventDefault()} onDrop={() => handleGroupRowDrop(group.id)}><TableCell><span draggable className="cursor-grab active:cursor-grabbing inline-flex" onDragStart={() => { draggedGroupIdRef.current = group.id; }}><DragHandleIcon /></span></TableCell><TableCell>#{group.id}</TableCell><TableCell className="font-medium">{group.name}</TableCell><TableCell>{{ inbound: '入口', outbound: '出口', monitor: '监控', both: '入口＋出口' }[group.direction || 'inbound']}</TableCell><TableCell>{group.nodeName}</TableCell><TableCell>{userGroupName(group.userGroupId)}</TableCell><TableCell>{group.ratio}</TableCell><TableCell>{group.remark || '—'}</TableCell><TableCell><div className="flex justify-end items-center gap-1">{renderDockMenu(group.nodeId, `${group.name} (#${group.id})`)}<Button isIconOnly size="sm" variant="flat" onPress={() => handleEdit(group)} title="编辑"><EditIcon className="w-4 h-4" /></Button><Button isIconOnly size="sm" variant="flat" color="warning" onPress={() => handleResetSecret(group.nodeId)} title="重置 Token"><KeyIcon className="w-4 h-4" /></Button><Button isIconOnly size="sm" variant="flat" onPress={() => handleAdvancedEdit(group.nodeId)} title="高级编辑"><SettingsIcon className="w-4 h-4" /></Button><Button isIconOnly size="sm" variant="flat" color="danger" onPress={() => handleDelete(group)} title="删除"><DeleteIcon className="w-4 h-4" /></Button></div></TableCell></TableRow>),
            ...orphanNodes.map(node => <TableRow key={`node-${node.id}`}><TableCell>—</TableCell><TableCell>—</TableCell><TableCell className="font-medium">{node.name}</TableCell><TableCell><span className="text-warning">未配置</span></TableCell><TableCell>{node.serverIp || node.ip || '—'}</TableCell><TableCell>—</TableCell><TableCell>—</TableCell><TableCell>此设备尚未建立设备组</TableCell><TableCell><div className="flex justify-end items-center gap-1">{renderDockMenu(node.id, `${node.name} (#${node.id})`)}<Button isIconOnly size="sm" variant="flat" color="warning" onPress={() => handleResetSecret(node.id)} title="重置 Token"><KeyIcon className="w-4 h-4" /></Button><Button isIconOnly size="sm" variant="flat" onPress={() => handleAdvancedEdit(node.id)} title="高级编辑"><SettingsIcon className="w-4 h-4" /></Button><Button isIconOnly size="sm" variant="flat" color="danger" onPress={() => handleDeleteNode(node)} title="删除"><DeleteIcon className="w-4 h-4" /></Button><Button size="sm" color="primary" onPress={() => handleConfigureOrphan(node)}>补全配置</Button></div></TableCell></TableRow>)
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
                  <Input autoComplete="off"
                    label="名称"
                    value={form.name}
                    onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                    isInvalid={!!errors.name}
                    errorMessage={errors.name}
                    variant="bordered"
                  />

                  <Select
                    label="设备角色"
                    selectedKeys={[form.direction]}
                    onSelectionChange={(keys) => {
                      const selectedKey = Array.from(keys)[0] as DeviceGroupForm['direction'];
                      setForm(prev => ({ ...prev, direction: selectedKey || 'inbound' }));
                    }}
                    variant="bordered"
                    description="监控设备仅用于观测；入口＋出口可同时用于两种转发角色"
                  >
                    <SelectItem key="inbound">入口</SelectItem>
                    <SelectItem key="outbound">出口</SelectItem>
                    <SelectItem key="monitor">监控</SelectItem>
                    <SelectItem key="both">入口＋出口</SelectItem>
                  </Select>

                  <Input autoComplete="off" label="服务器 IP / 域名" placeholder="例如：203.0.113.10 或 node.example.com" value={form.serverIp} onChange={(e) => setForm(prev => ({ ...prev, serverIp: e.target.value }))} isInvalid={!!errors.serverIp} errorMessage={errors.serverIp} variant="bordered" />

                  <Input autoComplete="off" label="入口 IP / 域名" placeholder="用户连接使用的 IP 或域名" value={form.entryIp} onChange={(e) => setForm(prev => ({ ...prev, entryIp: e.target.value }))} isInvalid={!!errors.entryIp} errorMessage={errors.entryIp} variant="bordered" />

                  <div className="grid grid-cols-2 gap-4">
                    <Input autoComplete="off" label="起始端口" type="number" value={form.portSta.toString()} onChange={(e) => setForm(prev => ({ ...prev, portSta: Number(e.target.value) || 1000 }))} variant="bordered" />
                    <Input autoComplete="off" label="结束端口" type="number" value={form.portEnd.toString()} onChange={(e) => setForm(prev => ({ ...prev, portEnd: Number(e.target.value) || 65535 }))} variant="bordered" />
                  </div>

                  <Select
                    label="用户组ID"
                    placeholder="留空表示所有用户可见"
                    selectedKeys={form.userGroupId ? [form.userGroupId.toString()] : []}
                    onSelectionChange={(keys) => {
                      const selectedKey = Array.from(keys)[0] as string;
                      setForm(prev => ({ ...prev, userGroupId: selectedKey ? parseInt(selectedKey) : null }));
                    }}
                    variant="bordered"
                    description="仅该用户组的用户可在添加转发规则时看到此设备组"
                  >
                    {userGroups.map(group => (
                      <SelectItem key={group.id.toString()}>{group.name || `#${group.id}`}</SelectItem>
                    ))}
                  </Select>

                  <Input autoComplete="off"
                    label="流量倍率"
                    type="number"
                    value={form.ratio.toString()}
                    onChange={(e) => setForm(prev => ({ ...prev, ratio: parseFloat(e.target.value) || 0 }))}
                    variant="bordered"
                  />

                  <Select
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

                  <Textarea autoComplete="off"
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
                <Button color="primary" onPress={handleSubmit} isLoading={submitLoading}>
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
                  <div className="text-default-500">设备角色</div><div className="font-medium">{configTarget.group ? { inbound: '入口', outbound: '出口', monitor: '监控', both: '入口＋出口' }[configTarget.group.direction || 'inbound'] : '未配置设备组'}</div>
                  <div className="text-default-500">可见用户组</div><div className="font-medium">{configTarget.group ? userGroupName(configTarget.group.userGroupId) : '—'}</div>
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
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-lg font-bold">离线部署</h2>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4 text-sm">
                  <p className="text-default-600">适用于服务器无法访问在线安装脚本的场景：手动下载对应架构的程序包，并按下方参数手动配置。</p>
                  <div className="space-y-2">
                    <div className="text-default-500">1. 下载程序包（根据服务器 CPU 架构选择）</div>
                    <div className="flex flex-col gap-1">
                      <a className="text-primary underline break-all" href={offlineInfo?.downloadUrls.amd64} target="_blank" rel="noopener noreferrer">gost-amd64（x86_64）</a>
                      <a className="text-primary underline break-all" href={offlineInfo?.downloadUrls.arm64} target="_blank" rel="noopener noreferrer">gost-arm64（aarch64）</a>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-default-500">2. 将程序放至 /etc/gost/gost 并赋予执行权限（chmod +x）</div>
                    <div className="text-default-500">3. 在同目录创建 config.json，内容如下</div>
                    <Textarea autoComplete="off" readOnly variant="bordered" minRows={4} classNames={{ input: 'font-mono text-xs' }} value={offlineInfo ? `{\n  "addr": "${offlineInfo.addr}",\n  "secret": "${offlineInfo.secret}"\n}` : ''} />
                    <Button size="sm" variant="flat" onPress={() => offlineInfo && copyToClipboard(`{\n  "addr": "${offlineInfo.addr}",\n  "secret": "${offlineInfo.secret}"\n}`, '已复制配置内容')}>复制配置内容</Button>
                  </div>
                  <div className="text-default-500">4. 手动启动程序，或参考在线安装脚本创建 systemd 服务实现开机自启</div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>关闭</Button>
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
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>取消</Button>
                <Button color="primary" onPress={submitAdvancedEdit} isLoading={advancedLoading}>保存</Button>
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
