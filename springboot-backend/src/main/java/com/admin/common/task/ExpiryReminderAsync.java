package com.admin.common.task;

import com.admin.common.utils.NotificationUtil;
import com.admin.entity.User;
import com.admin.entity.ViteConfig;
import com.admin.service.UserService;
import com.admin.service.ViteConfigService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import javax.annotation.Resource;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 套餐到期 / 流量即将用尽的每日提醒任务。
 * 到期阈值与 vite-frontend/src/pages/dashboard.tsx 的 checkExpirationNotifications 保持一致（默认 0 &lt; diffDays &lt;= 7，
 * 可在推送设置页通过 telegram_expiry_reminder_days 调整）；流量无对应前端阈值可复用，默认取用量达 90% 作为提醒线
 * （telegram_flow_reminder_percent 可调整）；流量无限（99999）与永久套餐均跳过。
 * 到期提醒与流量提醒各自独立每日去重（telegram_last_expiry_reminder_date / telegram_last_flow_reminder_date），
 * 仅覆盖用户级套餐到期，不含逐条隧道权限到期。
 * <p>
 * 提醒时间点（小时，telegram_reminder_hour，默认 9）可配置：由于 Spring 的 {@code @Scheduled(cron=...)} 是编译期固定的
 * 表达式，这里改为每 5 分钟检查一次「当前是否命中配置的小时的第一个 5 分钟窗口」，命中才真正扫描全部用户；
 * 未命中直接跳过，不会每 5 分钟都全表扫描一次。同一用户当天是否已经提醒过由上面两个去重字段保证，
 * 不依赖这个扫描节奏本身的精确性。
 * </p>
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
    private static final int DEFAULT_EXPIRY_REMINDER_DAYS = 7;
    private static final double DEFAULT_FLOW_ALERT_PERCENT = 90.0;
    private static final int DEFAULT_REMINDER_HOUR = 9;
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    @Resource
    UserService userService;

    @Resource
    NotificationUtil notificationUtil;

    @Resource
    ViteConfigService viteConfigService;

    @Scheduled(cron = "0 */5 * * * ?")
    public void remind() {
        try {
            LocalTime now = LocalTime.now();
            int reminderHour = getConfiguredReminderHour();
            // 只在配置小时的头 5 分钟窗口内真正执行一次全表扫描，其余时间直接跳过
            if (now.getHour() != reminderHour || now.getMinute() >= 5) {
                return;
            }
            doRemind();
        } catch (Exception e) {
            log.warn("到期/流量提醒任务执行异常", e);
        }
    }

    private void doRemind() {
        String today = LocalDate.now().format(DATE_FORMAT);
        long now = System.currentTimeMillis();
        int expiryReminderDays = getConfiguredExpiryReminderDays();
        double flowAlertPercent = getConfiguredFlowAlertPercent();

        List<User> users = userService.list(new QueryWrapper<User>().isNotNull("telegram_chat_id"));

        for (User user : users) {
            try {
                boolean expiryNotified = false;
                boolean flowNotified = false;

                if (!today.equals(user.getTelegramLastExpiryReminderDate())) {
                    Long expTime = user.getExpTime();
                    if (expTime != null && expTime != PERMANENT_EXP_TIME) {
                        long diffMs = expTime - now;
                        long diffDays = (long) Math.ceil(diffMs / (double) (24 * 60 * 60 * 1000));
                        if (diffDays > 0 && diffDays <= expiryReminderDays) {
                            notificationUtil.notifyExpiryReminder(user, diffDays);
                            expiryNotified = true;
                        }
                    }
                }

                if (!today.equals(user.getTelegramLastFlowReminderDate())) {
                    Long flow = user.getFlow();
                    if (flow != null && flow > 0 && flow != UNLIMITED_FLOW) {
                        long used = (user.getInFlow() != null ? user.getInFlow() : 0L)
                                + (user.getOutFlow() != null ? user.getOutFlow() : 0L);
                        double totalBytes = flow * GB;
                        double percent = totalBytes > 0 ? (used / totalBytes) * 100.0 : 0.0;
                        if (percent >= flowAlertPercent) {
                            notificationUtil.notifyFlowReminder(user, percent);
                            flowNotified = true;
                        }
                    }
                }

                if (expiryNotified || flowNotified) {
                    UpdateWrapper<User> update = new UpdateWrapper<User>().eq("id", user.getId()).set("updated_time", now);
                    if (expiryNotified) {
                        update.set("telegram_last_expiry_reminder_date", today);
                    }
                    if (flowNotified) {
                        update.set("telegram_last_flow_reminder_date", today);
                    }
                    userService.update(update);
                }
            } catch (Exception e) {
                log.warn("用户[{}]到期/流量提醒发送失败: {}", user.getId(), e.getMessage());
            }
        }
    }

    private int getConfiguredReminderHour() {
        String value = getConfigValue("telegram_reminder_hour");
        if (value == null || value.isEmpty()) return DEFAULT_REMINDER_HOUR;
        try {
            int hour = Integer.parseInt(value.trim());
            return (hour >= 0 && hour <= 23) ? hour : DEFAULT_REMINDER_HOUR;
        } catch (NumberFormatException e) {
            return DEFAULT_REMINDER_HOUR;
        }
    }

    private int getConfiguredExpiryReminderDays() {
        String value = getConfigValue("telegram_expiry_reminder_days");
        if (value == null || value.isEmpty()) return DEFAULT_EXPIRY_REMINDER_DAYS;
        try {
            int days = Integer.parseInt(value.trim());
            return days > 0 ? days : DEFAULT_EXPIRY_REMINDER_DAYS;
        } catch (NumberFormatException e) {
            return DEFAULT_EXPIRY_REMINDER_DAYS;
        }
    }

    private double getConfiguredFlowAlertPercent() {
        String value = getConfigValue("telegram_flow_reminder_percent");
        if (value == null || value.isEmpty()) return DEFAULT_FLOW_ALERT_PERCENT;
        try {
            double percent = Double.parseDouble(value.trim());
            return (percent > 0 && percent <= 100) ? percent : DEFAULT_FLOW_ALERT_PERCENT;
        } catch (NumberFormatException e) {
            return DEFAULT_FLOW_ALERT_PERCENT;
        }
    }

    private String getConfigValue(String name) {
        ViteConfig config = viteConfigService.getOne(new QueryWrapper<ViteConfig>().eq("name", name));
        return config != null ? config.getValue() : null;
    }
}
