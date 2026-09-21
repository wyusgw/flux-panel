import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/table";
import { useCallback, useEffect, useState } from "react";

import { getAllUsers, getNodeList, getOrderList } from "@/api";

type Order = { amount?: number; orderStatus?: number; createdTime?: number; paidTime?: number };
type User = { id: number; user: string; name?: string; inFlow?: number; outFlow?: number };
type Node = { id: number; name: string; ip?: string };

const isSameDay = (time: number | undefined, date: Date) => {
  if (!time) return false;
  const value = new Date(time);
  return value.getFullYear() === date.getFullYear() && value.getMonth() === date.getMonth() && value.getDate() === date.getDate();
};

const isSameMonth = (time: number | undefined, date: Date) => {
  if (!time) return false;
  const value = new Date(time);
  return value.getFullYear() === date.getFullYear() && value.getMonth() === date.getMonth();
};

const currency = (amount: number) => `${amount.toFixed(2)} 元`;
const formatFlow = (value: number) => value < 1024 ** 2 ? `${(value / 1024).toFixed(2)} KB` : value < 1024 ** 3 ? `${(value / 1024 ** 2).toFixed(2)} MB` : `${(value / 1024 ** 3).toFixed(2)} GB`;

function RankTable({ title, rows, kind }: { title: string; rows: { name: string; value: number }[]; kind: 'flow' | 'node' }) {
  return (
    <Card className="dashboard-panel min-w-0">
      <CardHeader className="px-4 py-3 border-b border-default-100"><h2 className="text-sm font-semibold">{title}</h2></CardHeader>
      <CardBody className="p-0">
        <Table removeWrapper aria-label={title} classNames={{ th: "management-table-heading", td: "management-table-cell" }}>
          <TableHeader><TableColumn>排名</TableColumn><TableColumn>{kind === 'node' ? '节点' : '用户'}</TableColumn><TableColumn>单向流量</TableColumn></TableHeader>
          <TableBody emptyContent="暂无统计数据">
            {rows.map((row, index) => <TableRow key={`${row.name}-${index}`}><TableCell>{index + 1}</TableCell><TableCell>{row.name}</TableCell><TableCell>{formatFlow(row.value)}</TableCell></TableRow>)}
          </TableBody>
        </Table>
      </CardBody>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [userResponse, nodeResponse, orderResponse] = await Promise.all([getAllUsers({ current: 1, size: 1000 }), getNodeList(), getOrderList()]);
      if (userResponse.code === 0) setUsers(userResponse.data || []);
      if (nodeResponse.code === 0) setNodes(nodeResponse.data || []);
      if (orderResponse.code === 0) setOrders(orderResponse.data || []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadData(); }, [loadData]);

  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const paidAmount = (predicate: (time: number | undefined) => boolean) => orders.filter(order => order.orderStatus === 1 && predicate(order.paidTime || order.createdTime)).reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const userRanking = [...users].map(user => ({ name: user.name || user.user, value: (user.inFlow || 0) + (user.outFlow || 0) })).filter(item => item.value > 0).sort((a, b) => b.value - a.value).slice(0, 10);
  const cards = [
    ['今日充值', currency(paidAmount(time => isSameDay(time, now)))], ['本月充值', currency(paidAmount(time => isSameMonth(time, now)))],
    ['今日单向流量', '暂无统计'], ['总用户', String(users.length)],
    ['昨日充值', currency(paidAmount(time => isSameDay(time, yesterday)))], ['上月充值', currency(paidAmount(time => isSameMonth(time, lastMonth)))],
    ['昨日单向流量', '暂无统计'], ['节点数量', String(nodes.length)]
  ];

  return <div className="dashboard-home px-4 lg:px-6 py-5 lg:py-6 max-w-[1600px] mx-auto">
    <div className="flex items-center justify-between mb-5"><div><p className="text-xs font-medium tracking-[0.16em] text-blue-400 uppercase">Console</p><h1 className="mt-1 text-xl font-semibold">仪表盘</h1></div><Button size="sm" variant="bordered" className="dashboard-action" onPress={loadData} isLoading={loading}>刷新</Button></div>
    <section className="dashboard-panel mb-5 overflow-hidden"><div className="px-4 py-3 border-b border-default-100"><h2 className="text-sm font-semibold">数据一览</h2></div><div className="grid grid-cols-2 md:grid-cols-4">{cards.map(([label, value], index) => <div key={label} className={`p-4 min-h-24 ${index % 4 !== 3 ? 'md:border-r border-default-100' : ''} ${index < 4 ? 'border-b border-default-100' : ''}`}><p className="text-xs text-default-500">{label}</p><p className="mt-2 text-lg font-semibold text-foreground">{value}</p></div>)}</div></section>
    <section className="grid grid-cols-1 xl:grid-cols-2 gap-5"><RankTable title="今日用户流量排行" rows={userRanking} kind="flow" /><RankTable title="昨日用户流量排行" rows={[]} kind="flow" /><RankTable title="今日节点流量排行" rows={nodes.map(node => ({ name: node.name || node.ip || `节点 #${node.id}`, value: 0 })).filter(() => false)} kind="node" /><RankTable title="昨日节点流量排行" rows={[]} kind="node" /></section>
  </div>;
}
