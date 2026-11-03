import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/table";
import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from "recharts";

import { StatCell } from "@/components/stat-cell";
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

// 节点在线 / 离线数量曲线：最近 24 小时每 5 分钟一个采样点（后端定时记录，离线数 = 节点总数 - 在线数），
// 两条线用状态色（在线绿、离线红），顶部图例可点击：点「在线」或「离线」只看那一条线，再点一次恢复两条都看；
// 悬停显示时间与当时可见的数量；
// 没有任何采样点时提示「数据采集中」，只有 1 个点时先画一个点，接口请求失败时提示「数据不可用」
type OnlinePoint = { time: number; online: number; total: number };
type OnlineChartPoint = OnlinePoint & { offline: number };
const ONLINE_COLOR = '#0ca30c';
const OFFLINE_COLOR = '#d03b3b';
const formatClock = (time: number) => { const d = new Date(time); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const NodeOnlineTrend = ({ data, failed }: { data: OnlinePoint[]; failed: boolean }) => {
  const chartData = useMemo<OnlineChartPoint[]>(() => data.map(point => ({ ...point, offline: Math.max(0, point.total - point.online) })), [data]);
  const maxTotal = Math.max(1, ...data.map(point => point.total));
  // 当前只看哪一条线；null 表示两条都显示
  const [focus, setFocus] = useState<'online' | 'offline' | null>(null);
  const showOnline = focus !== 'offline';
  const showOffline = focus !== 'online';
  const toggleFocus = (key: 'online' | 'offline') => setFocus(current => current === key ? null : key);
  // 只有 1 个采样点时折线画不出来，改为显示圆点
  const singlePoint = chartData.length === 1;
  return (
    <div className="hidden sm:block flex-1 min-w-[96px] max-w-[200px]">
      <div className="flex items-center justify-end gap-3 text-[11px] text-default-500">
        <button type="button" aria-pressed={focus === 'online'} title={focus === 'online' ? '点击恢复显示全部' : '只看在线'} onClick={() => toggleFocus('online')} className={`inline-flex items-center gap-1 transition-opacity ${showOnline ? '' : 'opacity-40'} ${focus === 'online' ? 'text-foreground font-medium' : ''}`}><span className="inline-block w-2 h-0.5 rounded-full" style={{ background: ONLINE_COLOR }} />在线</button>
        <button type="button" aria-pressed={focus === 'offline'} title={focus === 'offline' ? '点击恢复显示全部' : '只看离线'} onClick={() => toggleFocus('offline')} className={`inline-flex items-center gap-1 transition-opacity ${showOffline ? '' : 'opacity-40'} ${focus === 'offline' ? 'text-foreground font-medium' : ''}`}><span className="inline-block w-2 h-0.5 rounded-full" style={{ background: OFFLINE_COLOR }} />离线</button>
      </div>
      <div className="h-12 mt-1">
        {failed ? (
          <div className="h-full flex items-center justify-end text-xs text-default-400">数据不可用</div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-end text-xs text-default-400">数据采集中</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 3, right: 4, bottom: 3, left: 4 }}>
              <YAxis hide domain={[0, maxTotal]} />
              <Tooltip
                cursor={{ stroke: 'currentColor', strokeOpacity: 0.15 }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const row = payload[0].payload as OnlineChartPoint;
                  return (
                    <div className="bg-white dark:bg-default-100 border border-default-200 rounded-lg px-2 py-1 text-[11px] shadow-lg">
                      <p className="text-default-500">{formatClock(row.time)}（最近 24 小时）</p>
                      <p className="font-medium text-foreground">{[showOnline && `在线 ${row.online}`, showOffline && `离线 ${row.offline}`].filter(Boolean).join('　')}</p>
                    </div>
                  );
                }}
              />
              {showOnline && <Line type="monotone" dataKey="online" stroke={ONLINE_COLOR} strokeWidth={2} dot={singlePoint ? { r: 3, fill: ONLINE_COLOR, stroke: 'none' } : false} activeDot={false} isAnimationActive={false} />}
              {showOffline && <Line type="monotone" dataKey="offline" stroke={OFFLINE_COLOR} strokeWidth={2} dot={singlePoint ? { r: 3, fill: OFFLINE_COLOR, stroke: 'none' } : false} activeDot={false} isAnimationActive={false} />}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

function RankTable({ title, rows, kind }: { title: string; rows: { name: string; value: number }[]; kind: 'flow' | 'node' }) {
  const [view, setView] = useState<'table' | 'chart'>('table');
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
  const [onlineTrend, setOnlineTrend] = useState<OnlinePoint[]>([]);
  const [onlineTrendFailed, setOnlineTrendFailed] = useState(false);
  const loadData = useCallback(async () => {
    const [userResponse, nodeResponse, orderResponse, taskQueueResponse, flowStatsResponse] = await Promise.all([
      getAllUsers({ current: 1, size: 1000 }), getNodeList(), getAdminOrderList(), getTaskQueueHealth(), getDashboardFlowStats(),
    ]);
    if (userResponse.code === 0) setUsers(userResponse.data || []);
    if (nodeResponse.code === 0) setNodes(nodeResponse.data || []);
    if (orderResponse.code === 0) setOrders(orderResponse.data || []);
    if (taskQueueResponse.code === 0) setQueueHealth(taskQueueResponse.data || null);
    if (flowStatsResponse.code === 0) setFlowStats({ ...EMPTY_FLOW_STATS, ...flowStatsResponse.data });
    // 在线曲线单独请求：失败（如后端尚未升级）只影响这张小图，不拖累整个仪表盘
    try {
      const trendResponse = await getNodeOnlineTrend();
      if (trendResponse.code === 0) {
        setOnlineTrend(trendResponse.data || []);
        setOnlineTrendFailed(false);
      } else {
        setOnlineTrendFailed(true);
      }
    } catch {
      setOnlineTrendFailed(true);
    }
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
          chart={<NodeOnlineTrend data={onlineTrend} failed={onlineTrendFailed} />}
        />
      </div>
    </section>
    <section className="grid grid-cols-1 xl:grid-cols-2 gap-5"><RankTable title="今日用户流量排行" rows={flowStats.todayUserRanking} kind="flow" /><RankTable title="昨日用户流量排行" rows={flowStats.yesterdayUserRanking} kind="flow" /><RankTable title="今日节点流量排行" rows={flowStats.todayNodeRanking} kind="node" /><RankTable title="昨日节点流量排行" rows={flowStats.yesterdayNodeRanking} kind="node" /></section>
  </div>;
}
