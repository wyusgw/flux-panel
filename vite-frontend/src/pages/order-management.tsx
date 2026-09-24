import { useState, useEffect, useMemo, useCallback } from "react";
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
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@heroui/dropdown";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import toast from 'react-hot-toast';

import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TablePagination } from "@/components/table-pagination";
import { getAdminOrderList, createManualOrder, batchDeleteOrders, updateOrderStatus, getAllUsers } from "@/api";

interface OrderItem {
  id: number;
  orderNo: string;
  userId: number;
  userName?: string;
  type: string;
  info: string;
  amount: number;
  orderStatus: number;
  paidTime?: number;
  createdTime: number;
}

interface UserOption {
  id: number;
  user: string;
}

interface ManualForm {
  userId: number | null;
  info: string;
  amount: string;
}

const DEFAULT_FORM: ManualForm = { userId: null, info: '', amount: '' };

const formatDate = (timestamp?: number): string => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString();
};

const getTypeText = (type: string): string => {
  switch (type) {
    case 'package':
      return '余额消费';
    case 'recharge':
      return '钱包充值';
    case 'manual':
      return '手动记账';
    case 'redeem_balance':
      return '兑换余额';
    default:
      return type;
  }
};

const STATUS_OPTIONS = [
  { status: 0, text: '待支付', color: 'warning' as const },
  { status: 1, text: '已支付', color: 'success' as const },
  { status: 2, text: '已取消', color: 'danger' as const }
];

const getStatusDisplay = (status: number) => STATUS_OPTIONS.find(o => o.status === status) || STATUS_OPTIONS[0];

const IconDelete = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M4 6h12M8 6V4.5A1.5 1.5 0 019.5 3h1A1.5 1.5 0 0112 4.5V6m-6 0v9.5A1.5 1.5 0 007.5 17h5a1.5 1.5 0 001.5-1.5V6M8.5 9.5v4M11.5 9.5v4" />
  </svg>
);

const IconAdd = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10 4v12M4 10h12" />
  </svg>
);

