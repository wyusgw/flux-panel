package com.admin.common.task;

import com.admin.service.DemoChangeService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;

/**
 * 每 30 秒检查一次，到每天恢复时刻的演示账号撤销改动。没有待恢复的改动时只是一次很小的查询
 */
@Slf4j
@Component
public class DemoRestoreAsync {

    @Resource
    private DemoChangeService demoChangeService;

    @Scheduled(cron = "0,30 * * * * ?")
    public void restoreDue() {
        try {
            for (Long userId : demoChangeService.dueUsers(java.time.LocalDateTime.now())) {
                try {
                    demoChangeService.restore(userId);
                    log.info("演示账号 {} 的改动已自动恢复", userId);
                } catch (Exception e) {
                    log.error("恢复演示账号 {} 的改动失败", userId, e);
                }
            }
        } catch (Exception e) {
            log.error("检查演示账号恢复时间失败", e);
        }
    }
}
