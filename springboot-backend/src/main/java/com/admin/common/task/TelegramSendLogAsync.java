package com.admin.common.task;

import com.admin.service.TelegramSendLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import javax.annotation.Resource;

/**
 * Telegram 发送记录的定时清理：避免 telegram_send_log 表随发送量无限增长，
 * 每天凌晨清理一次超过保留期（30 天，见 TelegramSendLogServiceImpl）的记录
 */
@Slf4j
@Configuration
@EnableScheduling
public class TelegramSendLogAsync {

    @Resource
    private TelegramSendLogService telegramSendLogService;

    @Scheduled(cron = "0 20 3 * * ?")
    public void purgeExpired() {
        try {
            telegramSendLogService.purgeExpired();
        } catch (Exception e) {
            log.warn("Telegram 发送记录清理异常", e);
        }
    }
}
