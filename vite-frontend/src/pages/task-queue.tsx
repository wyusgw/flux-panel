import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell
} from "@heroui/table";
import { Spinner } from "@heroui/spinner";
import toast from 'react-hot-toast';

import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { getTaskQueueList, getTaskQueueHealth, getTaskQueueOverview, getTaskQueueErrorLogs, retryTaskQueue, deleteTaskQueue } from "@/api";

interface TaskQueueItem {
  id: number;
  taskType: string;
  taskTypeLabel: string;
  summary: string;
  nodeNames: string[];
  status: 'PENDING' | 'SUCCESS';
  retryCount: number;
  lastError: string | null;
  createdTime: number;
  updatedTime: number;
  completedTime: number | null;
}

interface TaskErrorLogItem {
  id: number;
  taskType: string;
  taskTypeLabel: string;
  error: string | null;
  createdTime: number;
}

interface QueueOverviewRow {
  key: string;
  label: string;
  queuedCount: number;
  retryingCount: number;
  exhaustedCount: number;
  successLastHour: number;
  oldestWaitMs: number;
  lastError: string | null;
  lastActiveTime: number | null;
}

interface TaskQueueHealth {
  running: boolean;
  serviceStartTime: number;
  lastSweepTime: number | null;
  queuedCount: number;
  retryingCount: number;
  exhaustedCount: number;
  successLastHour: number;
  maxAutoRetry: number;
  errorLogCount: number;
  errorLogRetentionDays: number;
}

const formatDate = (timestamp?: number): string => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString();
};

// 占用时间：最早一条未完成作业已等待的时长，如 0s / 45s / 3m 12s / 2h 5m
const formatWait = (ms?: number): string => {
  const total = Math.max(0, Math.floor((ms || 0) / 1000));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  if (total < 3600) return `${m}m ${total % 60}s`;
  return `${Math.floor(total / 3600)}h ${m % 60}m`;
};

const STATE_DOT_CLASS: Record<string, string> = {
  default: 'bg-default-400',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500'
};

// 自动重试上限以后端 health.maxAutoRetry 为准，加载前先用该默认值
const DEFAULT_AUTO_RETRY_LIMIT = 20;

type QueueFilter = 'pending' | 'success' | 'all';

// 任务展示状态：由真实执行结果推导，未失败过的排队任务不显示为"待重试"
const getItemState = (item: TaskQueueItem, limit: number): { label: string; color: 'default' | 'success' | 'warning' | 'danger' } => {
  if (item.status === 'SUCCESS') return { label: '成功', color: 'success' };
  if (item.retryCount >= limit) return { label: '已达重试上限', color: 'danger' };
  if (item.retryCount > 0) return { label: '重试中', color: 'warning' };
  return { label: '排队中', color: 'default' };
};

const STAT_TONE_CLASS: Record<string, string> = {
  warning: 'text-warning-600',
  success: 'text-success-600'
};

const StatCard = ({ label, value, tone = 'default', onPress }: { label: string; value: string | number; tone?: 'default' | 'warning' | 'success'; onPress?: () => void }) => (
  <Card
    isPressable={!!onPress}
    onPress={onPress}
    className={`shadow-sm border border-default-200 ${onPress ? 'hover:border-primary-300 transition-colors' : ''}`}
  >
    <CardBody className="py-3 px-4">
      <p className="text-xs text-default-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${tone !== 'default' && Number(value) > 0 ? STAT_TONE_CLASS[tone] : 'text-foreground'}`}>{value}</p>
    </CardBody>
  </Card>
);

