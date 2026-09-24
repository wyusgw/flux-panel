import { useState, useEffect, useRef } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Switch } from "@heroui/switch";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Spinner } from "@heroui/spinner";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/table";
import toast from 'react-hot-toast';

import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EditIcon, DeleteIcon } from "@/components/icons";
import {
  createPackagePlan,
  getPackagePlanList,
  updatePackagePlan,
  deletePackagePlan,
  batchDeletePackagePlans,
  reorderPackagePlans,
  getUserGroupList
} from "@/api";

const DragHandleIcon = () => (
  <svg className="w-4 h-4 text-default-400" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
  </svg>
);

interface PackagePlanItem {
  id: number;
  name: string;
  type: string;
  groupId: number;
  traffic: number;
  durationDays: number;
  maxRules: number;
  price: number;
  hidden: number;
  sort: number;
  userSpeedLimit: number;
}

interface UserGroupItem {
  id: number;
  name: string;
}

interface PackagePlanForm {
  id?: number;
  name: string;
  type: string;
  groupId: number | null;
  traffic: number;
  durationDays: number;
  maxRules: number;
  price: number;
  hidden: number;
  userSpeedLimit: number;
}

const DEFAULT_FORM: PackagePlanForm = {
  name: '',
  type: 'normal',
  groupId: null,
  traffic: 0,
  durationDays: 0,
  maxRules: 0,
  price: 0,
  hidden: 0,
  userSpeedLimit: 0
};

