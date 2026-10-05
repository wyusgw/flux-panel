package com.admin.service.impl.task;

import com.admin.common.lang.R;
import com.admin.common.utils.NotificationUtil;
import com.admin.entity.PackagePlan;
import com.admin.entity.TaskQueue;
import com.admin.entity.User;
import com.admin.service.OrderService;
import com.admin.service.PackagePlanService;
import com.admin.service.TaskHandler;
import com.admin.service.UserService;
import com.alibaba.fastjson.JSONObject;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import java.math.BigDecimal;

/**
 * <p>
 * 任务队列的「订单续费」处理器：自动续费定时任务为每个到期窗口内、开启了自动续费的用户登记一条，
 * dedupKey 为「用户ID:本次到期时间」，同一用户同一个到期周期只会有一条任务，也就只会扣一次款。
 * payload 约定：{"userId": 1, "expTime": 1700000000000, "packageId": 2, "summary": "..."}
 * </p>
 * <p>
 * 涉及钱包扣款，所以重试有几条保护：
 * 1. 执行前重新读取用户：到期时间已经变化说明这个周期已经续费成功（含上一次扣款成功、但状态没来得及落库的情况），直接视为成功，不会重复扣款；
 * 2. 用户关闭了自动续费、或换了套餐，则不再续费；
 * 3. 超过到期时间 24 小时后不再重试（用户已被到期停用，不应再悄悄扣款），放弃并通知一次；
 * 4. 失败通知只在首次失败和最终放弃时各发一次，不会每次重试都打扰用户。
 * </p>
 */
@Component
public class OrderRenewTaskHandler implements TaskHandler {

    /** 到期后还允许继续重试多久，自动续费定时任务也据此不再登记过期更久的用户 */
    public static final long GIVE_UP_AFTER_EXPIRY_MS = 24L * 60 * 60 * 1000;

    public static final String TASK_TYPE = "ORDER_RENEW";

    @Resource
    @Lazy
    private UserService userService;

    @Resource
    @Lazy
    private OrderService orderService;

    @Resource
    @Lazy
    private PackagePlanService packagePlanService;

    @Resource
    @Lazy
    private NotificationUtil notificationUtil;

    @Override
    public String getTaskType() {
        return TASK_TYPE;
    }

    @Override
    public String getLabel() {
        return "订单续费";
    }

    @Override
    public R handle(TaskQueue task) {
        JSONObject payload = JSONObject.parseObject(task.getPayload());
        Long userId = payload != null ? payload.getLong("userId") : null;
        Long expTime = payload != null ? payload.getLong("expTime") : null;
        Long packageId = payload != null ? payload.getLong("packageId") : null;
        if (userId == null || expTime == null || packageId == null) {
            return R.err("任务数据缺少 userId/expTime/packageId");
        }

        User user = userService.getById(userId);
        if (user == null) {
            return R.ok("用户已不存在，无需续费");
        }
        // 到期时间变了：这个周期已经续费过（或被管理员手动处理），不再重复扣款
        if (user.getExpTime() == null || !expTime.equals(user.getExpTime())) {
            return R.ok("该到期周期已处理");
        }
        if (user.getAutoRenew() == null || user.getAutoRenew() != 1 || !packageId.equals(user.getPackageId())) {
            return R.ok("用户已关闭自动续费或更换了套餐");
        }

        long now = System.currentTimeMillis();
        if (now > expTime + GIVE_UP_AFTER_EXPIRY_MS) {
            notificationUtil.notifyRenewFailed(user, "已超过续费时限，自动续费已放弃，请手动续费");
            return R.ok("已放弃自动续费");
        }

        PackagePlan plan = packagePlanService.getById(packageId);
        BigDecimal price = (plan != null && plan.getPrice() != null) ? plan.getPrice() : BigDecimal.ZERO;

        R result = orderService.purchasePackageForUser(user, packageId, null);
        if (result != null && result.getCode() == 0) {
            notificationUtil.notifyRenewSuccess(user, price);
            return R.ok();
        }
        String reason = result != null ? result.getMsg() : "未知错误";
        // 只在首次失败时通知用户（如余额不足），之后的重试静默进行，直到成功或放弃
        if (task.getRetryCount() == null || task.getRetryCount() == 0) {
            notificationUtil.notifyRenewFailed(user, reason);
        }
        return R.err(reason);
    }
}
