import { useState, useEffect, useMemo } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell
} from "@heroui/table";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import toast from 'react-hot-toast';

import { EmptyState } from "@/components/empty-state";
import { TablePagination } from "@/components/table-pagination";
import { getOrderList } from "@/api";
import { useOrderTableFilters } from "@/components/order-table-filters";
import { HEADER_COLUMN_CLASS, HEADER_TABLE_CLASS_NAMES } from "@/components/table-header-filter";

interface OrderItem {
  id: number;
  orderNo: string;
  type: string;
  info: string;
  amount: number;
  orderStatus: number;
  paidTime?: number;
  createdTime: number;
}

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

const STATUS_FILTER_OPTIONS = [{ status: 0, text: '待支付' }, { status: 1, text: '交易完成' }, { status: 2, text: '已取消' }];

const getStatusDisplay = (status: number) => {
  switch (status) {
    case 1:
      return { text: '交易完成', color: 'success' as const };
    case 2:
      return { text: '已取消', color: 'danger' as const };
    default:
      return { text: '待支付', color: 'warning' as const };
  }
};

export default function OrdersPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (showLoading = true) => {
    setLoading(showLoading);
    try {
      const res = await getOrderList();
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
  };

  const { filtered: filteredOrders, headers } = useOrderTableFilters(orders, getTypeText, STATUS_FILTER_OPTIONS, () => setPage(1));

  const pagedOrders = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, page, pageSize]);

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
        <CardHeader className="px-6 py-4 border-b border-default-100">
          <h1 className="text-base font-semibold text-foreground">我的订单</h1>
        </CardHeader>
        <CardBody className="p-6">
          <div className="settings-table-scroll border-b border-default-100">
            <Table
              removeWrapper
              aria-label="我的订单列表"
              classNames={{ base: "w-full", table: "w-full management-table", ...HEADER_TABLE_CLASS_NAMES }}
            >
              <TableHeader>
                <TableColumn className={HEADER_COLUMN_CLASS}>{headers.orderNo}</TableColumn>
                <TableColumn className={HEADER_COLUMN_CLASS}>创建时间</TableColumn>
                <TableColumn className={HEADER_COLUMN_CLASS}>支付时间</TableColumn>
                <TableColumn className={HEADER_COLUMN_CLASS}>{headers.info}</TableColumn>
                <TableColumn className={HEADER_COLUMN_CLASS}>{headers.amount}</TableColumn>
                <TableColumn className={HEADER_COLUMN_CLASS}>{headers.type}</TableColumn>
                <TableColumn className={HEADER_COLUMN_CLASS}>{headers.status}</TableColumn>
                <TableColumn className={HEADER_COLUMN_CLASS}>操作</TableColumn>
              </TableHeader>
              <TableBody items={pagedOrders} emptyContent={<EmptyState />}>
                {(order: OrderItem) => {
                  const status = getStatusDisplay(order.orderStatus);
                  return (
                    <TableRow key={order.id}>
                      <TableCell>
                        <span className="font-mono text-xs">{order.orderNo}</span>
                      </TableCell>
                      <TableCell>{formatDate(order.createdTime)}</TableCell>
                      <TableCell>{formatDate(order.paidTime)}</TableCell>
                      <TableCell>{order.info}</TableCell>
                      <TableCell>{order.amount} 元</TableCell>
                      <TableCell>{getTypeText(order.type)}</TableCell>
                      <TableCell>
                        <Chip color={status.color} size="sm" variant="light">{status.text}</Chip>
                      </TableCell>
                      <TableCell><span className="text-default-500">—</span></TableCell>
                    </TableRow>
                  );
                }}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            total={filteredOrders.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
