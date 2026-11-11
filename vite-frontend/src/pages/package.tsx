import { TipButton } from "@/components/tip-button";
import { useState, useEffect, useRef } from "react";
import { ToolbarAddIcon, ToolbarDeleteIcon } from "@/components/toolbar-icons";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Switch } from "@heroui/switch";
import { Checkbox } from "@heroui/checkbox";
import { UploadOutlined } from "@/components/ant-icons";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Spinner } from "@heroui/spinner";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/table";
import toast from 'react-hot-toast';

import { PACKAGE_TYPE_OPTIONS, effectivePackageType, packageTypeLabel, packageDurationLabel } from "@/utils/package-type";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { showApiFailure } from "@/components/error-dialog";
import { EditIcon, DeleteIcon } from "@/components/icons";
import { HelpTooltip } from "@/components/help-tooltip";
import { DayOfMonthPicker } from "@/components/day-of-month-picker";
import {
  createPackagePlan,
  getPackagePlanList,
  updatePackagePlan,
  deletePackagePlan,
  pushPackagePlanUpdate,
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
  type: '',
  groupId: null,
  traffic: 0,
  durationDays: 1,
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
        showApiFailure('获取套餐', plansRes);
      }

      if (groupsRes.code === 0) {
        setGroups(groupsRes.data || []);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
      showApiFailure('加载数据', null);
    } finally {
      setLoading(false);
    }
  };

  const groupName = (groupId: number) => groups.find(g => g.id === groupId)?.name || `#${groupId}`;

  // 校验不通过时不把输入框标红，而是弹出失败提示框（与服务端返回失败时的样式一致，标题带 400）；
  // 按表单从上到下的顺序，一次只提示第一项
  const validateForm = (): boolean => {
    const messages: string[] = [];
    if (!form.name.trim()) messages.push('套餐名称不能为空');
    if (form.price < 0) messages.push('价格不能小于 0');
    if (!form.type) messages.push('请选择套餐类型');
    if ((form.type === 'monthly' || form.type === 'daily') && !(form.durationDays >= 1)) messages.push('时长倍数至少为 1');
    if (!form.groupId) messages.push('请选择分配的用户组');
    if (form.traffic < 0) messages.push('流量不能小于 0');
    if (form.type === 'traffic_stack' && !(form.traffic > 0)) messages.push('可叠加流量包的流量必须大于 0');
    if (form.type !== 'traffic_stack') {
      if (form.maxRules < 0) messages.push('最大规则数不能小于 0');
      if (form.userSpeedLimit < 0) messages.push('用户限速不能小于 0');
    }
    setErrors({});
    if (messages.length > 0) {
      showApiFailure(isEdit ? '套餐更新' : '套餐创建', { code: 400, msg: messages[0] });
      return false;
    }
    return true;
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
      // 旧数据 normal 按有效天数换算成日付 / 不限时流量包；不限时流量包没有时长倍数，切到月付 / 日付时默认 1
      type: effectivePackageType(plan.type, plan.durationDays),
      groupId: plan.groupId,
      traffic: plan.traffic,
      durationDays: plan.durationDays > 0 ? plan.durationDays : 1,
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

  // 推送套餐更新：把套餐的属性推送给持有此套餐的用户，勾选要推送的项
  const [pushTarget, setPushTarget] = useState<PackagePlanItem | null>(null);
  const [pushOptions, setPushOptions] = useState({ flow: false, group: false, rules: false, limits: false });
  const [pushLoading, setPushLoading] = useState(false);

  const handlePush = (plan: PackagePlanItem) => {
    setPushTarget(plan);
    setPushOptions({ flow: false, group: false, rules: false, limits: false });
  };

  const confirmPush = async () => {
    if (!pushTarget) return;
    if (!pushOptions.flow && !pushOptions.group && !pushOptions.rules && !pushOptions.limits) {
      showApiFailure('套餐推送', { code: 400, msg: '请选择要推送的内容' });
      return;
    }
    setPushLoading(true);
    try {
      const res = await pushPackagePlanUpdate({ id: pushTarget.id, ...pushOptions });
      if (res.code === 0) {
        toast.success(res.data > 0 ? `已推送给 ${res.data} 个用户` : '没有持有此套餐的用户');
        setPushTarget(null);
      } else {
        showApiFailure('套餐推送', res);
      }
    } catch (error) {
      console.error('推送失败:', error);
      showApiFailure('套餐推送', null);
    } finally {
      setPushLoading(false);
    }
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
        showApiFailure('套餐删除', res);
      }
    } catch (error) {
      console.error('删除失败:', error);
      showApiFailure('套餐删除', null);
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
        showApiFailure(isEdit ? '套餐更新' : '套餐创建', res);
      }
    } catch (error) {
      console.error('提交失败:', error);
      showApiFailure(isEdit ? '套餐更新' : '套餐创建', null);
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
      if (res.code !== 0) showApiFailure('排序保存', res);
    } catch (error) {
      showApiFailure('排序保存', null);
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
        showApiFailure('套餐删除', res);
      }
    } catch (error) {
      showApiFailure('套餐删除', null);
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
          <h1 className="text-base font-semibold text-foreground">套餐管理</h1>
        </CardHeader>
        <CardBody className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3.5">
            {selectedIds.length > 0 && <Button size="sm" variant="bordered" startContent={<ToolbarDeleteIcon />} onPress={() => setBatchDeleteModalOpen(true)}>批量删除（{selectedIds.length}）</Button>}
            <Button size="sm" variant="bordered" startContent={<ToolbarAddIcon />} onPress={handleAdd}>添加套餐</Button>
            <RefreshButton onRefresh={() => loadData(false)} />
          </div>
          <div className="-mx-4 -mb-4 settings-table-scroll">
            <Table removeWrapper aria-label="套餐列表" selectionMode="multiple" selectedKeys={selectedKeys} onSelectionChange={setSelectedKeys} classNames={{ base: "w-full", table: "w-full management-table-selectable", th: "management-table-heading", td: "management-table-cell" }}>
              <TableHeader>
                <TableColumn className="w-16">排序</TableColumn>
                <TableColumn>名称</TableColumn>
                <TableColumn>类型</TableColumn>
                <TableColumn>分配用户组</TableColumn>
                <TableColumn>可用流量</TableColumn>
                <TableColumn>时长</TableColumn>
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
                    <TableCell>{packageTypeLabel(plan.type, plan.durationDays)}</TableCell>
                    <TableCell>{groupName(plan.groupId)}</TableCell>
                    <TableCell>{plan.traffic > 0 ? `${plan.traffic} GiB` : '不限流量'}</TableCell>
                    <TableCell>{packageDurationLabel(plan.type, plan.durationDays)}</TableCell>
                    <TableCell>{plan.maxRules > 0 ? plan.maxRules : '不限'}</TableCell>
                    <TableCell>{plan.userSpeedLimit > 0 ? `${plan.userSpeedLimit} Mbps` : '不限速'}</TableCell>
                    <TableCell>{formatFlowReset(plan.flowResetTime, plan.flowResetClock)}</TableCell>
                    <TableCell>{plan.price > 0 ? `${plan.price} 元` : '免费'}</TableCell>
                    <TableCell>{plan.hidden === 1 ? '是' : '否'}</TableCell>
                    <TableCell>
                      <div className="flex justify-end items-center gap-1">
                        <TipButton isIconOnly size="sm" variant="flat" onPress={() => handleEdit(plan)} title="编辑"><EditIcon /></TipButton>
                        {/* 可叠加流量包不作为用户的套餐，没有可推送的用户 */}
                        <TipButton isIconOnly size="sm" variant="flat" onPress={() => handlePush(plan)} title="推送更新" isDisabled={effectivePackageType(plan.type, plan.durationDays) === 'traffic_stack'}><UploadOutlined /></TipButton>
                        <TipButton isIconOnly size="sm" variant="flat" color="danger" onPress={() => handleDelete(plan)} title="删除"><DeleteIcon /></TipButton>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </CardBody>
      </Card>

      {/* 添加 / 编辑套餐：与其它对话框一致的紧凑样式，单位以附加框显示在输入框右侧 */}
      <Modal isOpen={modalOpen} onOpenChange={setModalOpen} size="sm" scrollBehavior="outside" backdrop="opaque" placement="center" hideCloseButton classNames={{ base: "max-w-[416px]" }}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{isEdit ? '编辑套餐' : '添加套餐'}</ModalHeader>
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

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">
                      <HelpTooltip content="隐藏后该套餐不会出现在商城列表中，仍可通过兑换码兑换">隐藏</HelpTooltip>
                    </span>
                    <Switch
                      size="sm"
                      aria-label="隐藏"
                      isSelected={form.hidden === 1}
                      onValueChange={(checked) => setForm(prev => ({ ...prev, hidden: checked ? 1 : 0 }))}
                    />
                  </div>

                  <Input labelPlacement="outside-top"
                    size="sm" autoComplete="off"
                    label={<HelpTooltip content="套餐价格，0 为免费">价格</HelpTooltip>}
                    type="number"
                    value={form.price.toString()}
                    onChange={(e) => setForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                    isInvalid={!!errors.price}
                    errorMessage={errors.price}
                    variant="bordered"
                    classNames={{ inputWrapper: 'pr-0 overflow-hidden' }}
                    endContent={<span className="flex h-full items-center border-l-1 border-default-300 bg-default-100 px-3 text-xs font-semibold text-foreground">元</span>}
                  />

                  <Select labelPlacement="outside-top"
                    size="sm"
                    label={<HelpTooltip content={"不限时流量包：覆盖用户组、流量、规则数并清零已用流量，不限时间\n不限时流量包（可叠加）：只把流量加到用户当前的流量额度上，其它不变\n月付 / 日付：按时长倍数顺延到期时间（月付按自然月）"}>类型</HelpTooltip>}
                    selectedKeys={form.type ? [form.type] : []}
                    onSelectionChange={(keys) => {
                      const value = Array.from(keys)[0] as string;
                      if (value) setForm(prev => ({ ...prev, type: value }));
                    }}
                    isInvalid={!!errors.type}
                    errorMessage={errors.type}
                    variant="bordered"
                  >
                    {PACKAGE_TYPE_OPTIONS.map(option => (
                      <SelectItem key={option.key}>{option.label}</SelectItem>
                    ))}
                  </Select>

                  {(form.type === 'monthly' || form.type === 'daily') && (
                    <Input labelPlacement="outside-top"
                      size="sm" autoComplete="off"
                      label={<HelpTooltip content={form.type === 'monthly' ? '购买一次顺延的月数，按自然月计算，从当前到期时间与现在中较晚的一个开始' : '购买一次顺延的天数，从当前到期时间与现在中较晚的一个开始'}>时长倍数</HelpTooltip>}
                      type="number"
                      value={form.durationDays.toString()}
                      onChange={(e) => setForm(prev => ({ ...prev, durationDays: parseInt(e.target.value) || 0 }))}
                      isInvalid={!!errors.durationDays}
                      errorMessage={errors.durationDays}
                      variant="bordered"
                      classNames={{ inputWrapper: 'pr-0 overflow-hidden' }}
                      endContent={<span className="flex h-full items-center border-l-1 border-default-300 bg-default-100 px-3 text-xs font-semibold text-foreground whitespace-nowrap">{form.type === 'monthly' ? '个月' : '天'}</span>}
                    />
                  )}

                  <Select labelPlacement="outside-top" listboxProps={{ emptyContent: <EmptyState compact /> }}
                    size="sm"
                    label={<HelpTooltip content="购买后自动加入的用户组">分配用户组</HelpTooltip>}
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
                    label={<HelpTooltip content="购买后套餐的可用流量，0 为不限流量">流量</HelpTooltip>}
                    type="number"
                    value={form.traffic.toString()}
                    onChange={(e) => setForm(prev => ({ ...prev, traffic: parseInt(e.target.value) || 0 }))}
                    isInvalid={!!errors.traffic}
                    errorMessage={errors.traffic}
                    variant="bordered"
                    classNames={{ inputWrapper: 'pr-0 overflow-hidden' }}
                    endContent={<span className="flex h-full items-center border-l-1 border-default-300 bg-default-100 px-3 text-xs font-semibold text-foreground">GiB</span>}
                  />

                  {/* 可叠加流量包只加流量，规则数、限速、流量重置不生效，不显示 */}
                  {form.type !== 'traffic_stack' && (
                    <>
                      <Input labelPlacement="outside-top"
                        size="sm" autoComplete="off"
                        label={<HelpTooltip content="购买后可创建的最大转发规则数，0 为不限规则数">最大规则数</HelpTooltip>}
                        type="number"
                        value={form.maxRules.toString()}
                        onChange={(e) => setForm(prev => ({ ...prev, maxRules: parseInt(e.target.value) || 0 }))}
                        isInvalid={!!errors.maxRules}
                        errorMessage={errors.maxRules}
                        variant="bordered"
                        classNames={{ inputWrapper: 'pr-0 overflow-hidden' }}
                        endContent={<span className="flex h-full items-center border-l-1 border-default-300 bg-default-100 px-3 text-xs font-semibold text-foreground">条</span>}
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
                        classNames={{ inputWrapper: 'pr-0 overflow-hidden' }}
                        endContent={<span className="flex h-full items-center border-l-1 border-default-300 bg-default-100 px-3 text-xs font-semibold text-foreground">Mbps</span>}
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
                            <p className="pb-1.5 text-sm font-semibold text-foreground">自定义重置日期</p>
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
                    </>
                  )}
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
        title="删除套餐"
        message={<>你确定要删除套餐 {planToDelete?.name} (#{planToDelete?.id}) 吗？</>}
        confirmText="确定"
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />

      <Modal isOpen={pushTarget !== null} onOpenChange={(open) => { if (!open) setPushTarget(null); }} size="sm" backdrop="opaque" placement="center" hideCloseButton classNames={{ base: "max-w-[416px]" }}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>推送套餐更新: {pushTarget?.name} (#{pushTarget?.id})</ModalHeader>
              <ModalBody className="py-0">
                <p className="text-sm text-foreground">将套餐的以下属性，推送给持有此套餐的用户？</p>
                <div className="flex flex-col gap-3 pt-2">
                  <Checkbox size="sm" isSelected={pushOptions.flow} onValueChange={(v) => setPushOptions(prev => ({ ...prev, flow: v }))}>更新可用流量</Checkbox>
                  <Checkbox size="sm" isSelected={pushOptions.group} onValueChange={(v) => setPushOptions(prev => ({ ...prev, group: v }))}>更新用户组</Checkbox>
                  <Checkbox size="sm" isSelected={pushOptions.rules} onValueChange={(v) => setPushOptions(prev => ({ ...prev, rules: v }))}>更新最大规则数</Checkbox>
                  <Checkbox size="sm" isSelected={pushOptions.limits} onValueChange={(v) => setPushOptions(prev => ({ ...prev, limits: v }))}>更新限速</Checkbox>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button size="sm" variant="bordered" className="dialog-btn" onPress={onClose}>取消</Button>
                <Button size="sm" color="primary" className="dialog-btn" onPress={confirmPush} isLoading={pushLoading}>确定</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <ConfirmDialog
        isOpen={batchDeleteModalOpen}
        onOpenChange={setBatchDeleteModalOpen}
        title="删除套餐"
        message={<>你确定要删除选中的 {selectedIds.length} 个套餐吗？</>}
        confirmText="确定"
        onConfirm={handleBatchDelete}
        loading={batchDeleteLoading}
      />
    </div>
  );
}
