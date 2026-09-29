package com.admin.service.impl.task;

import com.admin.common.lang.R;
import com.admin.entity.TaskQueue;
import com.admin.service.TaskHandler;
import com.admin.service.UserDailyRawFlowService;
import com.alibaba.fastjson.JSONObject;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;

/**
 * <p>
 * 任务队列的「用户流量统计补记」处理器：gost 节点上报流量时，写入该用户当日累计原始流量
 * （user_daily_raw_flow，仅用于仪表盘用户流量排行展示）失败时登记的任务，由此处理器负责重试补记。
 * payload 约定：{"userId": 1, "day": "2026-09-28", "rawBytes": 12345}
 * </p>
 *
 * @author QAQ
 * @since 2026-09-28
 */
@Component
public class UserFlowRecordTaskHandler implements TaskHandler {

    @Resource
    @Lazy
    private UserDailyRawFlowService userDailyRawFlowService;

    @Override
    public String getTaskType() {
        return "USER_FLOW_RECORD";
    }

    @Override
    public String getLabel() {
        return "用户流量统计补记";
    }

    @Override
    public long successRetentionMs() {
        return 60L * 60 * 1000;
    }

    @Override
    public R handle(TaskQueue task) {
        JSONObject payload = JSONObject.parseObject(task.getPayload());
        Integer userId = payload != null ? payload.getInteger("userId") : null;
        String day = payload != null ? payload.getString("day") : null;
        Long rawBytes = payload != null ? payload.getLong("rawBytes") : null;
        if (userId == null || day == null || rawBytes == null) {
            return R.err("任务数据缺少 userId/day/rawBytes");
        }
        try {
            userDailyRawFlowService.recordRaw(userId, day, rawBytes);
            return R.ok();
        } catch (Exception e) {
            return R.err("补记失败: " + e.getMessage());
        }
    }
}
