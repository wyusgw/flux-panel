package com.admin.service.impl.task;

import com.admin.common.lang.R;
import com.admin.service.ForwardService;
import com.admin.service.TaskHandler;
import com.admin.entity.TaskQueue;
import com.alibaba.fastjson.JSONObject;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;

/**
 * <p>
 * 任务队列的「转发同步」处理器：转发规则因目标节点离线导致 gost 配置推送失败时登记的任务，
 * 由此处理器负责重试推送。payload 约定：{"forwardId": 123, "summary": "..."}
 * </p>
 *
 * @author QAQ
 * @since 2026-09-24
 */
@Component
public class ForwardSyncTaskHandler implements TaskHandler {

    @Resource
    @Lazy
    private ForwardService forwardService;

    @Override
    public String getTaskType() {
        return "FORWARD_SYNC";
    }

    @Override
    public String getLabel() {
        return "转发同步";
    }

    @Override
    public R handle(TaskQueue task) {
        JSONObject payload = JSONObject.parseObject(task.getPayload());
        Long forwardId = payload != null ? payload.getLong("forwardId") : null;
        if (forwardId == null) {
            return R.err("任务数据缺少 forwardId");
        }
        return forwardService.retrySyncForward(forwardId);
    }
}
