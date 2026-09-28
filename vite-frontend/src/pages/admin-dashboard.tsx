import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from "recharts";

import { getAllUsers, getNodeList, getAdminOrderList, getTaskQueueList, getTaskQueueMetrics, getDashboardFlowStats } from "@/api";

type Order = { amount?: number; orderStatus?: number; createdTime?: number; paidTime?: number };
type User = { id: number; user: string; name?: string; inFlow?: number; outFlow?: number };
type Node = { id: number; name: string; ip?: string; status?: number };
type TaskQueueItem = { taskTypeLabel: string; status: 'PENDING' | 'SUCCESS'; retryCount: number; createdTime: number };
type TaskQueueMetrics = { successLastHour: number; failureLastHour: number; successLast24h: number; failureLast24h: number };
const EMPTY_TASK_QUEUE_METRICS: TaskQueueMetrics = { successLastHour: 0, failureLastHour: 0, successLast24h: 0, failureLast24h: 0 };
type RankRow = { name: string; value: number };
type FlowStats = {
  todayTotal: number; yesterdayTotal: number;
  todayUserRanking: RankRow[]; yesterdayUserRanking: RankRow[];
  todayNodeRanking: RankRow[]; yesterdayNodeRanking: RankRow[];
};
const EMPTY_FLOW_STATS: FlowStats = { todayTotal: 0, yesterdayTotal: 0, todayUserRanking: [], yesterdayUserRanking: [], todayNodeRanking: [], yesterdayNodeRanking: [] };

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

// 赛车仪表盘风格的拱状仪表：用于展示"在线节点占比"这类比例数据。
// 手绘 SVG（不依赖图表库）：240° 宽扫角弧线 + 红/黄/绿三段色带 + 刻度线 + 指针，
// 跟普通的半圆进度弧比起来更像真正的仪表盘（车速表/转速表那种），而不是一条简单的进度条
const polarPoint = (cx: number, cy: number, r: number, angleDeg: number) => {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
};
const describeArc = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
  const start = polarPoint(cx, cy, r, startAngle);
  const end = polarPoint(cx, cy, r, endAngle);
  const largeArcFlag = startAngle - endAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
};

const GAUGE_START = 210; // 起始角（左下方），标准数学角度制，逆时针为正
const GAUGE_END = -30;   // 结束角（右下方），总扫角 240°
const angleForPercent = (p: number) => GAUGE_START - (GAUGE_START - GAUGE_END) * (Math.min(100, Math.max(0, p)) / 100);

const SpeedometerGauge = ({ percent, value, sublabel }: { percent: number; value: string; sublabel: string }) => {
  // 指针半径明显短于刻度环，且数值文字放在刻度环最低点（角度 210°/-30° 时）以下留足间距，
  // 两者才不会在指针指向 0% 或 100%（也就是最贴近底部文字的角度）时撞在一起
  const width = 190, cx = 95, cy = 92, r = 50, trackWidth = 10;
  const clamped = Math.min(100, Math.max(0, percent));
  const zones: [number, number, string][] = [[0, 30, '#e5484d'], [30, 70, '#f5a524'], [70, 100, '#17c964']];
  const majorTicks = [0, 50, 100];
  const minorTicks = [10, 20, 30, 40, 60, 70, 80, 90];
  const trackOuter = r + trackWidth / 2;
  const needleAngle = angleForPercent(clamped);
  const needleTip = polarPoint(cx, cy, r - trackWidth - 12, needleAngle);
  // 指针根部做成一个很窄的三角形（而不是单纯一条线），更接近真实指针的锥形
  const needleBaseL = polarPoint(cx, cy, 5, needleAngle + 90);
  const needleBaseR = polarPoint(cx, cy, 5, needleAngle - 90);
  // 数字刻度标签靠水平位置决定对齐方式，避免贴着刻度线边缘显得挤
  const labelAnchor = (t: number) => t === 0 ? 'start' : t === 100 ? 'end' : 'middle';

  return (
    <svg viewBox={`0 0 ${width} 182`} className="w-full max-w-[190px] mx-auto block">
      {zones.map(([from, to, color]) => (
        <path
          key={color}
          d={describeArc(cx, cy, r, angleForPercent(from), angleForPercent(to))}
          fill="none"
          stroke={color}
          strokeWidth={trackWidth}
          strokeLinecap="butt"
        />
      ))}
      {/* 刻度线画在色带外圈，而不是叠在色带上面——叠在鲜艳的色带上灰色细线基本看不出来 */}
      {minorTicks.map(t => {
        const outer = polarPoint(cx, cy, trackOuter + 6, angleForPercent(t));
        const inner = polarPoint(cx, cy, trackOuter + 2, angleForPercent(t));
        return <line key={t} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} strokeWidth={1.5} className="stroke-default-400 dark:stroke-default-300" />;
      })}
      {majorTicks.map(t => {
        const outer = polarPoint(cx, cy, trackOuter + 9, angleForPercent(t));
        const inner = polarPoint(cx, cy, trackOuter + 2, angleForPercent(t));
        const labelPos = polarPoint(cx, cy, trackOuter + 20, angleForPercent(t));
        return (
          <g key={t}>
            <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} strokeWidth={2} className="stroke-default-600 dark:stroke-default-200" />
            <text x={labelPos.x} y={labelPos.y + 4} textAnchor={labelAnchor(t)} className="fill-default-500" style={{ fontSize: 10 }}>{t}</text>
          </g>
        );
      })}
      <line
        x1={needleBaseL.x} y1={needleBaseL.y}
        x2={needleTip.x} y2={needleTip.y}
        strokeWidth={3} strokeLinecap="round"
        className="stroke-foreground"
        style={{ transition: 'all .4s ease' }}
      />
      <line
        x1={needleBaseR.x} y1={needleBaseR.y}
        x2={needleTip.x} y2={needleTip.y}
        strokeWidth={3} strokeLinecap="round"
        className="stroke-foreground"
        style={{ transition: 'all .4s ease' }}
      />
      <circle cx={cx} cy={cy} r={5} className="fill-foreground" />
      <text x={cx} y={157} textAnchor="middle" className="fill-foreground" style={{ fontSize: 18, fontWeight: 700 }}>{value}</text>
      <text x={cx} y={172} textAnchor="middle" className="fill-default-500" style={{ fontSize: 10.5 }}>{sublabel}</text>
    </svg>
  );
};

