import { Card, CardBody, CardHeader } from "@heroui/card";
import { nextSort, SortableHeader } from "@/components/table-sort";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/table";
import type { SortDescriptor } from "@heroui/table";
import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from "recharts";

import { StatCell } from "@/components/stat-cell";
import { EmptyState } from "@/components/empty-state";
import { getAllUsers, getNodeList, getAdminOrderList, getTaskQueueHealth, getDashboardFlowStats, getNodeOnlineTrend } from "@/api";

type Order = { amount?: number; orderStatus?: number; createdTime?: number; paidTime?: number };
type User = { id: number; user: string; name?: string; inFlow?: number; outFlow?: number };
type Node = { id: number; name: string; ip?: string; status?: number };
type TaskQueueHealth = { running: boolean; queuedCount: number; retryingCount: number; exhaustedCount: number; successLastHour: number };
type RankRow = { name: string; value: number };
type FlowStats = {
  todayTotal: number; yesterdayTotal: number;
  todayUserRanking: RankRow[]; yesterdayUserRanking: RankRow[];
  todayNodeRanking: RankRow[]; yesterdayNodeRanking: RankRow[];
};
const EMPTY_FLOW_STATS: FlowStats = { todayTotal: 0, yesterdayTotal: 0, todayUserRanking: [], yesterdayUserRanking: [], todayNodeRanking: [], yesterdayNodeRanking: [] };

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
const formatFlow = (value: number) => value < 1024 ** 2 ? `${(value / 1024).toFixed(2)} KiB` : value < 1024 ** 3 ? `${(value / 1024 ** 2).toFixed(2)} MiB` : `${(value / 1024 ** 3).toFixed(2)} GiB`;

const TableIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="M3 8h14M8 8v8" /></svg>;
const ChartIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 20 20"><path strokeLinecap="round" d="M4 16V9M9 16V4M14 16v-5" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 16h14" /></svg>;

// 充值趋势迷你折线图：「今日充值」「本月充值」两格右侧用的是同一个组件，
// 只是喂进去的趋势数据范围不同（按天 14 天 / 按月 6 个月）
type TrendPoint = { label: string; amount: number };
const RechargeTrend = ({ data }: { data: TrendPoint[] }) => (
  <div className="hidden sm:block h-12 w-32 flex-shrink-0">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 3, right: 4, bottom: 3, left: 4 }}>
        <Tooltip
          cursor={{ stroke: 'currentColor', strokeOpacity: 0.15 }}
          content={({ active, payload }) => {
            if (!active || !payload || !payload.length) return null;
            const row = payload[0].payload as TrendPoint;
            return (
              <div className="bg-white dark:bg-default-100 border border-default-200 rounded-lg px-2 py-1 text-[11px] shadow-lg">
                <p className="text-default-500">{row.label}</p>
                <p className="font-medium text-foreground">{currency(row.amount)}</p>
              </div>
            );
          }}
        />
        <Line type="monotone" dataKey="amount" strokeWidth={2} dot={false} activeDot={false} className="stroke-[#2a78d6] dark:stroke-[#3987e5]" />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

