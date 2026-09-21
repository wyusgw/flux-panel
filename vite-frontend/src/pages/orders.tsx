import { useState, useEffect } from "react";
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

import { getOrderList } from "@/api";

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

const formatDate = (timestamp?: number): string => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString();
};

const getTypeText = (type: string): string => {
  switch (type) {
    case 'package':
      return '购买套餐';
    default:
      return type;
  }
};

export default function OrdersPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(localStorage.getItem('admin') === 'true');
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
      <Card className="shadow-sm border border-gray-200 dark:border-gray-700">
        <CardBody className="p-0">
          <Table
            aria-label="订单列表"
            classNames={{
              wrapper: "shadow-none",
              th: "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium"
            }}
          >
            <TableHeader>
              <TableColumn>订单号</TableColumn>
              <TableColumn>{isAdmin ? '用户' : '订单信息'}</TableColumn>
              <TableColumn>订单信息</TableColumn>
              <TableColumn>金额</TableColumn>
              <TableColumn>类型</TableColumn>
              <TableColumn>状态</TableColumn>
              <TableColumn>创建时间</TableColumn>
            </TableHeader>
            <TableBody items={orders} emptyContent="暂无订单">
              {(order: OrderItem) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <span className="font-mono text-xs">{order.orderNo}</span>
                  </TableCell>
                  <TableCell>{isAdmin ? (order.userName || order.userId) : order.info}</TableCell>
                  <TableCell>{isAdmin ? order.info : '-'}</TableCell>
                  <TableCell>{order.amount} 元</TableCell>
                  <TableCell>{getTypeText(order.type)}</TableCell>
                  <TableCell>
                    <Chip color={order.orderStatus === 1 ? 'success' : 'default'} size="sm" variant="flat">
                      {order.orderStatus === 1 ? '已完成' : '处理中'}
                    </Chip>
                  </TableCell>
                  <TableCell>{formatDate(order.createdTime)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
