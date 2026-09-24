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
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import toast from 'react-hot-toast';

import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { getTaskQueueList, getTaskQueueHealth, retryTaskQueue, deleteTaskQueue } from "@/api";

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

interface TaskQueueHealth {
  running: boolean;
  serviceStartTime: number;
  lastSweepTime: number | null;
}

const formatDate = (timestamp?: number): string => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString();
};

const IconDelete = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M4 6h12M8 6V4.5A1.5 1.5 0 019.5 3h1A1.5 1.5 0 0112 4.5V6m-6 0v9.5A1.5 1.5 0 007.5 17h5a1.5 1.5 0 001.5-1.5V6M8.5 9.5v4M11.5 9.5v4" />
  </svg>
);

const TASK_TYPE_COLORS: Record<string, "primary" | "secondary" | "default"> = {
  FORWARD_SYNC: "primary",
  TELEGRAM_NOTIFY: "secondary"
};

// 需与后端 TaskQueueServiceImpl.MAX_AUTO_RETRY 保持一致：超过这个次数后不再自动重试，仅供手动处理
const AUTO_RETRY_LIMIT = 20;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<TaskQueueItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<TaskQueueItem | null>(null);

  const [currentJobsModalOpen, setCurrentJobsModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, healthRes] = await Promise.all([getTaskQueueList(), getTaskQueueHealth()]);
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

  const stats = useMemo(() => {
    const byType = new Map<string, number>();
    let pendingTotal = 0;
    let stuck = 0;
    let last24h = 0;
    let successLast24h = 0;
    let processedLastHour = 0;
    const now = Date.now();
    for (const item of items) {
      // 更新时间落在近一小时内，代表这条任务近一小时内被重试/处理过一次（不论结果是成功还是仍失败）
      if (now - item.updatedTime <= HOUR_MS) processedLastHour++;
      if (item.status === 'SUCCESS') {
        if (item.completedTime && now - item.completedTime <= DAY_MS) successLast24h++;
        continue;
      }
      pendingTotal++;
      byType.set(item.taskTypeLabel, (byType.get(item.taskTypeLabel) || 0) + 1);
      if (item.retryCount >= AUTO_RETRY_LIMIT) stuck++;
      if (now - item.createdTime <= DAY_MS) last24h++;
    }
    return {
      total: pendingTotal,
      byType: Array.from(byType.entries()),
      stuck,
      last24h,
      successLast24h,
      processedLastHour
    };
  }, [items]);

  const pendingItems = useMemo(() =>
    items.filter(item => item.status !== 'SUCCESS').sort((a, b) => b.updatedTime - a.updatedTime),
    [items]
  );

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
        <p className="text-sm text-default-500 mt-1">
          各类异步任务（转发同步、Telegram 通知发送等）失败时会登记在这里，相关节点重新上线或定时兜底扫描会自动重试，也可以在这里手动立即重试。
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 mb-4">
        <HealthCard health={health} />
        <StatCard label="当前作业量" value={stats.total} onPress={() => setCurrentJobsModalOpen(true)} />
        <StatCard label="近一小时处理量" value={stats.processedLastHour} />
        <StatCard label="24小时内新增" value={stats.last24h} />
        <StatCard label="24小时内成功" value={stats.successLast24h} tone="success" />
        <StatCard label="超过自动重试上限" value={stats.stuck} tone="warning" />
        <Card className="shadow-sm border border-default-200">
          <CardBody className="py-3 px-4">
            <p className="text-xs text-default-500">按类型分布</p>
            {stats.byType.length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {stats.byType.map(([label, count]) => (
                  <Chip key={label} size="sm" variant="flat">{label} {count}</Chip>
                ))}
              </div>
            ) : (
              <p className="text-2xl font-semibold mt-1 text-foreground">0</p>
            )}
          </CardBody>
        </Card>
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
                <TableColumn>任务内容</TableColumn>
                <TableColumn>关联节点</TableColumn>
                <TableColumn>状态</TableColumn>
                <TableColumn>重试次数</TableColumn>
                <TableColumn>最近错误</TableColumn>
                <TableColumn>更新时间</TableColumn>
                <TableColumn align="end">操作</TableColumn>
              </TableHeader>
              <TableBody items={items} emptyContent={<EmptyState text="暂无待重试的任务，一切正常" />}>
                {(item: TaskQueueItem) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Chip size="sm" variant="flat" color={TASK_TYPE_COLORS[item.taskType] || "default"}>
                        {item.taskTypeLabel}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-foreground line-clamp-2 max-w-[260px] inline-block">{item.summary || '—'}</span>
                    </TableCell>
                    <TableCell>
                      {item.nodeNames && item.nodeNames.length > 0 ? item.nodeNames.join(' / ') : '—'}
                    </TableCell>
                    <TableCell>
                      {item.status === 'SUCCESS' ? (
                        <Chip size="sm" variant="flat" color="success">成功</Chip>
                      ) : item.retryCount >= AUTO_RETRY_LIMIT ? (
                        <Chip size="sm" variant="flat" color="danger">已达重试上限</Chip>
                      ) : (
                        <Chip size="sm" variant="flat" color="default">待重试</Chip>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip size="sm" variant="flat" color={item.retryCount > 0 ? 'warning' : 'default'}>{item.retryCount}</Chip>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-default-500 line-clamp-2 max-w-[220px] inline-block">{item.lastError || '—'}</span>
                    </TableCell>
                    <TableCell>{formatDate(item.updatedTime)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="flat" color="default" onPress={() => handleViewDetail(item)}>
                          查看详情
                        </Button>
                        {item.status !== 'SUCCESS' && (
                          <Button size="sm" variant="flat" color="default" isLoading={retryingId === item.id} onPress={() => handleRetry(item)}>
                            立即重试
                          </Button>
                        )}
                        <Button size="sm" variant="light" color="danger" isIconOnly onPress={() => handleDelete(item)}>
                          <IconDelete />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
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
                      <Chip size="sm" variant="flat" color={TASK_TYPE_COLORS[detailItem.taskType] || 'default'}>{detailItem.taskTypeLabel}</Chip>
                      {detailItem.status === 'SUCCESS' ? (
                        <Chip size="sm" variant="flat" color="success">成功</Chip>
                      ) : detailItem.retryCount >= AUTO_RETRY_LIMIT ? (
                        <Chip size="sm" variant="flat" color="danger">已达重试上限</Chip>
                      ) : (
                        <Chip size="sm" variant="flat" color="default">待重试</Chip>
                      )}
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

      <Modal isOpen={currentJobsModalOpen} onOpenChange={setCurrentJobsModalOpen} size="3xl" scrollBehavior="inside" backdrop="blur" placement="center">
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-lg font-bold">当前作业详情</h2>
                <span className="text-small text-default-500 font-normal">共 {pendingItems.length} 个待处理作业</span>
              </ModalHeader>
              <ModalBody className="pb-6">
                {pendingItems.length === 0 ? (
                  <div className="text-xs text-default-400 border border-default-200 rounded-lg px-4 py-3">当前没有待处理的作业，一切正常</div>
                ) : (
                  <div className="space-y-3">
                    {pendingItems.map((item) => (
                      <Card key={item.id} className="shadow-sm border border-default-200">
                        <CardBody className="p-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-default-400">#{item.id}</span>
                              <Chip size="sm" variant="flat" color={TASK_TYPE_COLORS[item.taskType] || 'default'}>{item.taskTypeLabel}</Chip>
                              {item.retryCount >= AUTO_RETRY_LIMIT ? (
                                <Chip size="sm" variant="flat" color="danger">已达重试上限</Chip>
                              ) : (
                                <Chip size="sm" variant="flat" color="default">待重试</Chip>
                              )}
                              <Chip size="sm" variant="flat" color={item.retryCount > 0 ? 'warning' : 'default'}>重试 {item.retryCount} 次</Chip>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="flat" color="default" isLoading={retryingId === item.id} onPress={() => handleRetry(item)}>
                                立即重试
                              </Button>
                              <Button size="sm" variant="light" color="danger" isIconOnly onPress={() => handleDelete(item)}>
                                <IconDelete />
                              </Button>
                            </div>
                          </div>

                          <div className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-xs text-default-500 mb-1">任务内容</p>
                              <p className="text-foreground whitespace-pre-wrap break-all">{item.summary || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-default-500 mb-1">关联节点</p>
                              <p className="text-foreground">{item.nodeNames && item.nodeNames.length > 0 ? item.nodeNames.join(' / ') : '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-default-500 mb-1">创建时间</p>
                              <p className="text-foreground">{formatDate(item.createdTime)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-default-500 mb-1">最近更新</p>
                              <p className="text-foreground">{formatDate(item.updatedTime)}</p>
                            </div>
                            <div className="sm:col-span-2">
                              <p className="text-xs text-default-500 mb-1">最近错误</p>
                              <p className="text-foreground whitespace-pre-wrap break-all">{item.lastError || '—'}</p>
                            </div>
                          </div>
                        </CardBody>
                      </Card>
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
