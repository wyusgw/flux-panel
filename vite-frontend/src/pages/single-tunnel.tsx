import { useState, useEffect } from "react";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Spinner } from "@heroui/spinner";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/table";
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownSection } from "@heroui/dropdown";
import { Switch } from "@heroui/switch";
import { Chip } from "@heroui/chip";
import toast from 'react-hot-toast';

import {
  createUserDeviceGroup,
  getMyDeviceGroupList,
  updateUserDeviceGroup,
  deleteUserDeviceGroup,
  getMyDeviceGroupInstallCommand,
  resetMyDeviceGroupSecret,
  createMySingleTunnelGroup,
  getMySingleTunnelGroupList,
  updateMySingleTunnelGroup,
  deleteMySingleTunnelGroup
} from "@/api";
import { EditIcon, DeleteIcon } from "@/components/icons";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";

interface MyDeviceGroup {
  id: number;
  name: string;
  direction: 'inbound' | 'outbound';
  protocol?: string;
  shared: boolean;
  singleTunnelGroupId?: number | null;
  nodeId: number | null;
  serverIp?: string;
  entryIp?: string;
  portSta?: number;
  portEnd?: number;
  status?: number;
}

interface SingleTunnelGroupOption {
  id: number;
  name: string;
  deviceCount: number;
}

interface GroupForm {
  id?: number;
  name: string;
  direction: 'inbound' | 'outbound';
  serverIp: string;
  entryIp: string;
  portSta: number;
  portEnd: number;
  protocol: string;
  singleTunnelGroupId: number | null;
  shared: boolean;
}

interface InstallInfo {
  commandAuto: string;
  commandOverseas: string;
  offlineCommand: string;
  downloadUrls: { offlineAmd64: string; offlineArm64: string };
}

const DEFAULT_FORM: GroupForm = {
  name: '',
  direction: 'outbound',
  serverIp: '',
  entryIp: '',
  portSta: 1000,
  portEnd: 65535,
  protocol: 'tls',
  singleTunnelGroupId: null,
  shared: false
};

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

const IconCopy = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" />
  </svg>
);

