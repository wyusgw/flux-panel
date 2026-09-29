package com.admin.service.impl.task;

import com.admin.common.lang.R;
import com.admin.entity.TaskQueue;
import com.admin.service.NodeDailyRawFlowService;
import com.admin.service.TaskHandler;
import com.alibaba.fastjson.JSONObject;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;

/**
 * <p>
 * 任务队列的「节点流量统计补记」处理器：gost 节点上报流量时，写入该节点当日累计原始流量
 * （node_daily_raw_flow，仅用于仪表盘节点流量排行展示）失败时登记的任务，由此处理器负责重试补记。
 * payload 约定：{"nodeId": 1, "day": "2026-09-28", "rawBytes": 12345}
 * </p>
 *
 * @author QAQ
 * @since 2026-09-28
 */
@Component
public class NodeFlowRecordTaskHandler implements TaskHandler {

    @Resource
    @Lazy
    private NodeDailyRawFlowService nodeDailyRawFlowService;

    @Override
    public String getTaskType() {
        return "NODE_FLOW_RECORD";
    }

    @Override
    public String getLabel() {
        return "节点流量统计补记";
    }

    @Override
    public long successRetentionMs() {
        return 60L * 60 * 1000;
    }

    @Override
    public R handle(TaskQueue task) {
        JSONObject payload = JSONObject.parseObject(task.getPayload());
        Long nodeId = payload != null ? payload.getLong("nodeId") : null;
        String day = payload != null ? payload.getString("day") : null;
        Long rawBytes = payload != null ? payload.getLong("rawBytes") : null;
        if (nodeId == null || day == null || rawBytes == null) {
            return R.err("任务数据缺少 nodeId/day/rawBytes");
        }
        try {
            nodeDailyRawFlowService.recordRaw(nodeId, day, rawBytes);
            return R.ok();
        } catch (Exception e) {
            return R.err("补记失败: " + e.getMessage());
        }
    }
}
