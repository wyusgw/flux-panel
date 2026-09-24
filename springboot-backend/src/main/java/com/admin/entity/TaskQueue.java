package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * <p>
 * 通用异步任务重试队列：某个任务类型（如转发同步、Telegram 通知发送）执行失败时登记在这里，
 * 由对应的 TaskHandler 重试；重试成功后状态转为 SUCCESS 并保留 24 小时供查看，超过 24 小时由定时任务清理；
 * 仍失败则累加 retry_count 并记录 last_error，状态保持 PENDING。
 * payload 是任务自描述的 JSON，具体字段由各任务类型的 TaskHandler 自行约定。
 * </p>
 *
 * @author QAQ
 * @since 2026-09-24
 */
@Data
@TableName("task_queue")
public class TaskQueue implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 任务类型，对应某个 TaskHandler#getTaskType()，如 FORWARD_SYNC / TELEGRAM_NOTIFY
     */
    private String taskType;

    /**
     * 去重键：同一 taskType + dedupKey 只保留一条记录，新登记会覆盖旧记录（重新变为 PENDING）；为空表示不去重
     */
    private String dedupKey;

    /**
     * 任务负载（JSON），由对应 TaskHandler 自行解析
     */
    private String payload;

    /**
     * PENDING（待重试）或 SUCCESS（已重试成功，保留 24 小时供查看后自动清理）
     */
    private String status;

    private Integer retryCount;

    private String lastError;

    private Long createdTime;

    private Long updatedTime;

    /**
     * 重试成功的时间，仅 SUCCESS 状态有值，用于 24 小时后的自动清理
     */
    private Long completedTime;
}