export default function PackagePlanPage() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<PackagePlanItem[]>([]);
  const [groups, setGroups] = useState<UserGroupItem[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<PackagePlanItem | null>(null);

  const [form, setForm] = useState<PackagePlanForm>(DEFAULT_FORM);
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
      const [plansRes, groupsRes] = await Promise.all([
        getPackagePlanList(),
        getUserGroupList()
      ]);

      if (plansRes.code === 0) {
        setPlans(plansRes.data || []);
      } else {
        toast.error(plansRes.msg || '获取套餐失败');
      }

      if (groupsRes.code === 0) {
        setGroups(groupsRes.data || []);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const groupName = (groupId: number) => groups.find(g => g.id === groupId)?.name || `#${groupId}`;

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    if (!form.name.trim()) newErrors.name = '请输入套餐名称';
    if (!form.groupId) newErrors.groupId = '请选择分配的用户组';
    if (form.traffic < 0) newErrors.traffic = '可用流量不能小于0';
    if (form.maxRules < 0) newErrors.maxRules = '规则数不能小于0';
    if (form.price < 0) newErrors.price = '价格不能小于0';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAdd = () => {
    setIsEdit(false);
    setForm(DEFAULT_FORM);
    setErrors({});
    setModalOpen(true);
  };

  const handleEdit = (plan: PackagePlanItem) => {
    setIsEdit(true);
    setForm({
      id: plan.id,
      name: plan.name,
      type: plan.type,
      groupId: plan.groupId,
      traffic: plan.traffic,
      durationDays: plan.durationDays,
      maxRules: plan.maxRules,
      price: plan.price,
      hidden: plan.hidden,
      userSpeedLimit: plan.userSpeedLimit ?? 0
    });
    setErrors({});
    setModalOpen(true);
  };

  const handleDelete = (plan: PackagePlanItem) => {
    setPlanToDelete(plan);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!planToDelete) return;

    setDeleteLoading(true);
    try {
      const res = await deletePackagePlan(planToDelete.id);
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
      const res = isEdit ? await updatePackagePlan(form) : await createPackagePlan(form);

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

    const fromIndex = plans.findIndex(p => p.id === draggedId);
    const toIndex = plans.findIndex(p => p.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...plans];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setPlans(reordered);

    try {
      const res = await reorderPackagePlans(reordered.map((p, index) => ({ id: p.id, sort: index })));
      if (res.code !== 0) toast.error(res.msg || '排序保存失败');
    } catch (error) {
      toast.error('排序保存失败');
    }
  };

  const selectedIds = selectedKeys === 'all' ? plans.map(p => p.id) : Array.from(selectedKeys as Set<any>).map(Number);

  const handleBatchDelete = async () => {
    setBatchDeleteLoading(true);
    try {
      const res = await batchDeletePackagePlans(selectedIds);
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
          <div><h1 className="text-base font-semibold text-foreground">套餐管理</h1><p className="mt-1 text-xs text-default-500">管理可供购买的流量套餐</p></div>
          <div className="flex gap-2">
            {selectedIds.length > 0 && <Button size="sm" color="danger" variant="flat" onPress={() => setBatchDeleteModalOpen(true)}>批量删除（{selectedIds.length}）</Button>}
            <Button size="sm" variant="bordered" onPress={loadData} isLoading={loading}>刷新</Button>
            <Button size="sm" color="default" onPress={handleAdd}>添加套餐</Button>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table removeWrapper aria-label="套餐列表" selectionMode="multiple" selectedKeys={selectedKeys} onSelectionChange={setSelectedKeys} classNames={{ base: "w-full", table: "w-full management-table-selectable", th: "management-table-heading", td: "management-table-cell" }}>
            <TableHeader>
              <TableColumn className="w-16">排序</TableColumn>
              <TableColumn>名称</TableColumn>
              <TableColumn>类型</TableColumn>
              <TableColumn>分配用户组</TableColumn>
              <TableColumn>可用流量</TableColumn>
              <TableColumn>有效期</TableColumn>
              <TableColumn>规则数</TableColumn>
              <TableColumn>用户限速</TableColumn>
              <TableColumn>价格</TableColumn>
              <TableColumn>隐藏</TableColumn>
              <TableColumn align="end">操作</TableColumn>
            </TableHeader>
            <TableBody emptyContent={<EmptyState />}>
              {plans.map(plan => (
                <TableRow key={plan.id} onDragOver={(e: React.DragEvent) => e.preventDefault()} onDrop={() => handleRowDrop(plan.id)}>
                  <TableCell><span draggable className="cursor-grab active:cursor-grabbing inline-flex" onDragStart={() => { draggedIdRef.current = plan.id; }}><DragHandleIcon /></span></TableCell>
                  <TableCell className="font-medium">{plan.name}（#{plan.id}）</TableCell>
                  <TableCell>{plan.type}</TableCell>
                  <TableCell>{groupName(plan.groupId)}</TableCell>
                  <TableCell>{plan.traffic} GiB</TableCell>
                  <TableCell>{plan.durationDays > 0 ? `${plan.durationDays} 天` : '永久'}</TableCell>
                  <TableCell>{plan.maxRules}</TableCell>
                  <TableCell>{plan.userSpeedLimit > 0 ? `${plan.userSpeedLimit} Mbps` : '不限速'}</TableCell>
                  <TableCell>{plan.price} 元</TableCell>
                  <TableCell>{plan.hidden === 1 ? '是' : '否'}</TableCell>
                  <TableCell>
                    <div className="flex justify-end items-center gap-1">
                      <Button isIconOnly size="sm" variant="flat" onPress={() => handleEdit(plan)} title="编辑"><EditIcon className="w-4 h-4" /></Button>
                      <Button isIconOnly size="sm" variant="flat" color="danger" onPress={() => handleDelete(plan)} title="删除"><DeleteIcon className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      <Modal isOpen={modalOpen} onOpenChange={setModalOpen} size="2xl" scrollBehavior="outside" backdrop="blur" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-xl font-bold">{isEdit ? '编辑套餐' : '添加套餐'}</h2>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    size="sm" autoComplete="off"
                    label="名称"
                    placeholder="请输入套餐名称"
                    value={form.name}
                    onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                    isInvalid={!!errors.name}
                    errorMessage={errors.name}
                    variant="bordered"
                  />

                  <Select
                    size="sm"
                    label="分配用户组"
                    placeholder="购买后自动加入的用户组"
                    selectedKeys={form.groupId ? [form.groupId.toString()] : []}
                    onSelectionChange={(keys) => {
                      const selectedKey = Array.from(keys)[0] as string;
                      setForm(prev => ({ ...prev, groupId: selectedKey ? parseInt(selectedKey) : null }));
                    }}
                    isInvalid={!!errors.groupId}
                    errorMessage={errors.groupId}
                    variant="bordered"
                  >
                    {groups.map((group) => (
                      <SelectItem key={group.id}>{group.name || `#${group.id}`}</SelectItem>
                    ))}
                  </Select>

                  <Input
                    size="sm" autoComplete="off"
                    label="可用流量"
                    type="number"
                    value={form.traffic.toString()}
                    onChange={(e) => setForm(prev => ({ ...prev, traffic: parseInt(e.target.value) || 0 }))}
                    isInvalid={!!errors.traffic}
                    errorMessage={errors.traffic}
                    variant="bordered"
                    endContent={<span className="px-2 py-0.5 -mr-1 rounded-md bg-default-100 dark:bg-default-50/10 text-default-500 text-xs font-medium">GiB</span>}
                  />

                  <Input
                    size="sm" autoComplete="off"
                    label="有效天数"
                    type="number"
                    value={form.durationDays.toString()}
                    onChange={(e) => setForm(prev => ({ ...prev, durationDays: parseInt(e.target.value) || 0 }))}
                    variant="bordered"
                    description="购买后套餐的有效天数，0 为永久有效"
                    endContent={<span className="px-2 py-0.5 -mr-1 rounded-md bg-default-100 dark:bg-default-50/10 text-default-500 text-xs font-medium">天</span>}
                  />

                  <Input
                    size="sm" autoComplete="off"
                    label="规则数"
                    type="number"
                    value={form.maxRules.toString()}
                    onChange={(e) => setForm(prev => ({ ...prev, maxRules: parseInt(e.target.value) || 0 }))}
                    isInvalid={!!errors.maxRules}
                    errorMessage={errors.maxRules}
                    variant="bordered"
                  />

                  <Input
                    size="sm" autoComplete="off"
                    label="价格"
                    type="number"
                    value={form.price.toString()}
                    onChange={(e) => setForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                    isInvalid={!!errors.price}
                    errorMessage={errors.price}
                    variant="bordered"
                    endContent={<span className="px-2 py-0.5 -mr-1 rounded-md bg-default-100 dark:bg-default-50/10 text-default-500 text-xs font-medium">元</span>}
                  />

                  <Input
                    size="sm" autoComplete="off"
                    label="用户限速"
                    type="number"
                    value={form.userSpeedLimit.toString()}
                    onChange={(e) => setForm(prev => ({ ...prev, userSpeedLimit: parseInt(e.target.value) || 0 }))}
                    variant="bordered"
                    description="该套餐用户的限速，0 为不限速，不同转发规则的限速可叠加"
                    endContent={<span className="px-2 py-0.5 -mr-1 rounded-md bg-default-100 dark:bg-default-50/10 text-default-500 text-xs font-medium">Mbps</span>}
                  />

                  <div className="flex items-center justify-between">
                    <span className="text-small text-foreground">在商城隐藏</span>
                    <Switch
                      isSelected={form.hidden === 1}
                      onValueChange={(checked) => setForm(prev => ({ ...prev, hidden: checked ? 1 : 0 }))}
                    />
                  </div>
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
        message={<>你确定要删除套餐 {planToDelete?.name} 吗？此操作无法撤销，删除后该套餐将永久消失。</>}
        confirmText="确定"
        confirmColor="danger"
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />

      <ConfirmDialog
        isOpen={batchDeleteModalOpen}
        onOpenChange={setBatchDeleteModalOpen}
        title="批量删除"
        message={<>你确定要删除选中的 {selectedIds.length} 个套餐吗？此操作无法撤销。</>}
        confirmText="确定"
        confirmColor="danger"
        onConfirm={handleBatchDelete}
        loading={batchDeleteLoading}
      />
    </div>
  );
}
