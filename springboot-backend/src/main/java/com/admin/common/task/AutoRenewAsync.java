package com.admin.common.task;

import com.admin.common.lang.R;
import com.admin.common.utils.NotificationUtil;
import com.admin.entity.PackagePlan;
import com.admin.entity.User;
import com.admin.service.OrderService;
import com.admin.service.PackagePlanService;
import com.admin.service.UserService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import javax.annotation.Resource;
import java.math.BigDecimal;
import java.util.List;

/**
 * 自动续费定时任务：为开启了「自动续费」且套餐即将到期的用户，
 * 复用 OrderServiceImpl 现有的钱包扣款/套餐应用逻辑真正完成续费，并推送成功/失败通知。
 * 运行时间早于 ResetFlowAsync 的到期停用检查（00:00:05），确保续费有机会先生效。
 */
@Slf4j
@Configuration
@EnableScheduling
public class AutoRenewAsync {

    // 与 OrderServiceImpl 永久套餐到期时间哨兵值保持一致（2099-12-31），永久套餐无需续费
    private static final long PERMANENT_EXP_TIME = 4102415999000L;
    private static final long RENEW_WINDOW_MS = 24L * 60 * 60 * 1000;

    @Resource
    UserService userService;

    @Resource
    OrderService orderService;

    @Resource
    PackagePlanService packagePlanService;

    @Resource
    NotificationUtil notificationUtil;

    @Scheduled(cron = "0 30 23 * * ?")
    public void autoRenew() {
        try {
            long now = System.currentTimeMillis();
            long windowEnd = now + RENEW_WINDOW_MS;

            List<User> candidates = userService.list(new QueryWrapper<User>()
                    .eq("auto_renew", 1)
                    .isNotNull("package_id")
                    .isNotNull("exp_time")
                    .lt("exp_time", windowEnd)
                    .ne("exp_time", PERMANENT_EXP_TIME));

            if (candidates.isEmpty()) {
                return;
            }
            log.info("自动续费任务：找到{}个待续费用户", candidates.size());

            for (User user : candidates) {
                try {
                    PackagePlan plan = packagePlanService.getById(user.getPackageId());
                    BigDecimal price = (plan != null && plan.getPrice() != null) ? plan.getPrice() : BigDecimal.ZERO;

                    R result = orderService.purchasePackageForUser(user, user.getPackageId(), null);
                    if (result != null && result.getCode() == 0) {
                        log.info("用户[{}]自动续费成功", user.getId());
                        notificationUtil.notifyRenewSuccess(user, price);
                    } else {
                        String reason = result != null ? result.getMsg() : "未知错误";
                        log.info("用户[{}]自动续费失败: {}", user.getId(), reason);
                        notificationUtil.notifyRenewFailed(user, reason);
                    }
                } catch (Exception e) {
                    log.warn("用户[{}]自动续费执行异常: {}", user.getId(), e.getMessage());
                    notificationUtil.notifyRenewFailed(user, e.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("自动续费任务执行异常", e);
        }
    }
}
