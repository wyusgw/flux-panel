package com.admin.service;

import com.admin.entity.TaskErrorLog;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.List;

/**
 * 任务队列报错日志服务：登记任务执行失败、统计报错数量、定时清理过期记录
 */
public interface TaskErrorLogService extends IService<TaskErrorLog> {

    /**
     * 登记一条报错日志，登记本身失败不影响调用方
     */
    void record(String taskType, String error);

    /**
     * 当前保留期内的报错日志数量
     */
    long countAll();

    /**
     * 保留期内的报错日志，按时间倒序，最多返回 limit 条
     */
    List<TaskErrorLog> listRecent(int limit);

    /**
     * 报错日志保留天数（站点设置 error_log_retention_days，未配置或非法时为默认值）
     */
    int getRetentionDays();

    /**
     * 定时清理：删除超过保留期的记录，避免表无限增长
     */
    void purgeExpired();
}
