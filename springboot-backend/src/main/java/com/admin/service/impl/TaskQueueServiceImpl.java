package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.Node;
import com.admin.entity.TaskQueue;
import com.admin.entity.TaskQueueNode;
import com.admin.mapper.TaskQueueMapper;
import com.admin.service.NodeService;
import com.admin.service.TaskErrorLogService;
import com.admin.service.TaskHandler;
import com.admin.service.TaskQueueNodeService;
import com.admin.service.TaskQueueService;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import javax.annotation.Resource;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

/**
 * <p>
 * 通用异步任务重试队列：登记待重试任务，按 taskType 分发给对应 TaskHandler 执行重试。
 * </p>
 *
 * @author QAQ
 * @since 2026-09-24
 */
@Slf4j
@Service
public class TaskQueueServiceImpl extends ServiceImpl<TaskQueueMapper, TaskQueue> implements TaskQueueService {

    /** 超过这个次数后，自动触发（节点上线/定时兜底）不再重试，仅保留记录供管理员手动重试或删除 */
    private static final int MAX_AUTO_RETRY = 20;

    /** 需与 TaskQueueAsync 的 cron 间隔（每5分钟）一致：超过 2 倍间隔没有成功执行过扫描，视为定时任务异常 */
    private static final long SWEEP_INTERVAL_MS = 5 * 60 * 1000L;

    /** 失败后的退避：第 n 次失败后至少等待 min(BASE * 2^(n-1), MAX) 才允许定时扫描再次重试；节点上线、手动重试不受退避限制 */
    private static final long BACKOFF_BASE_MS = SWEEP_INTERVAL_MS;
    private static final long BACKOFF_MAX_MS = 60 * 60 * 1000L;

    private static final int ERROR_LOG_LIST_LIMIT = 200;

    private static final String STATUS_PENDING = "PENDING";
    private static final String STATUS_SUCCESS = "SUCCESS";

    private final long serviceStartTime = System.currentTimeMillis();

    private volatile long lastSweepTime = 0L;

    @Resource
    private List<TaskHandler> taskHandlers;

    @Resource
    private TaskErrorLogService taskErrorLogService;

    @Resource
    @Lazy
    private TaskQueueNodeService taskQueueNodeService;

    @Resource
    @Lazy
    private NodeService nodeService;

    private Map<String, TaskHandler> handlerMap;

    private final Set<Long> inFlight = ConcurrentHashMap.newKeySet();