export default function SingleTunnelPage() {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<MyDeviceGroup[]>([]);
  const [singleTunnelGroups, setSingleTunnelGroups] = useState<SingleTunnelGroupOption[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [form, setForm] = useState<GroupForm>(DEFAULT_FORM);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<MyDeviceGroup | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<MyDeviceGroup | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const [dockLoadingId, setDockLoadingId] = useState<number | null>(null);
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState<InstallInfo | null>(null);
  const [offlineTitle, setOfflineTitle] = useState('');

  const [groupManageModalOpen, setGroupManageModalOpen] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupEditingId, setGroupEditingId] = useState<number | null>(null);
  const [groupSubmitLoading, setGroupSubmitLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [res, groupRes] = await Promise.all([getMyDeviceGroupList(), getMySingleTunnelGroupList()]);
      if (res.code === 0) {
        setGroups(res.data || []);
      } else {
        toast.error(res.msg || '获取设备列表失败');
      }
      if (groupRes.code === 0) {
        setSingleTunnelGroups(groupRes.data || []);
      }
    } catch (error) {
      toast.error('获取设备列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupNameInput.trim()) {
      toast.error('请输入分组名称');
      return;
    }
    setGroupSubmitLoading(true);
    try {
      const res = groupEditingId
        ? await updateMySingleTunnelGroup({ id: groupEditingId, name: groupNameInput })
        : await createMySingleTunnelGroup({ name: groupNameInput });
      if (res.code === 0) {
        toast.success(groupEditingId ? '修改成功' : '创建成功');
        setGroupNameInput('');
        setGroupEditingId(null);
        loadData();
      } else {
        toast.error(res.msg || '操作失败');
      }
    } catch (error) {
      toast.error('操作失败');
    } finally {
      setGroupSubmitLoading(false);
    }
  };

  const handleEditGroupStart = (group: SingleTunnelGroupOption) => {
    setGroupEditingId(group.id);
    setGroupNameInput(group.name);
  };

  const handleDeleteGroup = async (group: SingleTunnelGroupOption) => {
    try {
      const res = await deleteMySingleTunnelGroup(group.id);
      if (res.code === 0) {
        toast.success('删除成功');
        loadData();
      } else {
        toast.error(res.msg || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const copyToClipboard = async (text: string, successMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMsg);
    } catch (error) {
      toast.error('复制失败，请手动复制');
    }
  };

  const handleAdd = () => {
    setIsEdit(false);
    setForm(DEFAULT_FORM);
    setErrors({});
    setModalOpen(true);
  };

  const handleEdit = (group: MyDeviceGroup) => {
    setIsEdit(true);
    setForm({
      id: group.id,
      name: group.name,
      direction: group.direction,
      serverIp: group.serverIp || '',
      entryIp: group.entryIp || '',
      portSta: group.portSta || 1000,
      portEnd: group.portEnd || 65535,
      protocol: group.protocol || 'tls',
      singleTunnelGroupId: group.singleTunnelGroupId ?? null,
      shared: group.shared
    });
    setErrors({});
    setModalOpen(true);
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    if (!form.name.trim()) newErrors.name = '请输入名称';
    if (!form.serverIp.trim()) newErrors.serverIp = '请输入服务器 IP 或域名';
    if (!form.entryIp.trim()) newErrors.entryIp = '请输入入口 IP 或域名';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setSubmitLoading(true);
    try {
      const res = isEdit
        ? await updateUserDeviceGroup(form)
        : await createUserDeviceGroup(form);
      if (res.code === 0) {
        toast.success(isEdit ? '更新成功' : '添加成功');
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

  const handleDelete = (group: MyDeviceGroup) => {
    setGroupToDelete(group);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!groupToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await deleteUserDeviceGroup(groupToDelete.id);
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

  const handleResetSecret = (group: MyDeviceGroup) => {
    setResetTarget(group);
    setResetModalOpen(true);
  };

  const confirmResetSecret = async () => {
    if (!resetTarget) return;
    setResetLoading(true);
    try {
      const res = await resetMyDeviceGroupSecret(resetTarget.id);
      if (res.code === 0) {
        toast.success('Token 已重置');
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

  const handleDockAction = async (group: MyDeviceGroup, action: string) => {
    setDockLoadingId(group.id);
    try {
      const res = await getMyDeviceGroupInstallCommand(group.id);
      if (res.code !== 0) { toast.error(res.msg || '获取安装信息失败'); return; }
      const info = res.data as InstallInfo;
      if (action === 'copy-auto') await copyToClipboard(info.commandAuto, '已复制在线安装命令（自动探测线路）');
      else if (action === 'copy-overseas') await copyToClipboard(info.commandOverseas, '已复制在线安装命令（海外主线路）');
      else if (action === 'offline') { setOfflineInfo(info); setOfflineTitle(`${group.name} (#${group.id})`); setOfflineModalOpen(true); }
    } catch (error) {
      toast.error('获取安装信息失败');
    } finally {
      setDockLoadingId(null);
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
    <div className="px-3 lg:px-6 py-8">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">单端隧道</h1>
          <p className="text-sm text-default-500 mt-1">
            添加自己的设备作为转发规则的入口或出口，添加完成后在此获取对接命令，在你的设备上安装即可连接到面板。
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="flat" onPress={() => setGroupManageModalOpen(true)}>管理分组</Button>
          <Button size="sm" color="primary" onPress={handleAdd}>添加设备</Button>
        </div>
      </div>

      <Card className="shadow-sm border border-default-200">
        <CardBody className="p-0">
          <div className="settings-table-scroll">
            <Table
              removeWrapper
              aria-label="单端隧道设备"
              classNames={{ base: "w-full", th: "management-table-heading", td: "management-table-cell" }}
            >
              <TableHeader>
                <TableColumn>名称</TableColumn>
                <TableColumn>角色</TableColumn>
                <TableColumn>状态</TableColumn>
                <TableColumn>共享</TableColumn>
                <TableColumn align="end">操作</TableColumn>
              </TableHeader>
              <TableBody items={groups} emptyContent={<EmptyState text="还没有添加自己的设备" />}>
                {(group: MyDeviceGroup) => (
                  <TableRow key={group.id}>
                    <TableCell className="font-medium">{group.name}</TableCell>
                    <TableCell>{group.direction === 'inbound' ? '入口' : '出口'}</TableCell>
                    <TableCell>
                      <Chip size="sm" variant="flat" color={group.status === 1 ? 'success' : 'danger'}>
                        {group.status === 1 ? '在线' : '离线'}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <Chip size="sm" variant="flat" color={group.shared ? 'primary' : 'default'}>
                        {group.shared ? '已共享' : '仅自己'}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end items-center gap-1">
                        <Dropdown placement="bottom-end">
                          <DropdownTrigger>
                            <Button isIconOnly size="sm" variant="flat" isLoading={dockLoadingId === group.id} title="对接">
                              <DockIcon className="w-4 h-4" />
                            </Button>
                          </DropdownTrigger>
                          <DropdownMenu aria-label="对接操作" onAction={(key) => handleDockAction(group, key as string)}>
                            <DropdownSection title={`${group.name} (#${group.id})`}>
                              <DropdownItem key="copy-auto">复制在线安装命令（自动探测线路）</DropdownItem>
                              <DropdownItem key="copy-overseas">复制在线安装命令（海外主线路）</DropdownItem>
                              <DropdownItem key="offline">离线部署</DropdownItem>
                            </DropdownSection>
                          </DropdownMenu>
                        </Dropdown>
                        <Button isIconOnly size="sm" variant="flat" onPress={() => handleEdit(group)} title="编辑">
                          <EditIcon className="w-4 h-4" />
                        </Button>
                        <Button isIconOnly size="sm" variant="flat" onPress={() => handleResetSecret(group)} title="重置 Token">
                          <KeyIcon className="w-4 h-4" />
                        </Button>
                        <Button isIconOnly size="sm" variant="flat" color="danger" onPress={() => handleDelete(group)} title="删除">
                          <DeleteIcon className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardBody>
      </Card>

      <Modal isOpen={modalOpen} onOpenChange={setModalOpen} size="lg" scrollBehavior="outside" backdrop="blur" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader><h2 className="text-lg font-bold">{isEdit ? '编辑设备' : '添加设备'}</h2></ModalHeader>
              <ModalBody>
                <div className="space-y-3">
                  <Input
                    size="sm" autoComplete="off"
                    label="名称"
                    value={form.name}
                    onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                    isInvalid={!!errors.name}
                    errorMessage={errors.name}
                    variant="bordered"
                  />

                  {!isEdit && (
                    <Select
                      size="sm"
                      label="角色"
                      selectedKeys={[form.direction]}
                      onSelectionChange={(keys) => {
                        const selectedKey = Array.from(keys)[0] as 'inbound' | 'outbound';
                        setForm(prev => ({ ...prev, direction: selectedKey || 'outbound' }));
                      }}
                      variant="bordered"
                      description="该设备在转发规则中充当入口还是出口"
                    >
                      <SelectItem key="inbound">入口</SelectItem>
                      <SelectItem key="outbound">出口</SelectItem>
                    </Select>
                  )}

                  <Input size="sm" autoComplete="off" label="服务器 IP / 域名" placeholder="例如：203.0.113.10 或 node.example.com" value={form.serverIp} onChange={(e) => setForm(prev => ({ ...prev, serverIp: e.target.value }))} isInvalid={!!errors.serverIp} errorMessage={errors.serverIp} variant="bordered" />

                  <Input size="sm" autoComplete="off" label="入口 IP / 域名" placeholder="用户连接使用的 IP 或域名" value={form.entryIp} onChange={(e) => setForm(prev => ({ ...prev, entryIp: e.target.value }))} isInvalid={!!errors.entryIp} errorMessage={errors.entryIp} variant="bordered" />

                  <div className="grid grid-cols-2 gap-3">
                    <Input size="sm" autoComplete="off" label="起始端口" type="number" value={form.portSta.toString()} onChange={(e) => setForm(prev => ({ ...prev, portSta: Number(e.target.value) || 1000 }))} variant="bordered" />
                    <Input size="sm" autoComplete="off" label="结束端口" type="number" value={form.portEnd.toString()} onChange={(e) => setForm(prev => ({ ...prev, portEnd: Number(e.target.value) || 65535 }))} variant="bordered" />
                  </div>

                  {form.direction === 'outbound' && (
                    <Select
                      size="sm"
                      label="协议类型"
                      selectedKeys={[form.protocol]}
                      onSelectionChange={(keys) => {
                        const selectedKey = Array.from(keys)[0] as string;
                        if (selectedKey) {
                          setForm(prev => ({ ...prev, protocol: selectedKey }));
                        }
                      }}
                      variant="bordered"
                      description="该设备作为隧道转发出口节点时使用的传输协议"
                    >
                      <SelectItem key="tls">TLS</SelectItem>
                      <SelectItem key="wss">WSS</SelectItem>
                      <SelectItem key="tcp">TCP</SelectItem>
                      <SelectItem key="mtls">MTLS</SelectItem>
                      <SelectItem key="mwss">MWSS</SelectItem>
                      <SelectItem key="mtcp">MTCP</SelectItem>
                    </Select>
                  )}

                  <Select
                    size="sm"
                    label="所属分组"
                    placeholder="不分组"
                    selectedKeys={[form.singleTunnelGroupId ? form.singleTunnelGroupId.toString() : 'none']}
                    onSelectionChange={(keys) => {
                      const selectedKey = Array.from(keys)[0] as string;
                      setForm(prev => ({ ...prev, singleTunnelGroupId: selectedKey && selectedKey !== 'none' ? parseInt(selectedKey) : null }));
                    }}
                    variant="bordered"
                  >
                    {[
                      <SelectItem key="none">不分组</SelectItem>,
                      ...singleTunnelGroups.map(group => (
                        <SelectItem key={group.id.toString()}>{group.name || `#${group.id}`}</SelectItem>
                      ))
                    ]}
                  </Select>

                  <div className="flex items-center justify-between px-1 py-1">
                    <div>
                      <p className="text-sm font-medium text-foreground">共享给其他用户</p>
                      <p className="text-xs text-default-500">开启后，其他用户在添加转发规则时也可以选用这台设备</p>
                    </div>
                    <Switch size="sm" isSelected={form.shared} onValueChange={(v) => setForm(prev => ({ ...prev, shared: v }))} />
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>取消</Button>
                <Button color="primary" onPress={handleSubmit} isLoading={submitLoading}>确定</Button>
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

      <ConfirmDialog
        isOpen={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="确认删除"
        message={<>确定要删除设备 {groupToDelete?.name} 吗？删除后该设备将无法在转发规则中使用，仍在使用它的规则需要先处理。</>}
        confirmText="确定"
        confirmColor="danger"
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />

      <ConfirmDialog
        isOpen={resetModalOpen}
        onOpenChange={setResetModalOpen}
        title="重置 Token"
        message={<>确定要重置设备 {resetTarget?.name} 的 Token 吗？重置后原有 Token 将立即失效，需要重新在设备上执行安装命令，才能恢复连接。</>}
        confirmText="确定"
        confirmColor="danger"
        onConfirm={confirmResetSecret}
        loading={resetLoading}
      />

      <Modal
        isOpen={groupManageModalOpen}
        onOpenChange={(open) => {
          setGroupManageModalOpen(open);
          if (!open) {
            setGroupNameInput('');
            setGroupEditingId(null);
          }
        }}
        size="lg"
        scrollBehavior="outside"
        backdrop="blur"
        placement="center"
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-lg font-bold">管理分组</h2>
                <p className="text-xs text-default-500 font-normal">这里的分组只属于你自己，其他用户看不到也用不了</p>
              </ModalHeader>
              <ModalBody>
                <div className="flex gap-2">
                  <Input
                    size="sm" autoComplete="off"
                    placeholder="分组名称"
                    value={groupNameInput}
                    onChange={(e) => setGroupNameInput(e.target.value)}
                    variant="bordered"
                    className="flex-1"
                  />
                  <Button color="default" onPress={handleCreateGroup} isLoading={groupSubmitLoading}>
                    {groupEditingId ? '保存' : '添加'}
                  </Button>
                  {groupEditingId && (
                    <Button variant="light" onPress={() => { setGroupEditingId(null); setGroupNameInput(''); }}>
                      取消
                    </Button>
                  )}
                </div>
                <div className="space-y-2 mt-2 max-h-64 overflow-y-auto">
                  {singleTunnelGroups.length === 0 && (
                    <p className="text-small text-default-500">暂无分组</p>
                  )}
                  {singleTunnelGroups.map(group => (
                    <div key={group.id} className="flex items-center justify-between p-2 rounded-lg bg-default-100">
                      <span className="text-small text-foreground">{group.name}（{group.deviceCount} 台设备）</span>
                      <div className="flex gap-2">
                        <Button size="sm" variant="light" onPress={() => handleEditGroupStart(group)}>编辑</Button>
                        <Button size="sm" variant="light" color="danger" onPress={() => handleDeleteGroup(group)}>删除</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={() => setGroupManageModalOpen(false)}>
                  关闭
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
