import { useState, useEffect } from "react";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell
} from "@heroui/table";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import toast from 'react-hot-toast';

import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  batchCreateRedeemCodes,
  getRedeemCodeList,
  deleteRedeemCode,
  getPackagePlanList
} from "@/api";

type RedeemType = 'discount' | 'package' | 'balance';

interface RedeemCodeItem {
  id: number;
  code: string;
  type: RedeemType;
  packageId: number | null;
  packageName: string | null;
  discountRatio: number | null;
  amount: number | null;
  usesRemaining: number;
}

interface PackagePlanItem {
  id: number;
  name: string;
}

interface BatchForm {
  type: RedeemType;
  packageId: number | null;
  discountRatio: number;
  amount: string;
  usesRemaining: number;
  codesText: string;
}

const DEFAULT_FORM: BatchForm = {
  type: 'discount',
  packageId: null,
  discountRatio: 100,
  amount: '',
  usesRemaining: 1,
  codesText: ''
};

const TYPE_OPTIONS: { key: RedeemType; label: string }[] = [
  { key: 'discount', label: '折扣兑换（按比例购买套餐）' },
  { key: 'package', label: '兑换套餐（免费获得套餐）' },
  { key: 'balance', label: '兑换余额（直接到账钱包）' }
];

const getTypeLabel = (type: RedeemType) => {
  switch (type) {
    case 'package': return '兑换套餐';
    case 'balance': return '兑换余额';
    default: return '折扣兑换';
  }
};

const getTypeColor = (type: RedeemType): 'default' | 'success' | 'warning' => {
  switch (type) {
    case 'package': return 'success';
    case 'balance': return 'warning';
    default: return 'default';
  }
};

