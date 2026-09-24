import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from "recharts";

import { getAllUsers, getNodeList, getOrderList, getTaskQueueList } from "@/api";

type Order = { amount?: number; orderStatus?: number; createdTime?: number; paidTime?: number };
type User = { id: number; user: string; name?: string; inFlow?: number; outFlow?: number };
type Node = { id: number; name: string; ip?: string; status?: number };
type TaskQueueItem = { taskTypeLabel: string; status: 'PENDING' | 'SUCCESS'; retryCount: number; createdTime: number };

// 需与后端 TaskQueueServiceImpl.MAX_AUTO_RETRY 保持一致：超过这个次数后不再自动重试，仅供手动处理
const AUTO_RETRY_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

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

const TableIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="M3 8h14M8 8v8" /></svg>;
const ChartIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 20 20"><path strokeLinecap="round" d="M4 16V9M9 16V4M14 16v-5" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 16h14" /></svg>;

function RankTable({ title, rows, kind }: { title: string; rows: { name: string; value: number }[]; kind: 'flow' | 'node' }) {
  const [view, setView] = useState<'table' | 'chart'>('table');
  return (
    <Card className="dashboard-panel min-w-0">
      <CardHeader className="px-4 py-3 border-b border-default-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="flex items-center gap-1">
          <Button isIconOnly size="sm" variant={view === 'table' ? 'flat' : 'light'} color="default" onPress={() => setView('table')} title="表格视图"><TableIcon /></Button>
          <Button isIconOnly size="sm" variant={view === 'chart' ? 'flat' : 'light'} color="default" onPress={() => setView('chart')} title="图表视图"><ChartIcon /></Button>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {view === 'table' ? (
          <Table removeWrapper aria-label={title} classNames={{ th: "management-table-heading", td: "management-table-cell" }}>
            <TableHeader><TableColumn>排名</TableColumn><TableColumn>{kind === 'node' ? '节点' : '用户'}</TableColumn><TableColumn>单向流量</TableColumn></TableHeader>
            <TableBody emptyContent="暂无统计数据">
              {rows.map((row, index) => <TableRow key={`${row.name}-${index}`}><TableCell>{index + 1}</TableCell><TableCell>{row.name}</TableCell><TableCell>{formatFlow(row.value)}</TableCell></TableRow>)}
            </TableBody>
          </Table>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-default-500">暂无统计数据</div>
        ) : (
          <div className="p-4" style={{ height: Math.max(160, rows.length * 36) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 4 }} barCategoryGap={8}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={90} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <Tooltip
                  cursor={{ fill: 'currentColor', className: 'opacity-5' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const row = payload[0].payload as { name: string; value: number };
                    return (
                      <div className="bg-white dark:bg-default-100 border border-default-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                        <p className="text-default-500">{row.name}</p>
                        <p className="font-medium text-foreground">{formatFlow(row.value)}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20} className="fill-[#2a78d6] dark:fill-[#3987e5]">
                  <LabelList dataKey="value" position="right" formatter={(value: any) => formatFlow(Number(value))} className="fill-default-500 text-[11px]" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [taskQueueItems, setTaskQueueItems] = useState<TaskQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [userResponse, nodeResponse, orderResponse, taskQueueResponse] = await Promise.all([getAllUsers({ current: 1, size: 1000 }), getNodeList(), getOrderList(), getTaskQueueList()]);
      if (userResponse.code === 0) setUsers(userResponse.data || []);
      if (nodeResponse.code === 0) setNodes(nodeResponse.data || []);
      if (orderResponse.code === 0) setOrders(orderResponse.data || []);
      if (taskQueueResponse.code === 0) setTaskQueueItems(taskQueueResponse.data || []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadData(); }, [loadData]);

  const taskQueueStats = useMemo(() => {
    const byType = new Map<string, number>();
    let pendingTotal = 0;
    let stuck = 0;
    let last24h = 0;
    const now = Date.now();
    for (const item of taskQueueItems) {
      if (item.status === 'SUCCESS') continue;
      pendingTotal++;
      byType.set(item.taskTypeLabel, (byType.get(item.taskTypeLabel) || 0) + 1);
      if (item.retryCount >= AUTO_RETRY_LIMIT) stuck++;
      if (now - item.createdTime <= DAY_MS) last24h++;
    }
    return { total: pendingTotal, byType: Array.from(byType.entries()), stuck, last24h };
  }, [taskQueueItems]);

  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const paidAmount = (predicate: (time: number | undefined) => boolean) => orders.filter(order => order.orderStatus === 1 && predicate(order.paidTime || order.createdTime)).reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const userRanking = [...users].map(user => ({ name: user.name || user.user, value: (user.inFlow || 0) + (user.outFlow || 0) })).filter(item => item.value > 0).sort((a, b) => b.value - a.value).slice(0, 10);
  const onlineNodeCount = nodes.filter(node => node.status === 1).length;
  const cards = [
    ['今日充值', currency(paidAmount(time => isSameDay(time, now)))], ['本月充值', currency(paidAmount(time => isSameMonth(time, now)))],
    ['今日单向流量', '暂无统计'], ['总用户', String(users.length)],
    ['昨日充值', currency(paidAmount(time => isSameDay(time, yesterday)))], ['上月充值', currency(paidAmount(time => isSameMonth(time, lastMonth)))],
    ['昨日单向流量', '暂无统计'], ['在线节点', `${onlineNodeCount} / ${nodes.length}`]
  ];

  return <div className="dashboard-home px-4 lg:px-6 py-5 lg:py-6 max-w-[1600px] mx-auto">
    <div className="flex items-center justify-between mb-5"><div><p className="text-xs font-medium tracking-[0.16em] text-blue-400 uppercase">Console</p><h1 className="mt-1 text-xl font-semibold">仪表盘</h1></div><Button size="sm" variant="bordered" className="dashboard-action" onPress={loadData} isLoading={loading}>刷新</Button></div>
    <section className="dashboard-panel mb-5 overflow-hidden"><div className="px-4 py-3 border-b border-default-100"><h2 className="text-sm font-semibold">数据一览</h2></div><div className="grid grid-cols-2 md:grid-cols-4">{cards.map(([label, value], index) => <div key={label} className={`p-4 min-h-24 ${index % 4 !== 3 ? 'md:border-r border-default-100' : ''} ${index < 4 ? 'border-b border-default-100' : ''}`}><p className="text-xs text-default-500">{label}</p><p className="mt-2 text-lg font-semibold text-foreground">{value}</p></div>)}</div></section>
    <section className="dashboard-panel mb-5 overflow-hidden">
      <div className="px-4 py-3 border-b border-default-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold">任务队列监控</h2>
        <Button size="sm" variant="light" onPress={() => navigate('/task-queue')}>查看详情</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4">
        <div className="p-4 min-h-24 md:border-r border-default-100"><p className="text-xs text-default-500">待处理总数</p><p className="mt-2 text-lg font-semibold text-foreground">{taskQueueStats.total}</p></div>
        <div className="p-4 min-h-24 md:border-r border-default-100"><p className="text-xs text-default-500">24小时内新增</p><p className="mt-2 text-lg font-semibold text-foreground">{taskQueueStats.last24h}</p></div>
        <div className="p-4 min-h-24 md:border-r border-default-100"><p className="text-xs text-default-500">超过自动重试上限</p><p className={`mt-2 text-lg font-semibold ${taskQueueStats.stuck > 0 ? 'text-warning-600' : 'text-foreground'}`}>{taskQueueStats.stuck}</p></div>
        <div className="p-4 min-h-24">
          <p className="text-xs text-default-500">按类型分布</p>
          {taskQueueStats.byType.length > 0 ? (
            <div className="flex flex-wrap gap-1 mt-2">{taskQueueStats.byType.map(([label, count]) => <Chip key={label} size="sm" variant="flat">{label} {count}</Chip>)}</div>
          ) : (
            <p className="mt-2 text-lg font-semibold text-foreground">0</p>
          )}
        </div>
      </div>
    </section>
    <section className="grid grid-cols-1 xl:grid-cols-2 gap-5"><RankTable title="今日用户流量排行" rows={userRanking} kind="flow" /><RankTable title="昨日用户流量排行" rows={[]} kind="flow" /><RankTable title="今日节点流量排行" rows={nodes.map(node => ({ name: node.name || node.ip || `节点 #${node.id}`, value: 0 })).filter(() => false)} kind="node" /><RankTable title="昨日节点流量排行" rows={[]} kind="node" /></section>
  </div>;
}
