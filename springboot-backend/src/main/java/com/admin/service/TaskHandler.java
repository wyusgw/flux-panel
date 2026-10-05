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

    /**
     * 该任务类型成功后的记录保留多久（毫秒）再被定时清理；默认 24 小时。
     * 高频、每次都入队的任务类型可以返回更短的时间，避免队列表增长过快
     */
    default long successRetentionMs() {
        return 24L * 60 * 60 * 1000;
    }

    /**
     * 执行失败后是否允许自动重试（定时扫描、节点上线触发）；默认允许。
     * 用户当场等待结果、不应在之后悄悄再执行的任务（如手动购买套餐）返回 false：失败后直接停在「已达重试上限」，
     * 只留给管理员手动处理
     */
    default boolean isRetryable() {
        return true;
    }
}
