package com.admin.common.task;

import com.admin.service.TaskQueueService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import javax.annotation.Resource;

/**
 * 通用任务队列的定时兜底扫描：节点上线等事件已经会触发一次即时重试，
 * 这里每 5 分钟再扫一遍所有待重试项，覆盖事件错过、或任务在事件发生后才登记等边界情况。
 */
@Slf4j
@Configuration
@EnableScheduling
public class TaskQueueAsync {

    @Resource
    private TaskQueueService taskQueueService;

    @Scheduled(cron = "0 */5 * * * ?")
    public void retryPending() {
        try {
            taskQueueService.retryAllPending();
            taskQueueService.recordSweepRun();
        } catch (Exception e) {
            log.warn("任务队列定时兜底扫描异常", e);
        }
    }

    /**
     * 清理超过 24 小时的 SUCCESS 记录，避免队列表无限增长；不需要很高频率，每 30 分钟扫一次即可
     */
    @Scheduled(cron = "0 */30 * * * ?")
    public void purgeExpiredSuccess() {
        try {
            taskQueueService.purgeExpiredSuccess();
        } catch (Exception e) {
            log.warn("任务队列成功记录清理异常", e);
        }
    }
}
