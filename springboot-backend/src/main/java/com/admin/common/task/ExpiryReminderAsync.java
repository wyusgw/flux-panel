package com.admin.common.task;

import com.admin.common.utils.NotificationUtil;
import com.admin.entity.User;
import com.admin.service.UserService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import javax.annotation.Resource;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 套餐到期 / 流量即将用尽的每日提醒任务。
 * 到期阈值与 vite-frontend/src/pages/dashboard.tsx 的 checkExpirationNotifications 保持一致（0 &lt; diffDays &lt;= 7）；
 * 流量无对应前端阈值可复用，取用量达 90% 作为提醒线；流量无限（99999）与永久套餐均跳过。
 * 每用户每日最多提醒一次（telegram_last_reminder_date 去重），仅覆盖用户级套餐到期，不含逐条隧道权限到期。
 */
@Slf4j
@Configuration
@EnableScheduling
public class ExpiryReminderAsync {

    // 与 OrderServiceImpl 永久套餐到期时间哨兵值保持一致（2099-12-31）
    private static final long PERMANENT_EXP_TIME = 4102415999000L;
    // 与 dashboard.tsx 的“无限流量”哨兵值保持一致
    private static final long UNLIMITED_FLOW = 99999L;
    private static final long GB = 1024L * 1024L * 1024L;
    private static final double FLOW_ALERT_PERCENT = 90.0;
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    @Resource
    UserService userService;

    @Resource
    NotificationUtil notificationUtil;

    @Scheduled(cron = "0 0 9 * * ?")
    public void remind() {
        try {
            String today = LocalDate.now().format(DATE_FORMAT);
            long now = System.currentTimeMillis();

            List<User> users = userService.list(new QueryWrapper<User>().isNotNull("telegram_chat_id"));

            for (User user : users) {
                try {
                    if (today.equals(user.getTelegramLastReminderDate())) {
                        continue;
                    }

                    boolean notified = false;

                    Long expTime = user.getExpTime();
                    if (expTime != null && expTime != PERMANENT_EXP_TIME) {
                        long diffMs = expTime - now;
                        long diffDays = (long) Math.ceil(diffMs / (double) (24 * 60 * 60 * 1000));
                        if (diffDays > 0 && diffDays <= 7) {
                            notificationUtil.notifyExpiryReminder(user, diffDays);
                            notified = true;
                        }
                    }

                    Long flow = user.getFlow();
                    if (flow != null && flow > 0 && flow != UNLIMITED_FLOW) {
                        long used = (user.getInFlow() != null ? user.getInFlow() : 0L)
                                + (user.getOutFlow() != null ? user.getOutFlow() : 0L);
                        double totalBytes = flow * GB;
                        double percent = totalBytes > 0 ? (used / totalBytes) * 100.0 : 0.0;
                        if (percent >= FLOW_ALERT_PERCENT) {
                            notificationUtil.notifyFlowReminder(user, percent);
                            notified = true;
                        }
                    }

                    if (notified) {
                        userService.update(new UpdateWrapper<User>()
                                .eq("id", user.getId())
                                .set("telegram_last_reminder_date", today)
                                .set("updated_time", now));
                    }
                } catch (Exception e) {
                    log.warn("用户[{}]到期/流量提醒发送失败: {}", user.getId(), e.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("到期/流量提醒任务执行异常", e);
        }
    }
}
