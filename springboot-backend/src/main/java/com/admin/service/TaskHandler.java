package com.admin.service;

import com.admin.common.lang.R;
import com.admin.entity.TaskQueue;

/**
 * <p>
 * 通用任务队列的任务类型处理器：每种任务类型（转发同步、Telegram 通知发送等）实现一个，
 * 由 Spring 自动收集注入到 TaskQueueService，按 getTaskType() 分发。
 * </p>
 *
 * @author QAQ
 * @since 2026-09-24
 */
public interface TaskHandler {

    /**
     * 任务类型标识，需与登记时传入 TaskQueueService#enqueue 的 taskType 一致，且在所有 TaskHandler 中唯一
     */
    String getTaskType();

    /**
     * 该任务类型在管理界面上的展示名称，如"转发同步""Telegram 通知发送"
     */
    String getLabel();

    /**
     * 实际执行一次重试，解析 task.getPayload() 完成对应的动作；code=0 表示成功
     */
    R handle(TaskQueue task);
}