// 节点在线统计曲线图：独立的一张图表卡片，横轴为时间、纵轴为节点数量（整数，从 0 起），带横向网格线与数据点。
// 只画一条线：在线节点数；离线数量不单独画线，悬停提示里同时显示在线与离线数。
// 「近 24 小时」为每 5 分钟一个采样点，「近 30 天」按自然日取当日最多在线数与最多离线数；
// 没有数据时提示「数据采集中」，接口失败提示「数据不可用」
type OnlinePoint = { time: number; online: number; offline: number };
type OnlineRange = 'day' | 'month';
const LINE_COLOR = '#2a78d6';
const pad2 = (n: number) => String(n).padStart(2, '0');
const formatClock = (time: number) => { const d = new Date(time); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const formatMonthDay = (time: number) => { const d = new Date(time); return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const formatFullDate = (time: number) => { const d = new Date(time); return `${d.getFullYear()}-${formatMonthDay(time)}`; };

const NodeOnlineChart = () => {
  const [range, setRange] = useState<OnlineRange>('day');
  const [data, setData] = useState<OnlinePoint[]>([]);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    (async () => {
      try {
        const response = await getNodeOnlineTrend(range);
        if (!active) return;
        if (response.code === 0) { setData(response.data || []); setFailed(false); } else { setFailed(true); }
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => { active = false; };
  }, [range]);

  const formatTick = (time: number) => range === 'month' ? formatMonthDay(time) : formatClock(time);
  // 点不多（近 30 天按天汇总，或刚开始采样）时画出数据点，5 分钟一个点的 24 小时视图不画点以免太密
  const showDots = range === 'month' || data.length <= 3;

  return (
    <Card className="dashboard-panel mb-5 min-w-0" shadow="none">
      <CardHeader className="px-6 py-4 border-b border-default-100 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold">节点在线统计</h2>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1">
            <Button size="sm" variant={range === 'day' ? 'flat' : 'light'} color="default" onPress={() => setRange('day')}>近 24 小时</Button>
            <Button size="sm" variant={range === 'month' ? 'flat' : 'light'} color="default" onPress={() => setRange('month')}>近 30 天</Button>
          </div>
        </div>
      </CardHeader>
      <CardBody className="px-4 py-4">
        <div className="h-60">
          {failed ? (
            <div className="h-full flex items-center justify-center text-sm text-default-400">数据不可用</div>
          ) : loaded && data.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-default-400">数据采集中</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
                <XAxis dataKey="time" tickFormatter={formatTick} tickLine={false} axisLine={false} minTickGap={28} tick={{ fontSize: 11, className: 'fill-default-500' }} />
                <YAxis allowDecimals={false} domain={[0, (max: number) => Math.max(max, 1)]} width={32} tickLine={false} axisLine={false} tick={{ fontSize: 11, className: 'fill-default-500' }} />
                <Tooltip
                  cursor={{ stroke: 'currentColor', strokeOpacity: 0.15 }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const row = payload[0].payload as OnlinePoint;
                    return (
                      <div className="bg-white dark:bg-default-100 border border-default-200 rounded-lg px-3 py-2 text-xs shadow-lg">
                        <p className="text-default-500">{range === 'month' ? `${formatFullDate(row.time)}（当日最多）` : `${formatMonthDay(row.time)} ${formatClock(row.time)}`}</p>
                        <p className="mt-1 font-medium text-foreground">在线 {row.online}</p>
                        <p className="mt-0.5 font-medium text-foreground">离线 {row.offline}</p>
                      </div>
                    );
                  }}
                />
                <Line type="monotone" dataKey="online" stroke={LINE_COLOR} strokeWidth={2} dot={showDots ? { r: 2.5, fill: LINE_COLOR, stroke: 'none' } : false} activeDot={{ r: 4 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardBody>
    </Card>
  );
};

// 排行卡片的表头筛选与排序（样式与转发规则表格一致）：「排名」「单向流量」列可点击排序，
// 「用户 / 节点」列表头有漏斗图标，点开按名称关键字筛选；筛选和排序后保留原始名次，表格与图表视图共用同一份结果
const IconFilter = () => <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M3 4h18l-7 8.5V19l-4 2v-8.5L3 4z" /></svg>;
function RankTable({ title, rows: allRows, kind }: { title: string; rows: { name: string; value: number }[]; kind: 'flow' | 'node' }) {
  const [view, setView] = useState<'table' | 'chart'>('table');
  const [keyword, setKeyword] = useState('');
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor | undefined>(undefined);
  const noun = kind === 'node' ? '节点' : '用户';
  const trimmed = keyword.trim().toLowerCase();
  const ranked = useMemo(() => allRows.map((row, index) => ({ ...row, rank: index + 1 })), [allRows]);
  const rows = useMemo(() => {
    const filtered = ranked.filter(row => !trimmed || row.name.toLowerCase().includes(trimmed));
    if (!sortDescriptor?.column) return filtered;
    const dir = sortDescriptor.direction === 'descending' ? -1 : 1;
    const key = sortDescriptor.column === 'value' ? 'value' : 'rank';
    return [...filtered].sort((a, b) => (a[key] - b[key]) * dir);
  }, [ranked, trimmed, sortDescriptor]);
  const filtering = trimmed !== '';
  return (
    <Card className="dashboard-panel min-w-0" shadow="none">
      <CardHeader className="px-6 py-4 border-b border-default-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="flex items-center gap-1">
          <Button isIconOnly size="sm" variant={view === 'table' ? 'flat' : 'light'} color="default" onPress={() => setView('table')} title="表格视图"><TableIcon /></Button>
          <Button isIconOnly size="sm" variant={view === 'chart' ? 'flat' : 'light'} color="default" onPress={() => setView('chart')} title="图表视图"><ChartIcon /></Button>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {view === 'table' ? (
          <Table removeWrapper aria-label={title} sortDescriptor={sortDescriptor} onSortChange={(next) => setSortDescriptor(nextSort(sortDescriptor, next))} classNames={{ th: "management-table-heading", td: "management-table-cell", sortIcon: "hidden" }}>
            <TableHeader>
              <TableColumn key="rank" allowsSorting><SortableHeader label="排名" columnKey="rank" sort={sortDescriptor} /></TableColumn>
              <TableColumn key="name">
                <div className="flex items-center gap-1.5">
                  {noun}
                  <Popover placement="bottom-start">
                    <PopoverTrigger>
                      <button
                        type="button"
                        aria-label={`筛选${noun}`}
                        title={`筛选${noun}`}
                        className={`inline-flex items-center justify-center rounded p-0.5 transition-colors ${filtering ? 'text-primary' : 'text-default-400 hover:text-default-600'}`}
                      >
                        <IconFilter />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent>
                      <div className="p-2 w-48">
                        <Input
                          aria-label={`筛选${noun}`} size="sm" variant="bordered" autoComplete="off" isClearable autoFocus
                          placeholder={`输入${noun}名称`}
                          value={keyword} onValueChange={setKeyword}
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </TableColumn>
              <TableColumn key="value" allowsSorting><SortableHeader label="单向流量" columnKey="value" sort={sortDescriptor} /></TableColumn>
            </TableHeader>
            <TableBody emptyContent={<EmptyState text={filtering && allRows.length > 0 ? "没有符合条件的数据" : "暂无统计数据"} />}>
              {rows.map((row) => <TableRow key={`${row.name}-${row.rank}`}><TableCell>{row.rank}</TableCell><TableCell>{row.name}</TableCell><TableCell>{formatFlow(row.value)}</TableCell></TableRow>)}
            </TableBody>
          </Table>
        ) : rows.length === 0 ? (
          <EmptyState text={filtering && allRows.length > 0 ? '没有符合条件的数据' : '暂无统计数据'} />
        ) : (
          <div className="p-4" style={{ height: Math.max(160, rows.length * 36) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 4 }} barCategoryGap={8}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={90} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <Tooltip
                  cursor={false}
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
  const [users, setUsers] = useState<User[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const navigate = useNavigate();
  const [queueHealth, setQueueHealth] = useState<TaskQueueHealth | null>(null);
  const [flowStats, setFlowStats] = useState<FlowStats>(EMPTY_FLOW_STATS);
  const loadData = useCallback(async () => {
    const [userResponse, nodeResponse, orderResponse, taskQueueResponse, flowStatsResponse] = await Promise.all([
      getAllUsers({ current: 1, size: 1000 }), getNodeList(), getAdminOrderList(), getTaskQueueHealth(), getDashboardFlowStats(),
    ]);
    if (userResponse.code === 0) setUsers(userResponse.data || []);
    if (nodeResponse.code === 0) setNodes(nodeResponse.data || []);
    if (orderResponse.code === 0) setOrders(orderResponse.data || []);
    if (taskQueueResponse.code === 0) setQueueHealth(taskQueueResponse.data || null);
    if (flowStatsResponse.code === 0) setFlowStats({ ...EMPTY_FLOW_STATS, ...flowStatsResponse.data });
  }, []);
  useEffect(() => { loadData(); }, [loadData]);

  const onlineNodeCount = nodes.filter(node => node.status === 1).length;
  const offlineNodeCount = nodes.length - onlineNodeCount;
  const queuePending = queueHealth ? queueHealth.queuedCount + queueHealth.retryingCount + queueHealth.exhaustedCount : 0;

  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const paidAmount = (predicate: (time: number | undefined) => boolean) => orders.filter(order => order.orderStatus === 1 && predicate(order.paidTime || order.createdTime)).reduce((sum, order) => sum + Number(order.amount || 0), 0);

  // 充值趋势：最近 14 天/最近 6 个月，直接从已经整批拉回来的 orders 里按天/按月汇总，
  // 不需要额外的后端接口
  const dailyRechargeTrend = useMemo(() => {
    const today = new Date();
    const days: TrendPoint[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const amount = orders.filter(o => o.orderStatus === 1 && isSameDay(o.paidTime || o.createdTime, d)).reduce((sum, o) => sum + Number(o.amount || 0), 0);
      days.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, amount });
    }
    return days;
  }, [orders]);
  const monthlyRechargeTrend = useMemo(() => {
    const today = new Date();
    const months: TrendPoint[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const amount = orders.filter(o => o.orderStatus === 1 && isSameMonth(o.paidTime || o.createdTime, d)).reduce((sum, o) => sum + Number(o.amount || 0), 0);
      months.push({ label: `${d.getMonth() + 1}月`, amount });
    }
    return months;
  }, [orders]);

  return <div className="dashboard-home px-4 lg:px-6 py-5 lg:py-6 max-w-[1600px] mx-auto">
    <section className="dashboard-panel mb-5 overflow-hidden">
      <div className="px-6 py-4 border-b border-default-100"><h2 className="text-sm font-semibold">数据一览</h2></div>
      {/* 两栏统计格，窄屏也保持两栏（迷你曲线在窄屏隐藏） */}
      <div className="grid grid-cols-2">
        <StatCell label="今日充值" value={currency(paidAmount(time => isSameDay(time, now)))} chart={<RechargeTrend data={dailyRechargeTrend} />} />
        <StatCell label="昨日充值" value={currency(paidAmount(time => isSameDay(time, yesterday)))} />
        <StatCell label="本月充值" value={currency(paidAmount(time => isSameMonth(time, now)))} chart={<RechargeTrend data={monthlyRechargeTrend} />} />
        <StatCell label="上月充值" value={currency(paidAmount(time => isSameMonth(time, lastMonth)))} />
        <StatCell label="今日单向流量" value={formatFlow(flowStats.todayTotal)} />
        <StatCell label="昨日单向流量" value={formatFlow(flowStats.yesterdayTotal)} />
        <StatCell label="总用户" value={String(users.length)} />
        <StatCell
          label="队列情况"
          value={queueHealth ? (queueHealth.running ? `待处理 ${queuePending}` : '队列异常') : '—'}
          hint={queueHealth ? (queueHealth.exhaustedCount > 0 ? `${queueHealth.exhaustedCount} 个已达重试上限` : `近1小时成功 ${queueHealth.successLastHour}`) : undefined}
          hintTone={queueHealth && (queueHealth.exhaustedCount > 0 || !queueHealth.running) ? 'danger' : undefined}
          onClick={() => navigate('/task-queue')}
        />
        <StatCell label="节点总数" value={String(nodes.length)} />
        <StatCell
          label="节点在线"
          value={`在线 ${onlineNodeCount}`}
          hint={`离线 ${offlineNodeCount}`}
          hintTone={offlineNodeCount > 0 ? 'danger' : undefined}
        />
      </div>
    </section>
    <NodeOnlineChart />
    <section className="grid grid-cols-1 xl:grid-cols-2 gap-5"><RankTable title="今日用户流量排行" rows={flowStats.todayUserRanking} kind="flow" /><RankTable title="昨日用户流量排行" rows={flowStats.yesterdayUserRanking} kind="flow" /><RankTable title="今日节点流量排行" rows={flowStats.todayNodeRanking} kind="node" /><RankTable title="昨日节点流量排行" rows={flowStats.yesterdayNodeRanking} kind="node" /></section>
  </div>;
}
