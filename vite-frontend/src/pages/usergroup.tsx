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
import {
  createUserGroup,
  getUserGroupList,
  updateUserGroup,
  deleteUserGroup,
  batchDeleteUserGroups,
  reorderUserGroups
} from "@/api";

const DragHandleIcon = () => (
  <svg className="w-4 h-4 text-default-400" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
  </svg>
);

interface UserGroupItem {
  id: number;
  name: string;
  sort: number;
  userCount: number;
}

interface UserGroupForm {
  id?: number;
  name: string;
}

export default function UserGroupPage() {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<UserGroupItem[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<UserGroupItem | null>(null);

  const [form, setForm] = useState<UserGroupForm>({ name: '' });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const [selectedKeys, setSelectedKeys] = useState<any>(new Set([]));
  const [batchDeleteModalOpen, setBatchDeleteModalOpen] = useState(false);
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);
  const draggedIdRef = useRef<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getUserGroupList();
      if (res.code === 0) {
        setGroups(res.data || []);
      } else {
        toast.error(res.msg || '获取用户组失败');
      }
    } catch (error) {
      console.error('加载数据失败:', error);
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    if (!form.name.trim()) {
      newErrors.name = '请输入用户组名称';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAdd = () => {
    setIsEdit(false);
    setForm({ name: '' });
    setErrors({});
    setModalOpen(true);
  };

  const handleEdit = (group: UserGroupItem) => {
    setIsEdit(true);
    setForm({ id: group.id, name: group.name });
    setErrors({});
    setModalOpen(true);
  };

  const handleDelete = (group: UserGroupItem) => {
    setGroupToDelete(group);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!groupToDelete) return;

    setDeleteLoading(true);
    try {
      const res = await deleteUserGroup(groupToDelete.id);
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
      if (isEdit) {
        res = await updateUserGroup(form);
      } else {
        res = await createUserGroup({ name: form.name });
      }

      if (res.code === 0) {
        toast.success(isEdit ? '修改成功' : '创建成功');
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
      const res = await reorderUserGroups(reordered.map((g, index) => ({ id: g.id, sort: index })));
      if (res.code !== 0) toast.error(res.msg || '排序保存失败');
    } catch (error) {
      toast.error('排序保存失败');
    }
  };

  const selectedIds = selectedKeys === 'all' ? groups.map(g => g.id) : Array.from(selectedKeys as Set<any>).map(Number);

  const handleBatchDelete = async () => {
    setBatchDeleteLoading(true);
    try {
      const res = await batchDeleteUserGroups(selectedIds);
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
          <div><h1 className="text-base font-semibold text-foreground">用户组管理</h1><p className="mt-1 text-xs text-default-500">管理用户分组与分组内用户数量</p></div>
          <div className="flex gap-2">
            {selectedIds.length > 0 && <Button size="sm" color="danger" variant="flat" onPress={() => setBatchDeleteModalOpen(true)}>批量删除（{selectedIds.length}）</Button>}
            <Button size="sm" variant="bordered" onPress={loadData} isLoading={loading}>刷新</Button>
            <Button size="sm" color="default" onPress={handleAdd}>添加用户组</Button>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table removeWrapper aria-label="用户组列表" selectionMode="multiple" selectedKeys={selectedKeys} onSelectionChange={setSelectedKeys} classNames={{ base: "w-full", table: "w-full table-fixed management-table-selectable", th: "management-table-heading", td: "management-table-cell" }}>
            <TableHeader><TableColumn className="w-28">UID</TableColumn><TableColumn>名称</TableColumn><TableColumn className="w-40">用户数量</TableColumn><TableColumn className="w-16">排序</TableColumn><TableColumn align="end" className="w-44 text-right">操作</TableColumn></TableHeader>
            <TableBody emptyContent={<EmptyState />}>
              {groups.map(group => <TableRow key={group.id} onDragOver={(e: React.DragEvent) => e.preventDefault()} onDrop={() => handleRowDrop(group.id)}><TableCell>#{group.id}</TableCell><TableCell className="font-medium">{group.name || `#${group.id}`}</TableCell><TableCell>{group.userCount}</TableCell><TableCell><span draggable className="cursor-grab active:cursor-grabbing inline-flex" onDragStart={() => { draggedIdRef.current = group.id; }}><DragHandleIcon /></span></TableCell><TableCell><div className="flex justify-end gap-2"><Button size="sm" variant="flat" onPress={() => handleEdit(group)}>编辑</Button><Button size="sm" variant="light" color="danger" onPress={() => handleDelete(group)}>删除</Button></div></TableCell></TableRow>)}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      <Modal isOpen={modalOpen} onOpenChange={setModalOpen} size="lg" scrollBehavior="outside" backdrop="blur" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-xl font-bold">{isEdit ? '编辑用户组' : '添加用户组'}</h2>
              </ModalHeader>
              <ModalBody>
                <Input
                  size="sm" autoComplete="off"
                  label="名称"
                  placeholder="请输入用户组名称"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  isInvalid={!!errors.name}
                  errorMessage={errors.name}
                  variant="bordered"
                />
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
        message={<>你确定要删除用户组 {groupToDelete?.name || `#${groupToDelete?.id}`} 吗？删除用户组不会对已分配的用户产生实际影响。</>}
        confirmText="确定"
        confirmColor="danger"
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />

      <ConfirmDialog
        isOpen={batchDeleteModalOpen}
        onOpenChange={setBatchDeleteModalOpen}
        title="批量删除"
        message={<>你确定要删除选中的 {selectedIds.length} 个用户组吗？删除用户组不会对已分配的用户产生实际影响。</>}
        confirmText="确定"
        confirmColor="danger"
        onConfirm={handleBatchDelete}
        loading={batchDeleteLoading}
      />
    </div>
  );
}
