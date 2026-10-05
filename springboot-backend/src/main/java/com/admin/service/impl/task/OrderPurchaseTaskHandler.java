package com.admin.service.impl.task;

import com.admin.common.lang.R;
import com.admin.entity.TaskQueue;
import com.admin.entity.User;
import com.admin.service.OrderService;
import com.admin.service.TaskHandler;
import com.admin.service.UserService;
import com.alibaba.fastjson.JSONObject;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;

/**
 * <p>
 * 任务队列的「订单购买」处理器：用户手动购买套餐、使用兑换码兑换套餐时，由 OrderServiceImpl 在通过余额、
 * 兑换码等预校验后登记；真正的扣款和套餐应用在这里执行，同一用户同一时刻只会有一笔在处理。
 * payload 约定：{"userId": 1, "packageId": 2, "redeemCode": "xxx"（可空）, "summary": "..."}
 * </p>
 * <p>
 * 用户在页面上当场等结果，失败后不应过一会儿又悄悄扣款，所以这个任务不自动重试（{@link #isRetryable()}）。
 * </p>
 */
@Component
public class OrderPurchaseTaskHandler implements TaskHandler {

    public static final String TASK_TYPE = "ORDER_PURCHASE";

    @Resource
    @Lazy
    private UserService userService;

    @Resource
    @Lazy
    private OrderService orderService;

    @Override
    public String getTaskType() {
        return TASK_TYPE;
    }

    @Override
    public String getLabel() {
        return "订单购买";
    }

    @Override
    public boolean isRetryable() {
        return false;
    }

    @Override
    public R handle(TaskQueue task) {
        JSONObject payload = JSONObject.parseObject(task.getPayload());
        Integer userId = payload != null ? payload.getInteger("userId") : null;
        Long packageId = payload != null ? payload.getLong("packageId") : null;
        String redeemCode = payload != null ? payload.getString("redeemCode") : null;
        if (userId == null || packageId == null) {
            return R.err("任务数据缺少 userId/packageId");
        }
        User user = userService.getById(userId);
        if (user == null) {
            return R.err("用户不存在");
        }
        return orderService.purchasePackageForUser(user, packageId, redeemCode);
    }
}
