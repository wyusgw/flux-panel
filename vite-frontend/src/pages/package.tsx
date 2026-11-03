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
import { HelpTooltip } from "@/components/help-tooltip";
import { FieldLabel } from "@/components/form-field";
import { DayOfMonthPicker } from "@/components/day-of-month-picker";
import {
  createPackagePlan,
  getPackagePlanList,
  updatePackagePlan,
  deletePackagePlan,
  batchDeletePackagePlans,
  reorderPackagePlans,
  getUserGroupList
} from "@/api";
import RefreshButton from "@/components/refresh-button";

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
  flowResetTime?: number;
  flowResetClock?: string;
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
  // 流量重置日：-1 沿用用户当前设置，0 不重置，1-31 每月第几日；用户购买/续费套餐时写入用户
  flowResetTime: number;
  flowResetClock: string;
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
  userSpeedLimit: 0,
  flowResetTime: -1,
  flowResetClock: '00:00'
};

// 下拉里直接列出的每月重置日个数，其余日期以及非 00:00 的重置时刻通过「自定义」设置（与用户管理一致）
const PRESET_RESET_DAYS = 8;

const isCustomReset = (day: number, clock?: string) => day > 0 && (day > PRESET_RESET_DAYS || (!!clock && clock !== '00:00'));

const formatFlowReset = (day?: number, clock?: string) => {
  if (day === undefined || day === null || day < 0) return '沿用用户设置';
  if (day === 0) return '不重置';
  return `每月 ${day} 日${clock && clock !== '00:00' ? ` ${clock}` : ''}`;
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
  const [customReset, setCustomReset] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const [selectedKeys, setSelectedKeys] = useState<any>(new Set([]));
  const [batchDeleteModalOpen, setBatchDeleteModalOpen] = useState(false);
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);
  const draggedIdRef = useRef<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (showLoading = true) => {
    setLoading(showLoading);
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
    if (form.durationDays < 0) newErrors.durationDays = '套餐时长不能小于0';
    if (form.maxRules < 0) newErrors.maxRules = '规则数不能小于0';
    if (form.price < 0) newErrors.price = '价格不能小于0';
    if (form.userSpeedLimit < 0) newErrors.userSpeedLimit = '限速不能小于0';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAdd = () => {
    setIsEdit(false);
    setForm(DEFAULT_FORM);
    setCustomReset(false);
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
      userSpeedLimit: plan.userSpeedLimit ?? 0,
      flowResetTime: plan.flowResetTime ?? -1,
      flowResetClock: plan.flowResetClock || '00:00'
    });
    setCustomReset(isCustomReset(plan.flowResetTime ?? -1, plan.flowResetClock));
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
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-base font-semibold text-foreground">套餐管理</h1>
            <RefreshButton onRefresh={() => loadData(false)} />
          </div>
        </CardHeader>
        <CardBody className="p-4 space-y-3">
          <p className="text-xs text-default-500">管理可供购买的流量套餐</p>
          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.length > 0 && <Button size="sm" color="danger" variant="bordered" onPress={() => setBatchDeleteModalOpen(true)}>批量删除（{selectedIds.length}）</Button>}
            <Button size="sm" variant="bordered" onPress={handleAdd}>添加套餐</Button>
          </div>
          <div className="-mx-4 -mb-4 settings-table-scroll">
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
              <TableColumn>流量重置</TableColumn>
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
                  <TableCell>{plan.traffic > 0 ? `${plan.traffic} GiB` : '不限流量'}</TableCell>
                  <TableCell>{plan.durationDays > 0 ? `${plan.durationDays} 天` : '永久'}</TableCell>
                  <TableCell>{plan.maxRules > 0 ? plan.maxRules : '不限'}</TableCell>
                  <TableCell>{plan.userSpeedLimit > 0 ? `${plan.userSpeedLimit} Mbps` : '不限速'}</TableCell>
                  <TableCell>{formatFlowReset(plan.flowResetTime, plan.flowResetClock)}</TableCell>
                  <TableCell>{plan.price > 0 ? `${plan.price} 元` : '免费'}</TableCell>
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
        </div>
          </CardBody>
      </Card>

      <Modal isOpen={modalOpen} onOpenChange={setModalOpen} size="2xl" scrollBehavior="outside" backdrop="blur" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-base font-semibold">{isEdit ? '编辑套餐' : '添加套餐'}</h2>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <FieldLabel tip="隐藏后该套餐不会出现在商城列表中，仍可通过兑换码兑换">商城隐藏</FieldLabel>
                    <Switch
                      size="sm"
                      aria-label="商城隐藏"
                      isSelected={form.hidden === 1}
                      onValueChange={(checked) => setForm(prev => ({ ...prev, hidden: checked ? 1 : 0 }))}
                    />
                  </div>

                  <Input labelPlacement="outside-top"
                    size="sm" autoComplete="off"
                    label="名称"
                    placeholder="请输入套餐名称"
                    value={form.name}
                    onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                    isInvalid={!!errors.name}
                    errorMessage={errors.name}
                    variant="bordered"
                  />

                  <Select labelPlacement="outside-top" listboxProps={{ emptyContent: <EmptyState compact /> }}
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

                  <Input labelPlacement="outside-top"
                    size="sm" autoComplete="off"
                    label={<HelpTooltip content="购买后套餐的可用流量，0 为不限流量">可用流量</HelpTooltip>}
                    type="number"
                    value={form.traffic.toString()}
                    onChange={(e) => setForm(prev => ({ ...prev, traffic: parseInt(e.target.value) || 0 }))}
                    isInvalid={!!errors.traffic}
                    errorMessage={errors.traffic}
                    variant="bordered"
                    endContent={<span className="px-2 py-0.5 -mr-1 rounded-md bg-default-100 dark:bg-default-50/10 text-default-500 text-xs font-medium">GiB</span>}
                  />

                  <Input labelPlacement="outside-top"
                    size="sm" autoComplete="off"
                    label={<HelpTooltip content="购买后套餐的有效天数，0 为永久有效">有效天数</HelpTooltip>}
                    type="number"
                    value={form.durationDays.toString()}
                    onChange={(e) => setForm(prev => ({ ...prev, durationDays: parseInt(e.target.value) || 0 }))}
                    isInvalid={!!errors.durationDays}
                    errorMessage={errors.durationDays}
                    variant="bordered"
                    endContent={<span className="px-2 py-0.5 -mr-1 rounded-md bg-default-100 dark:bg-default-50/10 text-default-500 text-xs font-medium">天</span>}
                  />

                  <Input labelPlacement="outside-top"
                    size="sm" autoComplete="off"
                    label={<HelpTooltip content="购买后可创建的最大转发规则数，0 为不限规则数">规则数</HelpTooltip>}
                    type="number"
                    value={form.maxRules.toString()}
                    onChange={(e) => setForm(prev => ({ ...prev, maxRules: parseInt(e.target.value) || 0 }))}
                    isInvalid={!!errors.maxRules}
                    errorMessage={errors.maxRules}
                    variant="bordered"
                  />

                  <Input labelPlacement="outside-top"
                    size="sm" autoComplete="off"
                    label={<HelpTooltip content="套餐价格，0 为免费">价格</HelpTooltip>}
                    type="number"
                    value={form.price.toString()}
                    onChange={(e) => setForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                    isInvalid={!!errors.price}
                    errorMessage={errors.price}
                    variant="bordered"
                    endContent={<span className="px-2 py-0.5 -mr-1 rounded-md bg-default-100 dark:bg-default-50/10 text-default-500 text-xs font-medium">元</span>}
                  />

                  <Input labelPlacement="outside-top"
                    size="sm" autoComplete="off"
                    label={<HelpTooltip content="该套餐用户的限速，0 为不限速，不同转发规则的限速可叠加">用户限速</HelpTooltip>}
                    type="number"
                    value={form.userSpeedLimit.toString()}
                    onChange={(e) => setForm(prev => ({ ...prev, userSpeedLimit: parseInt(e.target.value) || 0 }))}
                    isInvalid={!!errors.userSpeedLimit}
                    errorMessage={errors.userSpeedLimit}
                    variant="bordered"
                    endContent={<span className="px-2 py-0.5 -mr-1 rounded-md bg-default-100 dark:bg-default-50/10 text-default-500 text-xs font-medium">Mbps</span>}
                  />

                  <Select labelPlacement="outside-top" listboxProps={{ emptyContent: <EmptyState compact /> }}
                    size="sm"
                    label={<HelpTooltip content="用户购买或续费该套餐时，会把这里的流量重置设置写入该用户；选择「沿用用户设置」则不修改用户原有的重置设置">流量重置</HelpTooltip>}
                    selectedKeys={[customReset ? 'custom' : form.flowResetTime < 0 ? 'inherit' : form.flowResetTime.toString()]}
                    onSelectionChange={(keys) => {
                      const value = Array.from(keys)[0] as string;
                      if (!value) return;
                      if (value === 'custom') {
                        // 选择「自定义」：沿用当前已选的重置日（原先是「沿用」或「不重置」则默认每月 1 日），重置时刻由下方输入框决定
                        setCustomReset(true);
                        setForm(prev => ({ ...prev, flowResetTime: prev.flowResetTime > 0 ? prev.flowResetTime : 1 }));
                      } else {
                        // 选择固定的每月几号、「不重置」或「沿用用户设置」：重置时刻恢复为默认 0 点
                        setCustomReset(false);
                        setForm(prev => ({ ...prev, flowResetTime: value === 'inherit' ? -1 : Number(value), flowResetClock: '00:00' }));
                      }
                    }}
                    variant="bordered"
                  >
                    <>
                      <SelectItem key="inherit" textValue="沿用用户设置">沿用用户设置</SelectItem>
                      <SelectItem key="0" textValue="不重置">不重置</SelectItem>
                      <SelectItem key="custom" textValue="自定义">自定义</SelectItem>
                      {Array.from({ length: PRESET_RESET_DAYS }, (_, i) => i + 1).map(day => (
                        <SelectItem key={day.toString()} textValue={`每月${day}号`}>每月{day}号</SelectItem>
                      ))}
                    </>
                  </Select>

                  {customReset && (
                    <>
                      <div>
                        <p className="pb-1.5 text-small font-medium text-foreground">自定义重置日期</p>
                        <DayOfMonthPicker
                          size="sm"
                          value={String(form.flowResetTime)}
                          onChange={(value) => setForm(prev => ({ ...prev, flowResetTime: Number(value) }))}
                        />
                      </div>
                      <Input labelPlacement="outside-top"
                        size="sm" autoComplete="off"
                        label="自定义重置时刻"
                        type="time"
                        value={form.flowResetClock}
                        onChange={(e) => setForm(prev => ({ ...prev, flowResetClock: e.target.value || '00:00' }))}
                        variant="bordered"
                      />
                    </>
                  )}

                </div>
              </ModalBody>
              <ModalFooter>
                <Button size="sm" variant="bordered" onPress={onClose}>取消</Button>
                <Button size="sm" color="primary" onPress={handleSubmit} isLoading={submitLoading}>
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
