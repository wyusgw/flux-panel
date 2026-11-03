package com.admin.common.task;

import com.admin.entity.Node;
import com.admin.entity.NodeOnlineHistory;
import com.admin.mapper.NodeOnlineHistoryMapper;
import com.admin.service.NodeService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import javax.annotation.Resource;

/**
 * 节点在线数量采样：启动后 10 秒记一次，之后每 5 分钟记一次，并顺带清理超过 31 天的旧记录，
 * 供管理员仪表盘「节点在线统计」曲线图展示最近 24 小时或最近 30 天的在线、离线数量变化
 */
@Slf4j
@Configuration
@EnableScheduling
public class NodeOnlineHistoryAsync {

    private static final long SAMPLE_INTERVAL_MILLIS = 5 * 60 * 1000L;
    private static final long RETENTION_MILLIS = 31 * 24 * 60 * 60 * 1000L;

    @Resource
    private NodeService nodeService;

    @Resource
    private NodeOnlineHistoryMapper nodeOnlineHistoryMapper;

    @Scheduled(initialDelay = 10_000, fixedRate = SAMPLE_INTERVAL_MILLIS)
    public void sample() {
        try {
            long now = System.currentTimeMillis();
            NodeOnlineHistory record = new NodeOnlineHistory();
            record.setSampleTime(now);
            record.setTotalCount((int) nodeService.count());
            record.setOnlineCount((int) nodeService.count(new QueryWrapper<Node>().eq("status", 1)));
            nodeOnlineHistoryMapper.insert(record);

            nodeOnlineHistoryMapper.delete(new QueryWrapper<NodeOnlineHistory>().lt("sample_time", now - RETENTION_MILLIS));
        } catch (Exception e) {
            log.warn("节点在线数量采样异常", e);
        }
    }
}
