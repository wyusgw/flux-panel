package com.admin.common.utils;

import com.admin.service.TaskQueueService;
import com.alibaba.fastjson.JSONObject;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.annotation.PreDestroy;
import javax.annotation.Resource;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * <p>
 * 节点上报流量的"先缓冲、再入队"缓冲区：每次上报只在内存里按 用户/节点+自然日 累加字节数（极轻量，不碰数据库），
 * 每分钟把累加值一次性取出，登记成一条 USER_FLOW_RECORD / NODE_FLOW_RECORD 队列任务并交给队列异步执行写库。
 * 这样节点上报的高频链路不会每次都往 task_queue 表里插一行；写库失败也仍留在队列里由定时扫描重试。
 * 这两类统计只用于仪表盘/统计弹窗展示，不参与计费，所以进程异常退出最多丢失最近一分钟的展示数据。
 * </p>
 */
@Slf4j
@Component
public class FlowRecordBuffer {

    private static final DateTimeFormatter DAY_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final String USER_PREFIX = "U|";
    private static final String NODE_PREFIX = "N|";

    @Resource
    @Lazy
    private TaskQueueService taskQueueService;

    // key: "U|userId|day" 或 "N|nodeId|day"
    private final Map<String, AtomicLong> buffer = new ConcurrentHashMap<>();

    public void addUser(Integer userId, long rawBytes) {
        add(USER_PREFIX + userId + "|" + today(), rawBytes);
    }

    public void addNode(Long nodeId, long rawBytes) {
        add(NODE_PREFIX + nodeId + "|" + today(), rawBytes);
    }

    private void add(String key, long rawBytes) {
        if (rawBytes <= 0) return;
        buffer.computeIfAbsent(key, k -> new AtomicLong()).addAndGet(rawBytes);
    }

    @Scheduled(cron = "0 * * * * ?")
    public void flush() {
        String today = today();
        for (Map.Entry<String, AtomicLong> entry : buffer.entrySet()) {
            String key = entry.getKey();
            long bytes = entry.getValue().getAndSet(0);
            if (bytes <= 0) {
                // 已经跨天、不会再有新增量的空条目顺手清掉，避免 key 无限增长
                if (!key.endsWith("|" + today)) {
                    buffer.remove(key, entry.getValue());
                }
                continue;
            }
            try {
                enqueue(key, bytes);
            } catch (Exception e) {
                // 入队失败（如数据库暂时不可用）：把增量放回去，下一分钟再试，不丢
                entry.getValue().addAndGet(bytes);
                log.warn("流量统计入队失败，下次再试: {}", e.getMessage());
            }
        }
    }

    @PreDestroy
    public void flushOnShutdown() {
        try {
            flush();
        } catch (Exception e) {
            log.warn("停机前刷新流量统计缓冲失败: {}", e.getMessage());
        }
    }

    private void enqueue(String key, long bytes) {
        String[] parts = key.split("\\|");
        boolean isUser = USER_PREFIX.equals(parts[0] + "|");
        String id = parts[1];
        String day = parts[2];

        JSONObject payload = new JSONObject();
        payload.put(isUser ? "userId" : "nodeId", isUser ? (Object) Integer.valueOf(id) : (Object) Long.valueOf(id));
        payload.put("day", day);
        payload.put("rawBytes", bytes);
        payload.put("summary", (isUser ? "用户#" : "节点#") + id + " 流量统计 " + day);

        Long queueId = taskQueueService.enqueue(isUser ? "USER_FLOW_RECORD" : "NODE_FLOW_RECORD", null,
                payload.toJSONString(), Collections.emptyList(), null);
        taskQueueService.dispatch(queueId);
    }

    private String today() {
        return LocalDate.now().format(DAY_FORMAT);
    }
}