// 充值趋势迷你折线图：数据一览里"今/昨日充值"与"本/上月充值"两格用的都是同一个组件，
// 只是喂进去的趋势数据范围不同（按天 14 天 / 按月 6 个月）
type TrendPoint = { label: string; amount: number };
const TrendSparkline = ({ title, current, compareLabel, compareValue, data }: { title: string; current: string; compareLabel: string; compareValue: string; data: TrendPoint[] }) => (
  <div className="p-3 min-h-24">
    <p className="text-xs text-default-500">{title}</p>
    <div className="mt-1 flex items-baseline justify-between gap-2">
      <p className="text-base font-semibold text-foreground whitespace-nowrap">{current}</p>
      <p className="text-[11px] text-default-400 whitespace-nowrap">{compareLabel} {compareValue}</p>
    </div>
    <div className="h-11 mt-1 -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 4, bottom: 0, left: 4 }}>
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
  </div>
);

function RankTable({ title, rows, kind }: { title: string; rows: { name: string; value: number }[]; kind: 'flow' | 'node' }) {
  const [view, setView] = useState<'table' | 'chart'>('table');
  return (
    <Card className="dashboard-panel min-w-0" shadow="none">
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
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [taskQueueItems, setTaskQueueItems] = useState<TaskQueueItem[]>([]);
  const [taskQueueMetrics, setTaskQueueMetrics] = useState<TaskQueueMetrics>(EMPTY_TASK_QUEUE_METRICS);
  const [flowStats, setFlowStats] = useState<FlowStats>(EMPTY_FLOW_STATS);
  const loadData = useCallback(async () => {
    const [userResponse, nodeResponse, orderResponse, taskQueueResponse, taskQueueMetricsResponse, flowStatsResponse] = await Promise.all([
      getAllUsers({ current: 1, size: 1000 }), getNodeList(), getAdminOrderList(), getTaskQueueList(), getTaskQueueMetrics(), getDashboardFlowStats(),
    ]);
    if (userResponse.code === 0) setUsers(userResponse.data || []);
    if (nodeResponse.code === 0) setNodes(nodeResponse.data || []);
    if (orderResponse.code === 0) setOrders(orderResponse.data || []);
    if (taskQueueResponse.code === 0) setTaskQueueItems(taskQueueResponse.data || []);
    if (taskQueueMetricsResponse.code === 0) setTaskQueueMetrics({ ...EMPTY_TASK_QUEUE_METRICS, ...taskQueueMetricsResponse.data });
    if (flowStatsResponse.code === 0) setFlowStats({ ...EMPTY_FLOW_STATS, ...flowStatsResponse.data });
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
  const onlineNodeCount = nodes.filter(node => node.status === 1).length;
  const onlineNodePercent = nodes.length > 0 ? (onlineNodeCount / nodes.length) * 100 : 0;

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
    <div className="flex items-center justify-between mb-5"><div><p className="text-xs font-medium tracking-[0.16em] text-blue-400 uppercase">Console</p><h1 className="mt-1 text-xl font-semibold">仪表盘</h1></div></div>
    <section className="dashboard-panel mb-5 overflow-hidden">
      <div className="px-4 py-3 border-b border-default-100"><h2 className="text-sm font-semibold">数据一览</h2></div>
      <div className="grid grid-cols-2 md:grid-cols-4 border-b border-default-100">
        <div className="md:border-r border-b md:border-b-0 border-default-100">
          <TrendSparkline title="今日充值" current={currency(paidAmount(time => isSameDay(time, now)))} compareLabel="昨日" compareValue={currency(paidAmount(time => isSameDay(time, yesterday)))} data={dailyRechargeTrend} />
        </div>
        <div className="md:border-r border-b md:border-b-0 border-default-100">
          <TrendSparkline title="本月充值" current={currency(paidAmount(time => isSameMonth(time, now)))} compareLabel="上月" compareValue={currency(paidAmount(time => isSameMonth(time, lastMonth)))} data={monthlyRechargeTrend} />
        </div>
        <div className="p-4 min-h-24 md:border-r border-default-100">
          <p className="text-xs text-default-500">单向流量</p>
          <p className="mt-2 text-sm text-foreground">今日 <span className="font-semibold">{formatFlow(flowStats.todayTotal)}</span></p>
          <p className="mt-1 text-sm text-default-500">昨日 {formatFlow(flowStats.yesterdayTotal)}</p>
        </div>
        <div className="p-4 min-h-24"><p className="text-xs text-default-500">总用户</p><p className="mt-2 text-lg font-semibold text-foreground">{users.length}</p></div>
      </div>
      {/* 单独一个 3 栏网格，而不是延续上面的 4 栏：这一排只有 3 个格子，沿用 4 栏会在最右边空出一格 */}
      <div className="grid grid-cols-3">
        <div className="p-4 min-h-24 border-r border-default-100 flex flex-col justify-center"><p className="text-xs text-default-500">节点总数</p><p className="mt-2 text-lg font-semibold text-foreground">{nodes.length}</p></div>
        <div className="p-3 min-h-24 border-r border-default-100 flex flex-col items-center justify-center"><div className="w-full max-w-[200px]"><SpeedometerGauge percent={onlineNodePercent} value={`${onlineNodeCount} / ${nodes.length}`} sublabel="在线节点" /></div></div>
        <div className="p-4 min-h-24 flex flex-col justify-center"><p className="text-xs text-default-500">待处理任务</p><p className={`mt-2 text-lg font-semibold ${taskQueueStats.total > 0 ? 'text-warning-600' : 'text-foreground'}`}>{taskQueueStats.total}</p></div>
      </div>
    </section>
    <section className="dashboard-panel mb-5 overflow-hidden">
      <div className="px-4 py-3 border-b border-default-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold">任务队列监控</h2>
        <Button size="sm" variant="light" onPress={() => navigate('/task-queue')}>查看详情</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3">
        <div className="p-4 min-h-24 md:border-r border-b md:border-b-0 border-default-100"><p className="text-xs text-default-500">当前作业量（待处理）</p><p className="mt-2 text-lg font-semibold text-foreground">{taskQueueStats.total}</p></div>
        <div className="p-4 min-h-24 md:border-r border-b md:border-b-0 border-default-100"><p className="text-xs text-default-500">24小时内新增</p><p className="mt-2 text-lg font-semibold text-foreground">{taskQueueStats.last24h}</p></div>
        <div className="p-4 min-h-24 border-b md:border-b-0 border-default-100"><p className="text-xs text-default-500">超过自动重试上限</p><p className={`mt-2 text-lg font-semibold ${taskQueueStats.stuck > 0 ? 'text-warning-600' : 'text-foreground'}`}>{taskQueueStats.stuck}</p></div>
        <div className="p-4 min-h-24 md:border-r border-default-100"><p className="text-xs text-default-500">近一小时处理量</p><p className="mt-2 text-lg font-semibold text-foreground">{taskQueueMetrics.successLastHour + taskQueueMetrics.failureLastHour}</p></div>
        <div className="p-4 min-h-24 md:border-r border-default-100"><p className="text-xs text-default-500">24小时内成功</p><p className="mt-2 text-lg font-semibold text-foreground">{taskQueueMetrics.successLast24h}</p></div>
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
    <section className="grid grid-cols-1 xl:grid-cols-2 gap-5"><RankTable title="今日用户流量排行" rows={flowStats.todayUserRanking} kind="flow" /><RankTable title="昨日用户流量排行" rows={flowStats.yesterdayUserRanking} kind="flow" /><RankTable title="今日节点流量排行" rows={flowStats.todayNodeRanking} kind="node" /><RankTable title="昨日节点流量排行" rows={flowStats.yesterdayNodeRanking} kind="node" /></section>
  </div>;
}
