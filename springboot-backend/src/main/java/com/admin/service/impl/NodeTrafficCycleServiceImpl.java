package com.admin.service.impl;

import com.admin.entity.NodeTrafficCycle;
import com.admin.entity.ViteConfig;
import com.admin.mapper.NodeTrafficCycleMapper;
import com.admin.service.NodeTrafficCycleService;
import com.admin.service.ViteConfigService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.annotation.PreDestroy;
import javax.annotation.Resource;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 节点周期流量：节点每次上报都只在内存里累加（不碰数据库），每分钟批量落库一次；
 * 进程异常退出最多丢失最近一分钟的增量，该数据只用于节点状态页展示，不参与计费。
 */
@Slf4j
@Service
public class NodeTrafficCycleServiceImpl extends ServiceImpl<NodeTrafficCycleMapper, NodeTrafficCycle> implements NodeTrafficCycleService {

    private static final String CONFIG_RESET_DAY = "node_traffic_reset_day";
    private static final int DEFAULT_RESET_DAY = 1;

    @Resource
    @Lazy
    private ViteConfigService viteConfigService;

    private final Map<Long, NodeTrafficCycle> states = new ConcurrentHashMap<>();
    private final Set<Long> dirty = ConcurrentHashMap.newKeySet();

    @Override
    public NodeTrafficCycle record(Long nodeId, long rawUp, long rawDown) {
        long now = System.currentTimeMillis();
        long cycleStart = currentCycleStart(now, getResetDay());

        NodeTrafficCycle state = states.computeIfAbsent(nodeId, this::loadOrCreate);
        synchronized (state) {
            if (state.getLastRawUp() == null) {
                // 这个节点第一次被记录：以本次上报为起点，从 0 开始累计
                state.setLastRawUp(rawUp);
                state.setLastRawDown(rawDown);
            }
            if (state.getCycleStart() == null || state.getCycleStart() < cycleStart) {
                // 进入新周期（或重置日被改动后起点落在新的位置）：清零重新累计
                state.setCycleStart(cycleStart);
                state.setUpBytes(0L);
                state.setDownBytes(0L);
            }
            // 网卡计数器比上次小说明服务器重启过，新值整体就是重启后的增量
            long deltaUp = rawUp >= state.getLastRawUp() ? rawUp - state.getLastRawUp() : rawUp;
            long deltaDown = rawDown >= state.getLastRawDown() ? rawDown - state.getLastRawDown() : rawDown;
            state.setUpBytes(state.getUpBytes() + deltaUp);
            state.setDownBytes(state.getDownBytes() + deltaDown);
            state.setLastRawUp(rawUp);
            state.setLastRawDown(rawDown);
            state.setUpdatedTime(now);
            dirty.add(nodeId);

            NodeTrafficCycle snapshot = new NodeTrafficCycle();
            snapshot.setNodeId(nodeId);
            snapshot.setCycleStart(state.getCycleStart());
            snapshot.setUpBytes(state.getUpBytes());
            snapshot.setDownBytes(state.getDownBytes());
            return snapshot;
        }
    }

    private NodeTrafficCycle loadOrCreate(Long nodeId) {
        NodeTrafficCycle saved = this.getOne(new QueryWrapper<NodeTrafficCycle>().eq("node_id", nodeId));
        if (saved != null) {
            return saved;
        }
        NodeTrafficCycle created = new NodeTrafficCycle();
        created.setNodeId(nodeId);
        created.setUpBytes(0L);
        created.setDownBytes(0L);
        return created;
    }

    /** 当前周期的起点：不晚于 now 的最近一个「重置日 0 点」；当月没有该日期（如 31 日遇到 30 天的月份）按月末算 */
    static long currentCycleStart(long now, int resetDay) {
        ZoneId zone = ZoneId.systemDefault();
        LocalDate today = LocalDate.ofInstant(java.time.Instant.ofEpochMilli(now), zone);
        LocalDate start = resetDate(today.getYear(), today.getMonthValue(), resetDay);
        if (start.isAfter(today)) {
            LocalDate previous = today.withDayOfMonth(1).minusMonths(1);
            start = resetDate(previous.getYear(), previous.getMonthValue(), resetDay);
        }
        return LocalDateTime.of(start, java.time.LocalTime.MIDNIGHT).atZone(zone).toInstant().toEpochMilli();
    }

    private static LocalDate resetDate(int year, int month, int resetDay) {
        LocalDate first = LocalDate.of(year, month, 1);
        return first.withDayOfMonth(Math.min(resetDay, first.lengthOfMonth()));
    }

    @Override
    public int getResetDay() {
        try {
            ViteConfig config = viteConfigService.getOne(new QueryWrapper<ViteConfig>().eq("name", CONFIG_RESET_DAY));
            String value = config != null ? config.getValue() : null;
            if (value == null || value.trim().isEmpty()) {
                return DEFAULT_RESET_DAY;
            }
            return Math.max(1, Math.min(31, Integer.parseInt(value.trim())));
        } catch (Exception e) {
            return DEFAULT_RESET_DAY;
        }
    }

    @Scheduled(cron = "30 * * * * ?")
    @Override
    public void flush() {
        for (Long nodeId : dirty.toArray(new Long[0])) {
            NodeTrafficCycle state = states.get(nodeId);
            if (state == null || !dirty.remove(nodeId)) {
                continue;
            }
            try {
                NodeTrafficCycle copy;
                synchronized (state) {
                    copy = new NodeTrafficCycle();
                    copy.setId(state.getId());
                    copy.setNodeId(state.getNodeId());
                    copy.setCycleStart(state.getCycleStart());
                    copy.setUpBytes(state.getUpBytes());
                    copy.setDownBytes(state.getDownBytes());
                    copy.setLastRawUp(state.getLastRawUp());
                    copy.setLastRawDown(state.getLastRawDown());
                    copy.setUpdatedTime(state.getUpdatedTime());
                }
                this.saveOrUpdate(copy);
                synchronized (state) {
                    state.setId(copy.getId());
                }
            } catch (Exception e) {
                dirty.add(nodeId);
                log.warn("节点周期流量落库失败，下次再试: nodeId={}, {}", nodeId, e.getMessage());
            }
        }
    }

    @PreDestroy
    private void flushOnShutdown() {
        flush();
    }
}
