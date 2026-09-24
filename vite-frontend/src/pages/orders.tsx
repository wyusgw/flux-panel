import { useState, useEffect, useMemo } from "react";
import { Card, CardBody } from "@heroui/card";
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

  const loadData = async () => {
    setLoading(true);
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

  const pagedOrders = useMemo(() => {
    const start = (page - 1) * pageSize;
    return orders.slice(start, start + pageSize);
  }, [orders, page, pageSize]);

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
      <h1 className="text-xl font-semibold mb-4">我的订单</h1>

      <Card className="shadow-sm border border-default-200">
        <CardBody className="p-0">
          <div className="settings-table-scroll">
            <Table
              removeWrapper
              aria-label="我的订单列表"
              classNames={{ base: "w-full", table: "w-full management-table", th: "management-table-heading", td: "management-table-cell" }}
            >
              <TableHeader>
                <TableColumn>订单号</TableColumn>
                <TableColumn>创建时间</TableColumn>
                <TableColumn>支付时间</TableColumn>
                <TableColumn>订单信息</TableColumn>
                <TableColumn>金额</TableColumn>
                <TableColumn>类型</TableColumn>
                <TableColumn>状态</TableColumn>
              </TableHeader>
              <TableBody items={pagedOrders} emptyContent={<EmptyState text="暂无订单" />}>
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
                        <Chip color={status.color} size="sm" variant="flat">{status.text}</Chip>
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
    </div>
  );
}
