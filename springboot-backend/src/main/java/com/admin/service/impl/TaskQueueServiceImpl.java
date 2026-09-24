package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.Node;
import com.admin.entity.TaskQueue;
import com.admin.entity.TaskQueueNode;
import com.admin.mapper.TaskQueueMapper;
import com.admin.service.NodeService;
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

import javax.annotation.PostConstruct;
import javax.annotation.Resource;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
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

    private static final String STATUS_PENDING = "PENDING";
    private static final String STATUS_SUCCESS = "SUCCESS";

    /** SUCCESS 状态的记录保留多久供管理员查看，超过后由定时清理任务删除 */
    private static final long SUCCESS_RETENTION_MS = 24 * 60 * 60 * 1000L;

    private final long serviceStartTime = System.currentTimeMillis();

    private volatile long lastSweepTime = 0L;

    @Resource
    private List<TaskHandler> taskHandlers;

    @Resource
    @Lazy
    private TaskQueueNodeService taskQueueNodeService;

    @Resource
    @Lazy
    private NodeService nodeService;

    private Map<String, TaskHandler> handlerMap;

    @PostConstruct
    private void initHandlerMap() {
        handlerMap = taskHandlers.stream().collect(Collectors.toMap(TaskHandler::getTaskType, h -> h));
    }

    @Override
    public void enqueue(String taskType, String dedupKey, String payload, List<Long> nodeIds, String error) {
        if (taskType == null) {
            return;
        }
        long now = System.currentTimeMillis();
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
        return attemptRetry(item);
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
            try {
                attemptRetry(item);
            } catch (Exception e) {
                log.warn("任务队列重试异常，队列ID: {}", item.getId(), e);
            }
        }
    }

    @Override
    public void retryAllPending() {
        List<TaskQueue> items = this.list(new QueryWrapper<TaskQueue>()
                .eq("status", STATUS_PENDING).lt("retry_count", MAX_AUTO_RETRY));
        for (TaskQueue item : items) {
            try {
                attemptRetry(item);
            } catch (Exception e) {
                log.warn("任务队列定时重试异常，队列ID: {}", item.getId(), e);
            }
        }
    }

    @Override
    public void purgeExpiredSuccess() {
        long cutoff = System.currentTimeMillis() - SUCCESS_RETENTION_MS;
        List<TaskQueue> expired = this.list(new QueryWrapper<TaskQueue>()
                .eq("status", STATUS_SUCCESS).lt("completed_time", cutoff));
        if (expired.isEmpty()) {
            return;
        }
        List<Long> ids = expired.stream().map(TaskQueue::getId).collect(Collectors.toList());
        this.removeByIds(ids);
        taskQueueNodeService.remove(new QueryWrapper<TaskQueueNode>().in("task_queue_id", ids));
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
        return R.ok(result);
    }

    /**
     * 实际执行一次重试：分发给对应 taskType 的 TaskHandler；成功则把状态转为 SUCCESS（保留 24 小时供查看，
     * 节点关联保留不删，供展示当时关联了哪些节点），失败则累加重试次数并记录最新错误信息
     */
    private R attemptRetry(TaskQueue item) {
        TaskHandler handler = handlerMap.get(item.getTaskType());
        if (handler == null) {
            return R.err("未知的任务类型: " + item.getTaskType());
        }
        R result = handler.handle(item);
        long now = System.currentTimeMillis();
        if (result != null && result.getCode() == 0) {
            TaskQueue update = new TaskQueue();
            update.setId(item.getId());
            update.setStatus(STATUS_SUCCESS);
            update.setUpdatedTime(now);
            update.setCompletedTime(now);
            this.updateById(update);
            // MyBatis-Plus 默认 UPDATE 会跳过 null 字段，updateById 无法清空 last_error，需要显式 set
            this.update(new UpdateWrapper<TaskQueue>().eq("id", item.getId()).set("last_error", null));
        } else {
            TaskQueue update = new TaskQueue();
            update.setId(item.getId());
            update.setRetryCount((item.getRetryCount() == null ? 0 : item.getRetryCount()) + 1);
            update.setLastError(result != null ? result.getMsg() : "未知错误");
            update.setUpdatedTime(now);
            this.updateById(update);
        }
        return result;
    }
}