const HealthCard = ({ health }: { health: TaskQueueHealth | null }) => (
  <Card className="shadow-sm border border-default-200">
    <CardBody className="py-3 px-4">
      <p className="text-xs text-default-500">队列总状态</p>
      {health ? (
        <>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`inline-block w-2 h-2 rounded-full ${health.running ? 'bg-success-500' : 'bg-danger-500'}`} />
            <span className={`text-2xl font-semibold ${health.running ? 'text-foreground' : 'text-danger-600'}`}>
              {health.running ? '运行中' : '异常'}
            </span>
          </div>
          <p className="text-xs text-default-400 mt-1">
            最近一次定时扫描：{health.lastSweepTime ? formatDate(health.lastSweepTime) : '尚未执行'}
          </p>
        </>
      ) : (
        <p className="text-2xl font-semibold mt-1 text-foreground">—</p>
      )}
    </CardBody>
  </Card>
);

export default function TaskQueuePage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<TaskQueueItem[]>([]);
  const [health, setHealth] = useState<TaskQueueHealth | null>(null);
  const [overview, setOverview] = useState<QueueOverviewRow[]>([]);
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<TaskQueueItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<TaskQueueItem | null>(null);

  const [filter, setFilter] = useState<QueueFilter>('pending');

  const [errorLogsModalOpen, setErrorLogsModalOpen] = useState(false);
  const [errorLogs, setErrorLogs] = useState<TaskErrorLogItem[]>([]);
  const [errorLogsLoading, setErrorLogsLoading] = useState(false);

  const openErrorLogs = async () => {
    setErrorLogsModalOpen(true);
    setErrorLogsLoading(true);
    try {
      const res = await getTaskQueueErrorLogs();
      if (res.code === 0) {
        setErrorLogs(res.data || []);
      } else {
        toast.error(res.msg || '获取报错日志失败');
      }
    } catch (error) {
      console.error('获取报错日志失败:', error);
      toast.error('获取报错日志失败');
    } finally {
      setErrorLogsLoading(false);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, healthRes, overviewRes] = await Promise.all([getTaskQueueList(), getTaskQueueHealth(), getTaskQueueOverview()]);
      if (overviewRes.code === 0) {
        setOverview(overviewRes.data || []);
      }
      if (listRes.code === 0) {
        setItems(listRes.data || []);
      } else {
        toast.error(listRes.msg || '获取队列失败');
      }
      if (healthRes.code === 0) {
        setHealth(healthRes.data || null);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const retryLimit = health?.maxAutoRetry ?? DEFAULT_AUTO_RETRY_LIMIT;

  const pendingCount = (health?.queuedCount ?? 0) + (health?.retryingCount ?? 0) + (health?.exhaustedCount ?? 0);

  const visibleItems = useMemo(() => {
    const filtered = items.filter(item => {
      if (filter === 'pending') return item.status !== 'SUCCESS';
      if (filter === 'success') return item.status === 'SUCCESS';
      return true;
    });
    return filtered.sort((a, b) => b.updatedTime - a.updatedTime);
  }, [items, filter]);

  const handleRetry = async (item: TaskQueueItem) => {
    setRetryingId(item.id);
    try {
      const res = await retryTaskQueue(item.id);
      if (res.code === 0) {
        toast.success('重试成功');
        loadData();
      } else {
        toast.error(res.msg || '重试失败');
        loadData();
      }
    } catch (error) {
      toast.error('重试失败');
    } finally {
      setRetryingId(null);
    }
  };

  const handleDelete = (item: TaskQueueItem) => {
    setItemToDelete(item);
    setDeleteModalOpen(true);
  };

  const handleViewDetail = (item: TaskQueueItem) => {
    setDetailItem(item);
    setDetailModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await deleteTaskQueue(itemToDelete.id);
      if (res.code === 0) {
        toast.success('已从队列移除');
        setDeleteModalOpen(false);
        loadData();
      } else {
        toast.error(res.msg || '移除失败');
      }
    } catch (error) {
      toast.error('移除失败');
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
      <div className="mb-4">
        <h1 className="text-xl font-semibold">队列监控</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <HealthCard health={health} />
        <StatCard label="待处理" value={pendingCount} />
        <StatCard label="近一小时成功" value={health?.successLastHour ?? 0} tone="success" />
        <StatCard label={`${health?.errorLogRetentionDays ?? 7}日内报错数量`} value={health?.errorLogCount ?? 0} tone="warning" onPress={openErrorLogs} />
      </div>

      <Card className="shadow-sm border border-default-200 mb-4">
        <CardBody className="p-0">
          <div className="px-4 pt-4 pb-1">
            <h2 className="text-base font-semibold">当前作业详情</h2>
          </div>
          <div className="settings-table-scroll">
            <Table
              removeWrapper
              aria-label="当前作业详情"
              classNames={{ base: "w-full", th: "management-table-heading", td: "management-table-cell" }}
            >
              <TableHeader>
                <TableColumn>队列名称</TableColumn>
                <TableColumn>作业量</TableColumn>
                <TableColumn>任务量</TableColumn>
                <TableColumn align="end">占用时间</TableColumn>
              </TableHeader>
              <TableBody items={overview} emptyContent={<EmptyState text="暂无队列数据" />}>
                {(row: QueueOverviewRow) => (
                  <TableRow key={row.key}>
                    <TableCell><span className="text-default-600">{row.label}</span></TableCell>
                    <TableCell>
                      <span className={`font-mono ${row.exhaustedCount > 0 ? 'text-danger-600' : 'text-default-500'}`} title={row.exhaustedCount > 0 ? `${row.exhaustedCount} 个已达重试上限` : undefined}>
                        {row.queuedCount + row.retryingCount + row.exhaustedCount}
                      </span>
                    </TableCell>
                    <TableCell><span className="font-mono text-default-500">{row.successLastHour}</span></TableCell>
                    <TableCell><span className="font-mono text-default-500 block text-right">{formatWait(row.oldestWaitMs)}</span></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {([['pending', '待处理'], ['success', '已完成'], ['all', '全部']] as [QueueFilter, string][]).map(([key, label]) => (
          <Button key={key} size="sm" variant={filter === key ? 'solid' : 'flat'} color={filter === key ? 'primary' : 'default'} onPress={() => setFilter(key)}>
            {label}
          </Button>
        ))}
        {(health?.exhaustedCount ?? 0) > 0 && (
          <span className="text-xs text-danger-600">{health?.exhaustedCount} 个任务已达重试上限，需手动处理</span>
        )}
      </div>

      <Card className="shadow-sm border border-default-200">
        <CardBody className="p-0">
          <div className="settings-table-scroll">
            <Table
              removeWrapper
              aria-label="队列监控"
              classNames={{ base: "w-full", th: "management-table-heading", td: "management-table-cell" }}
            >
              <TableHeader>
                <TableColumn>类型</TableColumn>
                <TableColumn>内容</TableColumn>
                <TableColumn>状态</TableColumn>
                <TableColumn>重试次数</TableColumn>
                <TableColumn>错误信息</TableColumn>
                <TableColumn>更新时间</TableColumn>
                <TableColumn align="end">操作</TableColumn>
              </TableHeader>
              <TableBody items={visibleItems} emptyContent={<EmptyState text={filter === 'success' ? '暂无已完成的任务' : '暂无待处理的任务'} />}>
                {(item: TaskQueueItem) => {
                  const state = getItemState(item, retryLimit);
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{item.taskTypeLabel}</TableCell>
                      <TableCell>
                        <span className="line-clamp-2 max-w-[260px] inline-block">{item.summary || '-'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${STATE_DOT_CLASS[state.color]}`} />
                          {state.label}
                        </span>
                      </TableCell>
                      <TableCell>{item.retryCount}</TableCell>
                      <TableCell>
                        <span className="text-default-500 line-clamp-2 max-w-[220px] inline-block">{item.lastError || '-'}</span>
                      </TableCell>
                      <TableCell>{formatDate(item.updatedTime)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="light" color="primary" onPress={() => handleViewDetail(item)}>详情</Button>
                          {item.status !== 'SUCCESS' && (
                            <Button size="sm" variant="light" color="primary" isLoading={retryingId === item.id} onPress={() => handleRetry(item)}>重试</Button>
                          )}
                          <Button size="sm" variant="light" color="danger" onPress={() => handleDelete(item)}>移除</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }}
              </TableBody>
            </Table>
          </div>
        </CardBody>
      </Card>

      <ConfirmDialog
        isOpen={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="确认移除"
        message={<>确定要把这条「{itemToDelete?.taskTypeLabel}」任务从重试队列移除吗？移除后不会再自动重试。</>}
        confirmText="确定"
        confirmColor="danger"
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />

      <Modal isOpen={detailModalOpen} onOpenChange={setDetailModalOpen} size="lg" scrollBehavior="outside" backdrop="blur" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-lg font-bold">作业详情</h2>
                {detailItem && <span className="text-small text-default-500">#{detailItem.id}</span>}
              </ModalHeader>
              <ModalBody className="pb-6">
                {detailItem && (
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{detailItem.taskTypeLabel}</span>
                      <span className="inline-flex items-center gap-1.5 text-default-600">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${STATE_DOT_CLASS[getItemState(detailItem, retryLimit).color]}`} />
                        {getItemState(detailItem, retryLimit).label}
                      </span>
                    </div>

                    <div>
                      <p className="text-xs text-default-500 mb-1">任务内容</p>
                      <p className="text-foreground whitespace-pre-wrap break-all">{detailItem.summary || '—'}</p>
                    </div>

                    <div>
                      <p className="text-xs text-default-500 mb-1">关联节点</p>
                      <p className="text-foreground">{detailItem.nodeNames && detailItem.nodeNames.length > 0 ? detailItem.nodeNames.join(' / ') : '—'}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-default-500 mb-1">重试次数</p>
                        <p className="text-foreground">{detailItem.retryCount}</p>
                      </div>
                      <div>
                        <p className="text-xs text-default-500 mb-1">创建时间</p>
                        <p className="text-foreground">{formatDate(detailItem.createdTime)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-default-500 mb-1">更新时间</p>
                        <p className="text-foreground">{formatDate(detailItem.updatedTime)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-default-500 mb-1">完成时间</p>
                        <p className="text-foreground">{detailItem.completedTime ? formatDate(detailItem.completedTime) : '—'}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-default-500 mb-1">最近错误</p>
                      <p className="text-foreground whitespace-pre-wrap break-all">{detailItem.lastError || '—'}</p>
                    </div>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>关闭</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal isOpen={errorLogsModalOpen} onOpenChange={setErrorLogsModalOpen} size="3xl" scrollBehavior="inside" backdrop="blur" placement="center">
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-lg font-bold">{health?.errorLogRetentionDays ?? 7}日内报错详情</h2>
                <span className="text-small text-default-500 font-normal">
                  共 {health?.errorLogCount ?? errorLogs.length} 条{errorLogs.length >= 200 ? '，仅显示最近 200 条' : ''}
                </span>
              </ModalHeader>
              <ModalBody className="pb-6">
                {errorLogsLoading ? (
                  <div className="flex justify-center py-8"><Spinner size="sm" /></div>
                ) : errorLogs.length === 0 ? (
                  <div className="text-xs text-default-400 border border-default-200 rounded-lg px-4 py-3">暂无报错记录，一切正常</div>
                ) : (
                  <div className="space-y-2">
                    {errorLogs.map((log) => (
                      <div key={log.id} className="border border-default-200 rounded-lg px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{log.taskTypeLabel}</span>
                          <span className="text-xs text-default-400">{formatDate(log.createdTime)}</span>
                        </div>
                        <p className="text-sm text-foreground whitespace-pre-wrap break-all mt-2">{log.error || '—'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
