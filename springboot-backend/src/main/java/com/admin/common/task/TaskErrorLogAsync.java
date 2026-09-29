package com.admin.common.task;

import com.admin.service.TaskErrorLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import javax.annotation.Resource;

/**
 * 任务队列报错日志的定时清理：每天凌晨清理一次超过保留期（默认 7 天，站点设置 error_log_retention_days 可改）的记录
 */
@Slf4j
@Configuration
@EnableScheduling
public class TaskErrorLogAsync {

    @Resource
    private TaskErrorLogService taskErrorLogService;

    @Scheduled(cron = "0 40 3 * * ?")
    public void purgeExpired() {
        try {
            taskErrorLogService.purgeExpired();
        } catch (Exception e) {
            log.warn("任务队列报错日志清理异常", e);
        }
    }
}
