import { useState, useEffect, useRef } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Spinner } from "@heroui/spinner";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/table";
import toast from 'react-hot-toast';

import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TipButton } from "@/components/tip-button";
import { EditIcon, DeleteIcon } from "@/components/icons";
import { InfoCircleFilled, QuestionCircleOutlined } from "@/components/ant-icons";
import { ToolbarAddIcon } from "@/components/toolbar-icons";

const DragHandleIcon = () => (
  <svg className="w-4 h-4 text-default-400" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
  </svg>
);

interface GroupItem {
  id: number;
  name: string;
  sort: number;
  [key: string]: any;
}

export interface SimpleGroupPageProps {
  /** 如「用户组」「节点组」 */
  label: string;
  /** 数量列的表头，如「用户数量」 */
  countLabel: string;
  /** 数量字段名，如 userCount */
  countKey: string;
  /** 「查看说明」弹窗里的说明，每条前面自动加编号 */
  help: string[];
  api: {
    list: () => Promise<any>;
    create: (data: any) => Promise<any>;
    update: (data: any) => Promise<any>;
    remove: (id: number) => Promise<any>;
    reorder: (groups: Array<{ id: number; sort: number }>) => Promise<any>;
  };
}

/** 用户组管理、节点组管理共用的列表页：排序、添加（可指定 ID）、编辑名称、删除 */
export function SimpleGroupPage({ label, countLabel, countKey, help, api }: SimpleGroupPageProps) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupItem[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [editing, setEditing] = useState<GroupItem | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<GroupItem | null>(null);

  const [form, setForm] = useState({ id: '', name: '' });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const draggedIdRef = useRef<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (showLoading = true) => {
    setLoading(showLoading);
    try {
      const res = await api.list();
      if (res.code === 0) {
        setGroups(res.data || []);
      } else {
        toast.error(res.msg || `获取${label}失败`);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const groupText = (group: GroupItem) => `${group.name || ''} (#${group.id})`.trim();

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    if (!editing && form.id.trim() && !/^[1-9]\d{0,17}$/.test(form.id.trim())) {
      newErrors.id = `${label} ID 必须是正整数`;
    }
    if (!form.name.trim()) {
      newErrors.name = `请输入${label}名称`;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAdd = () => {
    setEditing(null);
    setForm({ id: '', name: '' });
    setErrors({});
    setModalOpen(true);
  };

  const handleEdit = (group: GroupItem) => {
    setEditing(group);
    setForm({ id: String(group.id), name: group.name });
    setErrors({});
    setModalOpen(true);
  };

  const handleDelete = (group: GroupItem) => {
    setGroupToDelete(group);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!groupToDelete) return;

    setDeleteLoading(true);
    try {
      const res = await api.remove(groupToDelete.id);
      if (res.code === 0) {
        toast.success('删除成功');
        setDeleteModalOpen(false);
        loadData();
      } else {
        toast.error(res.msg || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      toast.error('删除失败');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitLoading(true);
    try {
      let res;
      if (editing) {
        res = await api.update({ id: editing.id, name: form.name.trim() });
      } else {
        const customId = form.id.trim();
        res = await api.create({ ...(customId ? { id: Number(customId) } : {}), name: form.name.trim() });
      }

      if (res.code === 0) {
        toast.success(editing ? '修改成功' : '创建成功');
        setModalOpen(false);
        loadData();
      } else {
        toast.error(res.msg || '操作失败');
      }
    } catch (error) {
      console.error('提交失败:', error);
      toast.error('操作失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleRowDrop = async (targetId: number) => {
    const draggedId = draggedIdRef.current;
    draggedIdRef.current = null;
    if (draggedId === null || draggedId === targetId) return;

    const fromIndex = groups.findIndex(g => g.id === draggedId);
    const toIndex = groups.findIndex(g => g.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...groups];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setGroups(reordered);

    try {
      const res = await api.reorder(reordered.map((g, index) => ({ id: g.id, sort: index })));
      if (res.code !== 0) toast.error(res.msg || '排序保存失败');
    } catch (error) {
      toast.error('排序保存失败');
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
          <h1 className="text-base font-semibold text-foreground">{label}管理</h1>
        </CardHeader>
        <CardBody className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3.5">
            <Button size="sm" variant="bordered" startContent={<ToolbarAddIcon />} onPress={handleAdd}>添加{label}</Button>
            <Button size="sm" variant="bordered" startContent={<QuestionCircleOutlined />} onPress={() => setHelpOpen(true)}>查看说明</Button>
          </div>
          <div className="settings-table-scroll">
            <Table removeWrapper aria-label={`${label}列表`} classNames={{ base: "w-full", table: "w-full min-w-[600px] table-fixed", th: "management-table-heading", td: "management-table-cell" }}>
              <TableHeader>
                <TableColumn className="w-16">排序</TableColumn>
                <TableColumn className="w-40">{label} ID</TableColumn>
                <TableColumn>名称</TableColumn>
                <TableColumn className="w-40">{countLabel}</TableColumn>
                <TableColumn align="end" className="w-32 text-right">操作</TableColumn>
              </TableHeader>
              <TableBody emptyContent={<EmptyState />}>
                {groups.map(group => (
                  <TableRow key={group.id} onDragOver={(e: React.DragEvent) => e.preventDefault()} onDrop={() => handleRowDrop(group.id)}>
                    <TableCell><span draggable className="cursor-grab active:cursor-grabbing inline-flex" onDragStart={() => { draggedIdRef.current = group.id; }}><DragHandleIcon /></span></TableCell>
                    <TableCell>{group.id}</TableCell>
                    <TableCell className="font-medium">{group.name || `#${group.id}`}</TableCell>
                    <TableCell>{group[countKey] ?? 0}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <TipButton isIconOnly size="sm" variant="flat" onPress={() => handleEdit(group)} title="编辑"><EditIcon /></TipButton>
                        <TipButton isIconOnly size="sm" variant="flat" onPress={() => handleDelete(group)} title="删除"><DeleteIcon /></TipButton>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardBody>
      </Card>

      <Modal isOpen={modalOpen} onOpenChange={setModalOpen} size="sm" placement="center" backdrop="opaque" hideCloseButton classNames={{ base: "max-w-[416px]" }}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{editing ? `编辑${label} ${groupText(editing)}` : `添加${label}`}</ModalHeader>
              <ModalBody className="gap-3 py-0">
                {!editing && (
                  <Input labelPlacement="outside-top"
                    size="sm" autoComplete="off" inputMode="numeric"
                    label={`${label} ID（留空自动生成）`}
                    placeholder="留空则自动生成"
                    value={form.id}
                    onChange={(e) => setForm(prev => ({ ...prev, id: e.target.value }))}
                    isInvalid={!!errors.id}
                    errorMessage={errors.id}
                    variant="bordered"
                  />
                )}
                <Input labelPlacement="outside-top"
                  size="sm" autoComplete="off"
                  label="名称"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  isInvalid={!!errors.name}
                  errorMessage={errors.name}
                  variant="bordered"
                />
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
        title={`删除${label}`}
        message={<>你确定要删除{label} {groupToDelete ? groupText(groupToDelete) : ''} 吗？</>}
        confirmText="确定"
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />

      <Modal isOpen={helpOpen} onOpenChange={setHelpOpen} size="lg" placement="center" backdrop="opaque" hideCloseButton classNames={{ base: "max-w-[600px]" }}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center gap-[11px]">
                <InfoCircleFilled className="w-[22px] h-[22px] flex-shrink-0 text-primary" />
                {label}说明
              </ModalHeader>
              <ModalBody className="py-0">
                <ol className="text-sm text-foreground space-y-[13px] leading-relaxed pl-[33px]">
                  {help.map((text, index) => <li key={index}>{index + 1}. {text}</li>)}
                </ol>
              </ModalBody>
              <ModalFooter>
                <Button size="sm" color="primary" className="dialog-btn" onPress={onClose}>知道了</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
