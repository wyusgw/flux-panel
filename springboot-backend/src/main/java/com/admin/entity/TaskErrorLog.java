package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * <p>
 * 任务队列报错日志：任务首次登记进队列（首次执行失败）以及每次重试失败时各记一条，
 * 供队列监控页统计报错数量；与 task_queue 不同，任务重试成功或被移除后这里的记录依然保留，
 * 超过保留期（见 TaskErrorLogServiceImpl）由定时任务清理。
 * </p>
 *
 * @author QAQ
 * @since 2026-09-29
 */
@Data
@TableName("task_error_log")
public class TaskErrorLog implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 任务类型，对应 task_queue.task_type
     */
    private String taskType;

    private String error;

    private Long createdTime;
}