export default function OrderManagementPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedKeys, setSelectedKeys] = useState<any>(new Set([]));

  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState<ManualForm>(DEFAULT_FORM);
  const [manualErrors, setManualErrors] = useState<{ [key: string]: string }>({});
  const [manualLoading, setManualLoading] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState<number[]>([]);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [statusChangeTarget, setStatusChangeTarget] = useState<{ order: OrderItem; status: number } | null>(null);
  const [statusChangeLoading, setStatusChangeLoading] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminOrderList();
      if (res.code === 0) {
        setOrders(res.data || []);
      } else {
        toast.error(res.msg || '获取订单失败');
      }
    } catch (error) {
      console.error('加载数据失败:', error);
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    getAllUsers({ current: 1, size: 1000 }).then((res) => {
      if (res.code === 0) setUsers(res.data || []);
    });
  }, [loadOrders]);

  const pagedOrders = useMemo(() => {
    const start = (page - 1) * pageSize;
    return orders.slice(start, start + pageSize);
  }, [orders, page, pageSize]);

  const getSelectedIds = (): number[] => {
    if (selectedKeys === 'all') return orders.map(o => o.id);
    return Array.from(selectedKeys as Set<any>).map(k => Number(k)).filter(id => orders.some(o => o.id === id));
  };
  const selectedIds = getSelectedIds();

  const openManualModal = () => {
    setManualForm(DEFAULT_FORM);
    setManualErrors({});
    setManualModalOpen(true);
  };

  const validateManualForm = (): boolean => {
    const errors: { [key: string]: string } = {};
    if (!manualForm.userId) errors.userId = '请选择用户';
    if (!manualForm.info.trim()) errors.info = '请填写订单信息';
    const amountNum = Number(manualForm.amount);
    if (manualForm.amount === '' || Number.isNaN(amountNum)) errors.amount = '请填写正确的金额';
    setManualErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submitManualOrder = async () => {
    if (!validateManualForm()) return;
    setManualLoading(true);
    try {
      const res = await createManualOrder({
        userId: manualForm.userId as number,
        info: manualForm.info.trim(),
        amount: Number(manualForm.amount)
      });
      if (res.code === 0) {
        toast.success('创建成功');
        setManualModalOpen(false);
        loadOrders();
      } else {
        toast.error(res.msg || '创建失败');
      }
    } catch (error) {
      toast.error('创建失败');
    } finally {
      setManualLoading(false);
    }
  };

  const openDeleteModal = (ids: number[]) => {
    setDeleteTargetIds(ids);
    setDeleteModalOpen(true);
  };

  const requestStatusChange = (order: OrderItem, status: number) => {
    if (status === order.orderStatus) return;
    setStatusChangeTarget({ order, status });
  };

  const confirmStatusChange = async () => {
    if (!statusChangeTarget) return;
    setStatusChangeLoading(true);
    try {
      const res = await updateOrderStatus(statusChangeTarget.order.id, statusChangeTarget.status);
      if (res.code === 0) {
        toast.success('状态已更新');
        setStatusChangeTarget(null);
        loadOrders();
      } else {
        toast.error(res.msg || '更新失败');
      }
    } catch (error) {
      toast.error('更新失败');
    } finally {
      setStatusChangeLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (deleteTargetIds.length === 0) return;
    setDeleteLoading(true);
    try {
      const res = await batchDeleteOrders(deleteTargetIds);
      if (res.code === 0) {
        toast.success('删除成功');
        setDeleteModalOpen(false);
        setSelectedKeys(new Set([]));
        loadOrders();
      } else {
        toast.error(res.msg || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    } finally {
      setDeleteLoading(false);
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
        <h1 className="text-xl font-semibold">订单管理</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="flat" color="default" startContent={<IconAdd />} onPress={openManualModal}>
            手动记账
          </Button>
          <Button
            size="sm"
            variant="flat"
            color="danger"
            startContent={<IconDelete />}
            isDisabled={selectedIds.length === 0}
            onPress={() => openDeleteModal(selectedIds)}
          >
            删除选中
          </Button>
        </div>
      </div>

      <Card className="shadow-sm border border-default-200">
        <CardBody className="p-0">
          <div className="settings-table-scroll">
            <Table
              removeWrapper
              aria-label="订单管理列表"
              selectionMode="multiple"
              selectedKeys={selectedKeys}
              onSelectionChange={setSelectedKeys}
              classNames={{ base: "w-full", table: "w-full management-table-selectable", th: "management-table-heading", td: "management-table-cell" }}
            >
              <TableHeader>
                <TableColumn>订单号</TableColumn>
                <TableColumn>用户</TableColumn>
                <TableColumn>创建时间</TableColumn>
                <TableColumn>支付时间</TableColumn>
                <TableColumn>订单信息</TableColumn>
                <TableColumn>金额</TableColumn>
                <TableColumn>类型</TableColumn>
                <TableColumn>状态</TableColumn>
                <TableColumn align="end">操作</TableColumn>
              </TableHeader>
              <TableBody items={pagedOrders} emptyContent={<EmptyState text="暂无订单" />}>
                {(order: OrderItem) => {
                  const status = getStatusDisplay(order.orderStatus);
                  return (
                    <TableRow key={order.id}>
                      <TableCell>
                        <span className="font-mono text-xs">{order.orderNo}</span>
                      </TableCell>
                      <TableCell>{order.userName || `#${order.userId}`}</TableCell>
                      <TableCell>{formatDate(order.createdTime)}</TableCell>
                      <TableCell>{formatDate(order.paidTime)}</TableCell>
                      <TableCell>{order.info}</TableCell>
                      <TableCell>{order.amount} 元</TableCell>
                      <TableCell>{getTypeText(order.type)}</TableCell>
                      <TableCell>
                        <Dropdown>
                          <DropdownTrigger>
                            <Chip
                              color={status.color}
                              size="sm"
                              variant="flat"
                              className="cursor-pointer"
                            >
                              {status.text}
                            </Chip>
                          </DropdownTrigger>
                          <DropdownMenu
                            aria-label="更改订单状态"
                            disabledKeys={[String(order.orderStatus)]}
                            onAction={(key) => requestStatusChange(order, Number(key))}
                          >
                            {STATUS_OPTIONS.map((opt) => (
                              <DropdownItem key={opt.status}>{opt.text}</DropdownItem>
                            ))}
                          </DropdownMenu>
                        </Dropdown>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button size="sm" variant="light" color="danger" isIconOnly onPress={() => openDeleteModal([order.id])}>
                            <IconDelete />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            total={orders.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          />
        </CardBody>
      </Card>

      <Modal isOpen={manualModalOpen} onOpenChange={setManualModalOpen} size="lg" scrollBehavior="outside" backdrop="blur" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-xl font-bold">手动记账</h2>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Select
                    size="sm"
                    label="用户"
                    placeholder="请选择要记账的用户"
                    selectedKeys={manualForm.userId ? [manualForm.userId.toString()] : []}
                    onSelectionChange={(keys) => {
                      const selectedKey = Array.from(keys)[0] as string;
                      setManualForm(prev => ({ ...prev, userId: selectedKey ? parseInt(selectedKey) : null }));
                    }}
                    isInvalid={!!manualErrors.userId}
                    errorMessage={manualErrors.userId}
                    variant="bordered"
                  >
                    {users.map(u => (
                      <SelectItem key={u.id.toString()}>{u.user}</SelectItem>
                    ))}
                  </Select>

                  <Textarea
                    size="sm"
                    autoComplete="off"
                    label="订单信息"
                    placeholder="例如：线下转账补差价"
                    value={manualForm.info}
                    onChange={(e) => setManualForm(prev => ({ ...prev, info: e.target.value }))}
                    isInvalid={!!manualErrors.info}
                    errorMessage={manualErrors.info}
                    variant="bordered"
                    minRows={2}
                    maxRows={5}
                  />

                  <Input
                    size="sm"
                    autoComplete="off"
                    label="金额"
                    type="number"
                    value={manualForm.amount}
                    onChange={(e) => setManualForm(prev => ({ ...prev, amount: e.target.value }))}
                    isInvalid={!!manualErrors.amount}
                    errorMessage={manualErrors.amount}
                    variant="bordered"
                    description="仅作记录用途，不会真实扣减或增加用户余额"
                    endContent={<span className="px-2 py-0.5 -mr-1 rounded-md bg-default-100 dark:bg-default-50/10 text-default-500 text-xs font-medium">元</span>}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>取消</Button>
                <Button color="default" onPress={submitManualOrder} isLoading={manualLoading}>
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
        message={<>你确定要删除选中的 {deleteTargetIds.length} 条订单吗？此操作不可撤销。</>}
        confirmText="确定"
        confirmColor="danger"
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />

      <ConfirmDialog
        isOpen={!!statusChangeTarget}
        onOpenChange={(open) => { if (!open) setStatusChangeTarget(null); }}
        title="确认更改状态"
        message={
          statusChangeTarget ? (
            <>
              <p>
                将订单 <span className="font-mono">{statusChangeTarget.order.orderNo}</span> 的状态改为「{getStatusDisplay(statusChangeTarget.status).text}」？
              </p>
              {statusChangeTarget.order.type === 'recharge' && statusChangeTarget.status === 1 && statusChangeTarget.order.orderStatus === 0 && (
                <p className="text-warning mt-2">该订单为充值订单，标记为已支付会同时给对应用户的钱包余额加值 {statusChangeTarget.order.amount} 元。</p>
              )}
              {statusChangeTarget.order.orderStatus === 1 && statusChangeTarget.status !== 1 && (
                <p className="text-warning mt-2">该订单当前已是已支付状态，更改状态不会自动扣回已加值的余额或已发放的套餐权益。</p>
              )}
            </>
          ) : null
        }
        confirmText="确定"
        confirmColor="primary"
        onConfirm={confirmStatusChange}
        loading={statusChangeLoading}
      />
    </div>
  );
}