    private final ExecutorService dispatchExecutor = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "task-queue-dispatch");
        t.setDaemon(true);
        return t;
    });

    @PreDestroy
    private void shutdownDispatchExecutor() {
        dispatchExecutor.shutdown();
    }

    @PostConstruct
    private void initHandlerMap() {
        handlerMap = taskHandlers.stream().collect(Collectors.toMap(TaskHandler::getTaskType, h -> h));
    }

    @Override
    public Long enqueue(String taskType, String dedupKey, String payload, List<Long> nodeIds, String error) {
        if (taskType == null) {
            return null;
        }
        long now = System.currentTimeMillis();
        // 仅在调用方带着真实报错入队时才登记；无报错的入队（如通知、流量记录的常规排队）不算报错
        if (error != null && !error.isEmpty()) {
            taskErrorLogService.record(taskType, error);
        }
        TaskQueue existing = dedupKey == null ? null
                : this.getOne(new QueryWrapper<TaskQueue>().eq("task_type", taskType).eq("dedup_key", dedupKey));

        TaskQueue item;
        if (existing != null) {
            // 之前已经成功过的任务重新失败：视为一轮新的失败，重试次数从头计
            boolean wasSuccess = STATUS_SUCCESS.equals(existing.getStatus());
            existing.setStatus(STATUS_PENDING);
            existing.setPayload(payload);
            existing.setLastError(error);
            existing.setUpdatedTime(now);
            if (wasSuccess) {
                existing.setRetryCount(0);
            }
            this.updateById(existing);
            if (wasSuccess) {
                // MyBatis-Plus 默认 UPDATE 会跳过 null 字段，updateById 无法清空 completed_time，需要显式 set
                this.update(new UpdateWrapper<TaskQueue>().eq("id", existing.getId()).set("completed_time", null));
            }
            item = existing;
            taskQueueNodeService.remove(new QueryWrapper<TaskQueueNode>().eq("task_queue_id", item.getId()));
        } else {
            item = new TaskQueue();
            item.setTaskType(taskType);
            item.setDedupKey(dedupKey);
            item.setPayload(payload);
            item.setStatus(STATUS_PENDING);
            item.setRetryCount(0);
            item.setLastError(error);
            item.setCreatedTime(now);
            item.setUpdatedTime(now);
            this.save(item);
        }

        if (nodeIds != null) {
            for (Long nodeId : nodeIds) {
                if (nodeId == null) continue;
                TaskQueueNode link = new TaskQueueNode();
                link.setTaskQueueId(item.getId());
                link.setNodeId(nodeId);
                taskQueueNodeService.save(link);
            }
        }
        return item.getId();
    }

    @Override
    public void dispatch(Long queueId) {
        if (queueId == null) {
            return;
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    submitDispatch(queueId);
                }
            });
        } else {
            submitDispatch(queueId);
        }
    }

    private void submitDispatch(Long queueId) {
        dispatchExecutor.submit(() -> {
            try {
                TaskQueue item = this.getById(queueId);
                if (item != null && STATUS_PENDING.equals(item.getStatus())) {
                    execute(item);
                }
            } catch (Exception e) {
                log.warn("任务队列即时执行异常，队列ID: {}", queueId, e);
            }
        });
    }

    @Override
    public void removeByTypeAndKey(String taskType, String dedupKey) {
        if (taskType == null || dedupKey == null) {
            return;
        }
        TaskQueue existing = this.getOne(new QueryWrapper<TaskQueue>().eq("task_type", taskType).eq("dedup_key", dedupKey));
        if (existing != null) {
            this.removeById(existing.getId());
            taskQueueNodeService.remove(new QueryWrapper<TaskQueueNode>().eq("task_queue_id", existing.getId()));
        }
    }

    @Override
    public R listAll() {
        List<TaskQueue> items = this.list(new QueryWrapper<TaskQueue>().orderByDesc("created_time"));
        if (items.isEmpty()) {
            return R.ok(new ArrayList<>());
        }

        List<Long> taskIds = items.stream().map(TaskQueue::getId).collect(Collectors.toList());
        List<TaskQueueNode> links = taskQueueNodeService.list(new QueryWrapper<TaskQueueNode>().in("task_queue_id", taskIds));
        Map<Long, List<Long>> nodeIdsByTask = new HashMap<>();
        Set<Long> allNodeIds = new HashSet<>();
        for (TaskQueueNode link : links) {
            nodeIdsByTask.computeIfAbsent(link.getTaskQueueId(), k -> new ArrayList<>()).add(link.getNodeId());
            allNodeIds.add(link.getNodeId());
        }
        Map<Long, String> nodeNameMap = new HashMap<>();
        for (Long nodeId : allNodeIds) {
            Node node = nodeService.getNodeById(nodeId);
            if (node != null) {
                nodeNameMap.put(nodeId, node.getName());
            }
        }

        List<Map<String, Object>> result = items.stream().map(item -> {
            Map<String, Object> row = new HashMap<>();
            row.put("id", item.getId());
            row.put("taskType", item.getTaskType());
            TaskHandler handler = handlerMap.get(item.getTaskType());
            row.put("taskTypeLabel", handler != null ? handler.getLabel() : item.getTaskType());
            row.put("summary", extractSummary(item.getPayload()));
            List<Long> nodeIds = nodeIdsByTask.getOrDefault(item.getId(), Collections.emptyList());
            List<String> nodeNames = nodeIds.stream()
                    .map(id -> nodeNameMap.getOrDefault(id, "节点#" + id))
                    .collect(Collectors.toList());
            row.put("nodeNames", nodeNames);
            row.put("status", item.getStatus());
            row.put("retryCount", item.getRetryCount());
            row.put("lastError", item.getLastError());
            row.put("createdTime", item.getCreatedTime());
            row.put("updatedTime", item.getUpdatedTime());
            row.put("completedTime", item.getCompletedTime());
            return row;
        }).collect(Collectors.toList());

        return R.ok(result);
    }

    private String extractSummary(String payload) {
        if (payload == null || payload.isEmpty()) {
            return "";
        }
        try {
            JSONObject json = JSONObject.parseObject(payload);
            String summary = json.getString("summary");
            return summary != null ? summary : payload;
        } catch (Exception e) {
            return payload;
        }
    }

    @Override
    public R retryOne(Long queueId) {
        TaskQueue item = this.getById(queueId);
        if (item == null) {
            return R.err("记录不存在（可能已经被清理）");
        }
        if (STATUS_SUCCESS.equals(item.getStatus())) {
            return R.ok("该任务已经重试成功，无需再次处理");
        }
        return execute(item);
    }

    @Override
    public void retryByNodeId(Long nodeId) {
        if (nodeId == null) {
            return;
        }
        List<TaskQueueNode> links = taskQueueNodeService.list(new QueryWrapper<TaskQueueNode>().eq("node_id", nodeId));
        if (links.isEmpty()) {
            return;
        }
        Set<Long> taskIds = links.stream().map(TaskQueueNode::getTaskQueueId).collect(Collectors.toSet());
        List<TaskQueue> items = this.listByIds(taskIds).stream()
                .filter(item -> STATUS_PENDING.equals(item.getStatus()))
                .collect(Collectors.toList());
        for (TaskQueue item : items) {
            execute(item);
        }
    }

    @Override
    public void retryAllPending() {
        long now = System.currentTimeMillis();
        List<TaskQueue> items = this.list(new QueryWrapper<TaskQueue>()
                .eq("status", STATUS_PENDING).lt("retry_count", MAX_AUTO_RETRY));
        for (TaskQueue item : items) {
            if (!isDue(item, now)) {
                continue;
            }
            // 交给执行线程池异步处理：单个任务（如 Telegram 网络超时）卡住不会拖住整轮扫描和定时线程
            dispatchExecutor.submit(() -> execute(item));
        }
    }

    /** 从未失败过的任务立即可执行；失败过的任务要等退避时间过去 */
    private boolean isDue(TaskQueue item, long now) {
        int failures = item.getRetryCount() == null ? 0 : item.getRetryCount();
        if (failures <= 0) {
            return true;
        }
        long delay = Math.min(BACKOFF_BASE_MS << Math.min(failures - 1, 20), BACKOFF_MAX_MS);
        long last = item.getUpdatedTime() == null ? 0L : item.getUpdatedTime();
        return now - last >= delay;
    }

    @Override
    public void purgeExpiredSuccess() {
        long now = System.currentTimeMillis();
        for (TaskHandler handler : taskHandlers) {
            long cutoff = now - handler.successRetentionMs();
            List<TaskQueue> expired = this.list(new QueryWrapper<TaskQueue>()
                    .eq("task_type", handler.getTaskType())
                    .eq("status", STATUS_SUCCESS).lt("completed_time", cutoff));
            if (expired.isEmpty()) {
                continue;
            }
            List<Long> ids = expired.stream().map(TaskQueue::getId).collect(Collectors.toList());
            this.removeByIds(ids);
            taskQueueNodeService.remove(new QueryWrapper<TaskQueueNode>().in("task_queue_id", ids));
        }
    }

    @Override
    public void recordSweepRun() {
        lastSweepTime = System.currentTimeMillis();
    }

    @Override
    public R getHealth() {
        long now = System.currentTimeMillis();
        // 服务刚启动、还没到第一次定时扫描的时间点时，不应该被误判为"异常"
        boolean warmingUp = lastSweepTime == 0 && (now - serviceStartTime) < SWEEP_INTERVAL_MS;
        boolean running = warmingUp || (lastSweepTime > 0 && (now - lastSweepTime) <= SWEEP_INTERVAL_MS * 2);

        Map<String, Object> result = new HashMap<>();
        result.put("running", running);
        result.put("serviceStartTime", serviceStartTime);
        result.put("lastSweepTime", lastSweepTime > 0 ? lastSweepTime : null);
        // 统计全部按队列里的真实状态得出，不依赖入队动作：
        // queued=尚未失败过的排队任务，retrying=失败过、等待自动重试，exhausted=失败且已达自动重试上限，
        // successLastHour=近一小时内真正执行成功的任务数
        long queued = this.count(new QueryWrapper<TaskQueue>().eq("status", STATUS_PENDING).eq("retry_count", 0));
        long exhausted = this.count(new QueryWrapper<TaskQueue>().eq("status", STATUS_PENDING).ge("retry_count", MAX_AUTO_RETRY));
        long retrying = this.count(new QueryWrapper<TaskQueue>().eq("status", STATUS_PENDING)
                .gt("retry_count", 0).lt("retry_count", MAX_AUTO_RETRY));
        long successLastHour = this.count(new QueryWrapper<TaskQueue>().eq("status", STATUS_SUCCESS)
                .ge("completed_time", now - 60 * 60 * 1000L));
        result.put("queuedCount", queued);
        result.put("retryingCount", retrying);
        result.put("exhaustedCount", exhausted);
        result.put("successLastHour", successLastHour);
        result.put("maxAutoRetry", MAX_AUTO_RETRY);
        result.put("errorLogCount", taskErrorLogService.countAll());
        result.put("errorLogRetentionDays", taskErrorLogService.getRetentionDays());
        return R.ok(result);
    }

    /** 队列类别：key、展示名、包含的任务类型。订单类别的任务类型预留，订单任务接入队列后自动归入 */
    private static final String[][] CATEGORIES = {
            {"telegram", "Telegram 消息队列", "TELEGRAM_NOTIFY"},
            {"flow", "流量消费队列", "USER_FLOW_RECORD,NODE_FLOW_RECORD"},
            {"statistics", "统计队列", "STATISTICS_FLOW"},
            {"order", "订单队列", "ORDER_RENEW"},
            {"forward", "转发同步队列", "FORWARD_SYNC"}
    };

    @Override
    public R getOverview() {
        long now = System.currentTimeMillis();
        List<TaskQueue> all = this.list(new QueryWrapper<TaskQueue>());
        List<Map<String, Object>> rows = new ArrayList<>();
        for (String[] category : CATEGORIES) {
            Set<String> types = new HashSet<>(java.util.Arrays.asList(category[2].split(",")));
            long queued = 0, retrying = 0, exhausted = 0, successLastHour = 0;
            Long lastActive = null;
            Long oldestPendingCreated = null;
            TaskQueue lastFailed = null;
            for (TaskQueue item : all) {
                if (!types.contains(item.getTaskType())) {
                    continue;
                }
                long updated = item.getUpdatedTime() == null ? 0L : item.getUpdatedTime();
                if (lastActive == null || updated > lastActive) {
                    lastActive = updated;
                }
                int failures = item.getRetryCount() == null ? 0 : item.getRetryCount();
                if (STATUS_SUCCESS.equals(item.getStatus())) {
                    if (item.getCompletedTime() != null && now - item.getCompletedTime() <= 60 * 60 * 1000L) {
                        successLastHour++;
                    }
                    continue;
                }
                if (item.getCreatedTime() != null && (oldestPendingCreated == null || item.getCreatedTime() < oldestPendingCreated)) {
                    oldestPendingCreated = item.getCreatedTime();
                }
                if (failures >= MAX_AUTO_RETRY) {
                    exhausted++;
                } else if (failures > 0) {
                    retrying++;
                } else {
                    queued++;
                }
                if (item.getLastError() != null && (lastFailed == null || updated > lastFailed.getUpdatedTime())) {
                    lastFailed = item;
                }
            }
            Map<String, Object> row = new HashMap<>();
            row.put("key", category[0]);
            row.put("label", category[1]);
            row.put("queuedCount", queued);
            row.put("retryingCount", retrying);
            row.put("exhaustedCount", exhausted);
            row.put("successLastHour", successLastHour);
            // 占用时间：最早一条仍未完成的作业已经等待了多久，没有待处理作业则为 0
            row.put("oldestWaitMs", oldestPendingCreated != null ? now - oldestPendingCreated : 0L);
            row.put("lastError", lastFailed != null ? lastFailed.getLastError() : null);
            row.put("lastActiveTime", lastActive);
            rows.add(row);
        }
        return R.ok(rows);
    }

    @Override
    public R listErrorLogs() {
        List<Map<String, Object>> rows = taskErrorLogService.listRecent(ERROR_LOG_LIST_LIMIT).stream().map(entry -> {
            Map<String, Object> row = new HashMap<>();
            row.put("id", entry.getId());
            row.put("taskType", entry.getTaskType());
            TaskHandler handler = handlerMap.get(entry.getTaskType());
            row.put("taskTypeLabel", handler != null ? handler.getLabel() : entry.getTaskType());
            row.put("error", entry.getError());
            row.put("createdTime", entry.getCreatedTime());
            return row;
        }).collect(Collectors.toList());
        return R.ok(rows);
    }

    /**
     * 执行一次任务：交给对应 taskType 的 TaskHandler，并由这里统一落状态——
     * 成功转 SUCCESS（保留供查看，节点关联保留不删）；失败（处理器返回非 0、返回 null 或抛异常）累加重试次数、
     * 记录最新错误并登记一条报错日志。「报错日志/报错数量」只会在这里的失败分支写入。
     */
    private R execute(TaskQueue item) {
        // 同一条队列项同一时刻只允许一个线程在执行（即时执行、定时兜底、节点上线触发、手动重试可能撞车）
        if (!inFlight.add(item.getId())) {
            return R.ok("该任务正在处理中");
        }
        try {
            TaskHandler handler = handlerMap.get(item.getTaskType());
            if (handler == null) {
                return R.err("未知的任务类型: " + item.getTaskType());
            }
            R result;
            try {
                result = handler.handle(item);
            } catch (Throwable e) {
                log.warn("任务处理器抛出异常，队列ID: {}", item.getId(), e);
                result = R.err("处理异常: " + e.getMessage());
            }
            if (result != null && result.getCode() == 0) {
                markSuccess(item);
            } else {
                markFailed(item, result != null ? result.getMsg() : null);
            }
            return result != null ? result : R.err("未知错误");
        } finally {
            inFlight.remove(item.getId());
        }
    }

    private void markSuccess(TaskQueue item) {
        long now = System.currentTimeMillis();
        // MyBatis-Plus 的 updateById 会跳过 null 字段，无法清空 last_error，这里统一用 UpdateWrapper
        this.update(new UpdateWrapper<TaskQueue>().eq("id", item.getId())
                .set("status", STATUS_SUCCESS)
                .set("updated_time", now)
                .set("completed_time", now)
                .set("last_error", null));
    }

    private void markFailed(TaskQueue item, String msg) {
        String error = (msg == null || msg.isEmpty()) ? "未知错误" : msg;
        this.update(new UpdateWrapper<TaskQueue>().eq("id", item.getId())
                .set("retry_count", (item.getRetryCount() == null ? 0 : item.getRetryCount()) + 1)
                .set("last_error", error)
                .set("updated_time", System.currentTimeMillis()));
        taskErrorLogService.record(item.getTaskType(), error);
    }
}
