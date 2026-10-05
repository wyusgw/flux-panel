package com.admin.common.task;

import com.admin.service.impl.task.OrderRenewTaskHandler;
import com.admin.entity.PackagePlan;
import com.admin.entity.User;
import com.admin.entity.TaskQueue;
import com.admin.service.TaskQueueService;
import com.alibaba.fastjson.JSONObject;
import com.admin.service.PackagePlanService;
import com.admin.service.UserService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import javax.annotation.Resource;
import java.util.Collections;
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
    TaskQueueService taskQueueService;

    @Resource
    PackagePlanService packagePlanService;

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
                    // 到期超过 24 小时的不再自动续费（与队列处理器的放弃时限一致），避免已停用的用户被反复登记
                    .ge("exp_time", now - OrderRenewTaskHandler.GIVE_UP_AFTER_EXPIRY_MS)
                    .ne("exp_time", PERMANENT_EXP_TIME));

            if (candidates.isEmpty()) {
                return;
            }
            log.info("自动续费任务：找到{}个待续费用户", candidates.size());

            for (User user : candidates) {
                try {
                    // 同一用户同一个到期周期只登记一次：已经有记录（执行中、等待重试或已成功）就不重复登记，也不重置状态
                    String dedupKey = user.getId() + ":" + user.getExpTime();
                    long existing = taskQueueService.count(new QueryWrapper<TaskQueue>()
                            .eq("task_type", OrderRenewTaskHandler.TASK_TYPE).eq("dedup_key", dedupKey));
                    if (existing > 0) {
                        continue;
                    }
                    PackagePlan plan = packagePlanService.getById(user.getPackageId());
                    JSONObject payload = new JSONObject();
                    payload.put("userId", user.getId());
                    payload.put("expTime", user.getExpTime());
                    payload.put("packageId", user.getPackageId());
                    payload.put("summary", "用户「" + user.getUser() + "」自动续费套餐「" + (plan != null ? plan.getName() : "#" + user.getPackageId()) + "」");
                    Long queueId = taskQueueService.enqueue(OrderRenewTaskHandler.TASK_TYPE, dedupKey,
                            payload.toJSONString(), Collections.emptyList(), null);
                    taskQueueService.dispatch(queueId);
                } catch (Exception e) {
                    log.warn("用户[{}]自动续费登记队列异常: {}", user.getId(), e.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("自动续费任务执行异常", e);
        }
    }
}