export default function RedeemCodePage() {
  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState<RedeemCodeItem[]>([]);
  const [plans, setPlans] = useState<PackagePlanItem[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [codeToDelete, setCodeToDelete] = useState<RedeemCodeItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [form, setForm] = useState<BatchForm>(DEFAULT_FORM);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [codesRes, plansRes] = await Promise.all([
        getRedeemCodeList(),
        getPackagePlanList()
      ]);

      if (codesRes.code === 0) {
        setCodes(codesRes.data || []);
      } else {
        toast.error(codesRes.msg || '获取兑换码失败');
      }

      if (plansRes.code === 0) {
        setPlans(plansRes.data || []);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setForm(DEFAULT_FORM);
    setErrors({});
    setModalOpen(true);
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    if (form.type === 'discount' || form.type === 'package') {
      if (!form.packageId) newErrors.packageId = '请选择套餐';
      if (form.type === 'discount' && (form.discountRatio < 1 || form.discountRatio > 100)) {
        newErrors.discountRatio = '折扣比例需在1-100之间';
      }
    } else {
      const amountNum = Number(form.amount);
      if (form.amount === '' || Number.isNaN(amountNum) || amountNum <= 0) {
        newErrors.amount = '请填写正确的到账金额';
      }
    }
    if (form.usesRemaining < 1) newErrors.usesRemaining = '可用次数至少为1';
    if (!form.codesText.trim()) newErrors.codesText = '请输入兑换代码';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    const codesList = form.codesText
      .split('\n')
      .map(c => c.trim())
      .filter(c => c);

    setSubmitLoading(true);
    try {
      const res = await batchCreateRedeemCodes({
        type: form.type,
        packageId: form.type === 'balance' ? null : form.packageId,
        discountRatio: form.type === 'discount' ? form.discountRatio : undefined,
        amount: form.type === 'balance' ? Number(form.amount) : undefined,
        usesRemaining: form.usesRemaining,
        codes: codesList
      });
      if (res.code === 0) {
        toast.success('创建成功');
        setModalOpen(false);
        loadData();
      } else {
        toast.error(res.msg || '创建失败');
      }
    } catch (error) {
      toast.error('创建失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = (code: RedeemCodeItem) => {
    setCodeToDelete(code);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!codeToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await deleteRedeemCode(codeToDelete.id);
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

  const renderContent = (code: RedeemCodeItem) => {
    if (code.type === 'balance') {
      return `${code.amount ?? 0} 元`;
    }
    if (code.type === 'package') {
      return `${code.packageName || '未知套餐'} · 免费`;
    }
    return `${code.packageName || '未知套餐'} · ${code.discountRatio ?? 0}%`;
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex-1" />
        <Button size="sm" variant="flat" color="default" onPress={handleAdd}>
          批量添加兑换码
        </Button>
      </div>

      <Card className="shadow-sm border border-gray-200 dark:border-gray-700">
        <CardBody className="p-0">
          <Table
            aria-label="兑换码列表"
            classNames={{
              wrapper: "shadow-none",
              th: "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium"
            }}
          >
            <TableHeader>
              <TableColumn>代码</TableColumn>
              <TableColumn>类型</TableColumn>
              <TableColumn>内容</TableColumn>
              <TableColumn>剩余次数</TableColumn>
              <TableColumn>操作</TableColumn>
            </TableHeader>
            <TableBody items={codes} emptyContent={<EmptyState />}>
              {(code: RedeemCodeItem) => (
                <TableRow key={code.id}>
                  <TableCell>
                    <span className="font-mono text-xs">{code.code}</span>
                  </TableCell>
                  <TableCell>
                    <Chip color={getTypeColor(code.type)} size="sm" variant="flat">{getTypeLabel(code.type)}</Chip>
                  </TableCell>
                  <TableCell>{renderContent(code)}</TableCell>
                  <TableCell>
                    <Chip color={code.usesRemaining > 0 ? 'success' : 'default'} size="sm" variant="flat">
                      {code.usesRemaining}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="flat" color="danger" onPress={() => handleDelete(code)}>
                      删除
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      <Modal isOpen={modalOpen} onOpenChange={setModalOpen} size="md" scrollBehavior="outside" backdrop="blur" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                <h2 className="text-lg font-bold">批量添加兑换码</h2>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-3 pb-4">
                  <Select
                    size="sm"
                    label="兑换类型"
                    selectedKeys={[form.type]}
                    onSelectionChange={(keys) => {
                      const selectedKey = Array.from(keys)[0] as RedeemType;
                      if (selectedKey) setForm(prev => ({ ...prev, type: selectedKey }));
                    }}
                    variant="bordered"
                    disallowEmptySelection
                  >
                    {TYPE_OPTIONS.map(opt => (
                      <SelectItem key={opt.key}>{opt.label}</SelectItem>
                    ))}
                  </Select>

                  {form.type !== 'balance' && (
                    <Select
                      size="sm"
                      label="套餐"
                      placeholder="请选择兑换码对应的套餐"
                      selectedKeys={form.packageId ? [form.packageId.toString()] : []}
                      onSelectionChange={(keys) => {
                        const selectedKey = Array.from(keys)[0] as string;
                        setForm(prev => ({ ...prev, packageId: selectedKey ? parseInt(selectedKey) : null }));
                      }}
                      isInvalid={!!errors.packageId}
                      errorMessage={errors.packageId}
                      variant="bordered"
                    >
                      {plans.map(plan => (
                        <SelectItem key={plan.id.toString()}>{plan.name}</SelectItem>
                      ))}
                    </Select>
                  )}

                  {form.type === 'discount' && (
                    <Input autoComplete="off"
                      size="sm"
                      label="折扣比例"
                      type="number"
                      value={form.discountRatio.toString()}
                      onChange={(e) => setForm(prev => ({ ...prev, discountRatio: parseInt(e.target.value) || 0 }))}
                      isInvalid={!!errors.discountRatio}
                      errorMessage={errors.discountRatio}
                      variant="bordered"
                      description="兑换后按该比例支付套餐原价，如 80 表示支付原价的 80%（8折）"
                      endContent={<span className="px-2 py-0.5 -mr-1 rounded-md bg-default-100 dark:bg-default-50/10 text-default-500 text-xs font-medium">%</span>}
                    />
                  )}

                  {form.type === 'package' && (
                    <p className="text-xs text-default-500 -mt-2">兑换后直接免费获得所选套餐，不扣减钱包余额。</p>
                  )}

                  {form.type === 'balance' && (
                    <Input autoComplete="off"
                      size="sm"
                      label="到账金额"
                      type="number"
                      value={form.amount}
                      onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))}
                      isInvalid={!!errors.amount}
                      errorMessage={errors.amount}
                      variant="bordered"
                      description="兑换后直接为用户钱包余额加值该金额"
                      endContent={<span className="px-2 py-0.5 -mr-1 rounded-md bg-default-100 dark:bg-default-50/10 text-default-500 text-xs font-medium">元</span>}
                    />
                  )}

                  <Input autoComplete="off"
                    size="sm"
                    label="可用次数"
                    type="number"
                    value={form.usesRemaining.toString()}
                    onChange={(e) => setForm(prev => ({ ...prev, usesRemaining: parseInt(e.target.value) || 0 }))}
                    isInvalid={!!errors.usesRemaining}
                    errorMessage={errors.usesRemaining}
                    variant="bordered"
                    description="每个兑换代码可被使用的次数"
                  />

                  <Textarea autoComplete="off"
                    size="sm"
                    label="兑换代码"
                    placeholder="一行一个，空行会被忽略"
                    value={form.codesText}
                    onChange={(e) => setForm(prev => ({ ...prev, codesText: e.target.value }))}
                    isInvalid={!!errors.codesText}
                    errorMessage={errors.codesText}
                    variant="bordered"
                    minRows={4}
                    maxRows={10}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>取消</Button>
                <Button color="default" onPress={handleSubmit} isLoading={submitLoading}>
                  创建
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
        message={<>你确定要删除兑换码 {codeToDelete?.code} 吗？</>}
        confirmText="确定"
        confirmColor="danger"
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />
    </div>
  );
}
