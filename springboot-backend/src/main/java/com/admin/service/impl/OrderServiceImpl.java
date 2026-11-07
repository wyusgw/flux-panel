package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.common.utils.JwtUtil;
import com.admin.entity.Order;
import com.admin.entity.PackagePlan;
import com.admin.entity.RedeemCode;
import com.admin.entity.User;
import com.admin.mapper.OrderMapper;
import com.admin.service.ForwardService;
import com.admin.service.OrderService;
import com.admin.service.PackagePlanService;
import com.admin.service.RechargeService;
import com.admin.service.RedeemCodeService;
import com.admin.service.TaskQueueService;
import com.admin.service.UserService;
import com.admin.service.impl.task.OrderPurchaseTaskHandler;
import com.admin.entity.TaskQueue;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collections;
import java.util.HashMap;
import java.util.Objects;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

@Service
public class OrderServiceImpl extends ServiceImpl<OrderMapper, Order> implements OrderService {

    private static final String ERROR_USER_NOT_FOUND = "用户不存在";
    private static final String ERROR_ACCOUNT_DISABLED = "账号已被禁用，无法购买套餐";
    private static final String ERROR_PACKAGE_NOT_FOUND = "套餐不存在或已下架";
    private static final String ERROR_INSUFFICIENT_BALANCE = "钱包余额不足，请先充值";
    private static final String ORDER_TYPE_PACKAGE = "package";
    private static final String ORDER_TYPE_MANUAL = "manual";
    private static final String ORDER_TYPE_RECHARGE = "recharge";
    private static final int ORDER_STATUS_PENDING = 0;
    private static final int ORDER_STATUS_PAID = 1;
    private static final int ORDER_STATUS_CANCELLED = 2;
    // 套餐流量/规则数填 0 表示不限；User.flow/User.num 现有的"无限"约定用的是 99999 这个哨兵值
    // （参见 ExpiryReminderAsync/前端 dashboard.tsx 的 formatFlow/formatNumber），这里购买时直接
    // 把 0 换算成 99999，就能直接复用现有那一整套"无限"展示与到期提醒跳过逻辑，不用另外改枚举点
    private static final long UNLIMITED_FLOW = 99999L;
    private static final int UNLIMITED_RULES = 99999;

    @Autowired
    @Lazy
    private UserService userService;

    @Autowired
    @Lazy
    private PackagePlanService packagePlanService;

    @Autowired
    @Lazy
    private RedeemCodeService redeemCodeService;

    @Autowired
    @Lazy
    private RechargeService rechargeService;

    @Autowired
    @Lazy
    private ForwardService forwardService;

    @Autowired
    private TransactionTemplate transactionTemplate;

    /** 提交订单后最多等多久拿结果，超过则返回「处理中」，由前端稍后刷新 */
    private static final long PURCHASE_WAIT_MS = 8000L;
    private static final long PURCHASE_POLL_MS = 150L;

    @Autowired
    @Lazy
    private TaskQueueService taskQueueService;

    /**
     * 手动购买套餐：先做预校验（套餐、兑换码、余额），这些业务性拒绝当场返回；通过后登记到任务队列，
     * 由队列处理器真正扣款和应用套餐，这里短暂等待结果，对调用方来说仍是"提交即得到结果"。
     * 超过等待时间还没处理完则返回 data.pending=true，前端提示处理中并稍后刷新。
     */
    @Override
    public R purchasePackage(Long packageId, String redeemCode) {
        Integer userId = JwtUtil.getUserIdFromToken();
        if (userId == null) {
            return R.err("用户未登录或token无效");
        }

        User user = userService.getById(userId);
        if (user == null) {
            return R.err(ERROR_USER_NOT_FOUND);
        }

        R rejected = precheckPurchase(user, packageId, redeemCode);
        if (rejected != null) {
            return rejected;
        }

        // 同一用户已有一笔订单在处理中就不再接收新的，避免连点或重复提交造成重复扣款
        long processing = taskQueueService.count(new QueryWrapper<TaskQueue>()
                .eq("task_type", OrderPurchaseTaskHandler.TASK_TYPE)
                .likeRight("dedup_key", userId + ":")
                .eq("status", "PENDING").lt("retry_count", 1)
                // 只看最近 2 分钟内登记的：服务重启等异常留下的悬空记录不应永久挡住该用户下单
                .ge("created_time", System.currentTimeMillis() - 2 * 60 * 1000L));
        if (processing > 0) {
            return R.err("您有一笔订单正在处理中，请稍后再试");
        }

        PackagePlan plan = packagePlanService.getById(packageId);
        JSONObject payload = new JSONObject();
        payload.put("userId", userId);
        payload.put("packageId", packageId);
        if (StringUtils.isNotBlank(redeemCode)) {
            payload.put("redeemCode", redeemCode.trim());
        }
        payload.put("summary", "用户「" + user.getUser() + "」购买套餐「" + (plan != null ? plan.getName() : "#" + packageId) + "」");
        Long queueId = taskQueueService.enqueue(OrderPurchaseTaskHandler.TASK_TYPE,
                userId + ":" + UUID.randomUUID(), payload.toJSONString(), Collections.emptyList(), null);
        taskQueueService.dispatch(queueId);

        long deadline = System.currentTimeMillis() + PURCHASE_WAIT_MS;
        while (System.currentTimeMillis() < deadline) {
            TaskQueue item = taskQueueService.getById(queueId);
            if (item != null) {
                if ("SUCCESS".equals(item.getStatus())) {
                    return R.ok("购买成功");
                }
                if (item.getRetryCount() != null && item.getRetryCount() > 0) {
                    return R.err(item.getLastError() != null ? item.getLastError() : "购买失败");
                }
            }
            try {
                Thread.sleep(PURCHASE_POLL_MS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        Map<String, Object> pending = new HashMap<>();
        pending.put("pending", true);
        R result = R.ok(pending);
        result.setMsg("订单处理中，请稍后在「我的订单」查看结果");
        return result;
    }

    /**
     * 提交前的业务预校验，规则与 purchasePackageForUser 一致（不消耗兑换码次数、不扣款）；通过返回 null
     */
    private R precheckPurchase(User user, Long packageId, String redeemCode) {
        if (User.disabledByAdmin(user)) {
            return R.err(ERROR_ACCOUNT_DISABLED);
        }
        PackagePlan packagePlan = packagePlanService.getById(packageId);
        if (packagePlan == null || !isPlanPurchasable(packagePlan, user, redeemCode)) {
            return R.err(ERROR_PACKAGE_NOT_FOUND);
        }
        BigDecimal price = packagePlan.getPrice() != null ? packagePlan.getPrice() : BigDecimal.ZERO;
        if (StringUtils.isNotBlank(redeemCode)) {
            RedeemCode redeemCodeEntity = redeemCodeService.validateRedeemCode(redeemCode, packageId);
            if (redeemCodeEntity == null) {
                return R.err("兑换码无效、不适用于该套餐或已用完");
            }
            price = price.multiply(BigDecimal.valueOf(redeemCodeEntity.getDiscountRatio()))
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }
        BigDecimal balance = user.getWalletBalance() != null ? user.getWalletBalance() : BigDecimal.ZERO;
        if (balance.compareTo(price) < 0) {
            return R.err(ERROR_INSUFFICIENT_BALANCE);
        }
        return null;
    }

    /**
     * 隐藏套餐不能直接购买，否则知道 ID 就能买到内部或免费套餐。
     * 兑换码（后面会校验是否对应这个套餐）和续费当前套餐不受限，否则兑换来的隐藏套餐无法续费。
     */
    static boolean isPlanPurchasable(PackagePlan plan, User user, String redeemCode) {
        return !Integer.valueOf(1).equals(plan.getHidden())
                || StringUtils.isNotBlank(redeemCode)
                || Objects.equals(user.getPackageId(), plan.getId());
    }

    /**
     * 购买/续费套餐的核心逻辑，不依赖 JWT 上下文，供定时任务（如自动续费）等非请求场景直接调用。
     * HTTP 入口 purchasePackage 仅负责从 JWT 解析出 user 后委托到这里，逻辑完全一致。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R purchasePackageForUser(User user, Long packageId, String redeemCode) {
        // 管理员禁用的账号付款后也恢复不了，不能扣款；手动购买和自动续费都经过这里
        if (User.disabledByAdmin(user)) {
            return R.err(ERROR_ACCOUNT_DISABLED);
        }

        PackagePlan packagePlan = packagePlanService.getById(packageId);
        if (packagePlan == null) {
            return R.err(ERROR_PACKAGE_NOT_FOUND);
        }

        // 锁住用户记录再读最新数据：传入的 user 是事务外查的，并发购买时余额和到期时间都已过期，
        // 会出现只扣一次钱却买到两次，或扣两次钱却只延长一次
        user = userService.getOne(new QueryWrapper<User>().eq("id", user.getId()).last("FOR UPDATE"));
        if (user == null) {
            return R.err(ERROR_USER_NOT_FOUND);
        }
        if (User.disabledByAdmin(user)) {
            return R.err(ERROR_ACCOUNT_DISABLED);
        }
        if (!isPlanPurchasable(packagePlan, user, redeemCode)) {
            return R.err(ERROR_PACKAGE_NOT_FOUND);
        }

        BigDecimal price = packagePlan.getPrice() != null ? packagePlan.getPrice() : BigDecimal.ZERO;

        // 校验兑换码（此阶段仅校验，不消耗次数，避免余额不足等后续校验失败时误耗兑换码）
        RedeemCode redeemCodeEntity = null;
        if (StringUtils.isNotBlank(redeemCode)) {
            redeemCodeEntity = redeemCodeService.validateRedeemCode(redeemCode, packageId);
            if (redeemCodeEntity == null) {
                return R.err("兑换码无效、不适用于该套餐或已用完");
            }
            price = price.multiply(BigDecimal.valueOf(redeemCodeEntity.getDiscountRatio()))
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }

        // 条件扣款：余额不足时更新不到记录。这是事务里第一次写入，失败时没有东西需要回滚
        boolean debited = userService.update(null, new UpdateWrapper<User>()
                .eq("id", user.getId())
                .ge("wallet_balance", price)
                .setSql("wallet_balance = wallet_balance - " + price.toPlainString()));
        if (!debited) {
            return R.err(ERROR_INSUFFICIENT_BALANCE);
        }

        // 所有校验通过后，才真正占用兑换码次数（原子扣减，失败说明被并发抢占，抛异常回滚扣款）
        String appliedCode = null;
        if (redeemCodeEntity != null) {
            if (!redeemCodeService.consumeRedeemCode(redeemCodeEntity.getId())) {
                throw new RuntimeException("兑换码已被使用完，请重试");
            }
            appliedCode = redeemCode.trim();
        }

        long currentTime = System.currentTimeMillis();

        User updateUser = new User();
        updateUser.setId(user.getId());

        // 应用套餐：分配用户组、重置流量与转发数配额、延长/设置到期时间
        updateUser.setGroupId(packagePlan.getGroupId());
        updateUser.setPackageId(packagePlan.getId());
        // 因到期停用的账号购买后恢复；管理员禁用的账号不受影响。已暂停的规则由用户自己恢复
        if (User.disabledByExpiry(user)) {
            updateUser.setStatus(1);
            updateUser.setDisableReason(User.DISABLE_REASON_NONE);
        }
        Long planTraffic = packagePlan.getTraffic();
        updateUser.setFlow(planTraffic == null || planTraffic <= 0 ? UNLIMITED_FLOW : planTraffic);
        updateUser.setInFlow(0L);
        updateUser.setOutFlow(0L);
        Integer planMaxRules = packagePlan.getMaxRules();
        updateUser.setNum(planMaxRules == null || planMaxRules <= 0 ? UNLIMITED_RULES : planMaxRules);

        // 套餐设置了流量重置（非 -1）时，把重置日与重置时刻写入用户；-1 表示沿用用户当前的重置设置
        if (packagePlan.getFlowResetTime() != null && packagePlan.getFlowResetTime() >= 0) {
            updateUser.setFlowResetTime(packagePlan.getFlowResetTime());
            updateUser.setFlowResetClock(StringUtils.isBlank(packagePlan.getFlowResetClock()) ? "00:00" : packagePlan.getFlowResetClock().trim());
        }

        long baseExpTime = (user.getExpTime() != null && user.getExpTime() > currentTime) ? user.getExpTime() : currentTime;
        if (packagePlan.getDurationDays() != null && packagePlan.getDurationDays() > 0) {
            updateUser.setExpTime(baseExpTime + packagePlan.getDurationDays() * 24L * 60L * 60L * 1000L);
        } else {
            // 永久套餐：设置为一个极远的到期时间
            updateUser.setExpTime(4102415999000L); // 2099-12-31
        }
        updateUser.setUpdatedTime(currentTime);

        boolean userUpdateResult = userService.updateById(updateUser);
        if (!userUpdateResult) {
            throw new RuntimeException("套餐应用失败");
        }

        // 换了套餐：套餐限速随之变化，事务提交后把该用户名下运行中规则的限速刷新到节点（续费同一个套餐则不用）
        if (!Objects.equals(user.getPackageId(), packagePlan.getId())) {
            forwardService.refreshLimitsAfterCommit(Collections.singletonList(user.getId().intValue()));
        }

        // 记录订单
        Order order = new Order();
        order.setOrderNo(generateOrderNo());
        order.setUserId(user.getId());
        order.setUserName(user.getUser());
        order.setType(ORDER_TYPE_PACKAGE);
        order.setPackageId(packagePlan.getId());
        order.setRedeemCode(appliedCode);
        order.setInfo(appliedCode != null
                ? "购买套餐：" + packagePlan.getName() + "（使用兑换码 " + appliedCode + "）"
                : "购买套餐：" + packagePlan.getName());
        order.setAmount(price);
        order.setOrderStatus(ORDER_STATUS_PAID);
        order.setPaidTime(currentTime);
        order.setCreatedTime(currentTime);
        order.setUpdatedTime(currentTime);
        order.setStatus(1);

        boolean orderSaveResult = this.save(order);
        if (!orderSaveResult) {
            throw new RuntimeException("订单创建失败");
        }

        return R.ok("购买成功");
    }

    @Override
    public R redeemCode(String redeemCode) {
        if (StringUtils.isBlank(redeemCode)) {
            return R.err("请输入兑换码");
        }

        RedeemCode redeemCodeEntity = redeemCodeService.findByCode(redeemCode);
        if (redeemCodeEntity == null) {
            return R.err("兑换码不存在");
        }

        if ("balance".equals(redeemCodeEntity.getType())) {
            return redeemBalanceCode(redeemCodeEntity);
        }

        if (redeemCodeEntity.getPackageId() == null) {
            return R.err("兑换码未关联套餐");
        }

        return purchasePackage(redeemCodeEntity.getPackageId(), redeemCode);
    }

    /**
     * 兑换钱包余额：与套餐兑换/购买是完全独立的一条路径，不涉及套餐、用户组、到期时间，
     * 仅原子扣减兑换码剩余次数后为用户钱包加值，并记录一条订单方便对账。
     */
    private R redeemBalanceCode(RedeemCode redeemCodeEntity) {
        Integer userId = JwtUtil.getUserIdFromToken();
        if (userId == null) {
            return R.err("用户未登录或token无效");
        }
        // 这里是同一个对象内部调用，方法上的 @Transactional 不生效，所以显式开事务；
        // 也不能把事务加在 redeemCode 上：套餐兑换要等队列处理，事务不提交队列就拿不到任务
        return transactionTemplate.execute(status -> applyBalanceCode(userId, redeemCodeEntity));
    }

    R applyBalanceCode(Integer userId, RedeemCode redeemCodeEntity) {
        User user = userService.getById(userId);
        if (user == null) {
            return R.err(ERROR_USER_NOT_FOUND);
        }
        if (redeemCodeEntity.getAmount() == null || redeemCodeEntity.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            return R.err("兑换码配置有误");
        }
        if (redeemCodeEntity.getUsesRemaining() == null || redeemCodeEntity.getUsesRemaining() <= 0) {
            return R.err("兑换码不存在、已失效或已用完");
        }

        // 原子扣减，避免并发重复兑换
        if (!redeemCodeService.consumeRedeemCode(redeemCodeEntity.getId())) {
            return R.err("兑换码已被使用完，请重试");
        }

        long currentTime = System.currentTimeMillis();
        // 原子加值：写回读到的余额会覆盖同时发生的充值或购买
        boolean credited = userService.update(null, new UpdateWrapper<User>()
                .eq("id", user.getId())
                .setSql("wallet_balance = wallet_balance + " + redeemCodeEntity.getAmount().toPlainString())
                .set("updated_time", currentTime));
        if (!credited) {
            throw new RuntimeException("余额更新失败");
        }
        BigDecimal newBalance = userService.getById(user.getId()).getWalletBalance();

        Order order = new Order();
        order.setOrderNo(generateOrderNo());
        order.setUserId(user.getId());
        order.setUserName(user.getUser());
        order.setType("redeem_balance");
        order.setRedeemCode(redeemCodeEntity.getCode());
        order.setInfo("兑换码充值余额（" + redeemCodeEntity.getAmount() + " 元）");
        order.setAmount(redeemCodeEntity.getAmount());
        order.setOrderStatus(ORDER_STATUS_PAID);
        order.setPaidTime(currentTime);
        order.setCreatedTime(currentTime);
        order.setUpdatedTime(currentTime);
        order.setStatus(1);

        boolean orderSaveResult = this.save(order);
        if (!orderSaveResult) {
            throw new RuntimeException("订单创建失败");
        }

        // R.ok(Object) 是把参数写进 .data 而不是 .msg（这是本项目 R 的既有约定），
        // 这里直接返回结构化数据，让前端能可靠读到兑换到账金额，而不是依赖一段拼好的文案字符串
        java.util.Map<String, Object> result = new java.util.HashMap<>();
        result.put("type", "balance");
        result.put("amount", redeemCodeEntity.getAmount());
        result.put("newBalance", newBalance);
        return R.ok(result);
    }

    @Override
    public R getOrders() {
        Integer userId = JwtUtil.getUserIdFromToken();

        List<Order> orders = this.list(new QueryWrapper<Order>()
                .eq("user_id", userId)
                .orderByDesc("created_time"));

        return R.ok(orders);
    }

    @Override
    public R getAllOrdersForAdmin() {
        List<Order> orders = this.list(new QueryWrapper<Order>().orderByDesc("created_time"));
        return R.ok(orders);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R manualCreateOrder(Map<String, Object> params) {
        Object userIdObj = params.get("userId");
        if (userIdObj == null) {
            return R.err("请选择用户");
        }
        Long userId = Long.valueOf(userIdObj.toString());

        User user = userService.getById(userId);
        if (user == null) {
            return R.err(ERROR_USER_NOT_FOUND);
        }

        Object infoObj = params.get("info");
        String info = infoObj == null ? "" : infoObj.toString().trim();
        if (StringUtils.isBlank(info)) {
            return R.err("请填写订单信息");
        }

        BigDecimal amount;
        try {
            amount = new BigDecimal(params.get("amount") == null ? "0" : params.get("amount").toString());
        } catch (NumberFormatException e) {
            return R.err("金额格式不正确");
        }

        long currentTime = System.currentTimeMillis();

        Order order = new Order();
        order.setOrderNo(generateOrderNo());
        order.setUserId(user.getId());
        order.setUserName(user.getUser());
        order.setType(ORDER_TYPE_MANUAL);
        order.setInfo(info);
        order.setAmount(amount);
        order.setOrderStatus(ORDER_STATUS_PAID);
        order.setPaidTime(currentTime);
        order.setCreatedTime(currentTime);
        order.setUpdatedTime(currentTime);
        order.setStatus(1);

        boolean result = this.save(order);
        if (!result) {
            throw new RuntimeException("订单创建失败");
        }

        return R.ok("创建成功");
    }

    @Override
    public R batchDeleteOrders(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return R.err("请选择要删除的订单");
        }
        boolean result = this.removeByIds(ids);
        return result ? R.ok("删除成功") : R.err("删除失败");
    }

    @Override
    public R updateOrderStatus(Long id, Integer orderStatus) {
        if (orderStatus == null || (orderStatus != ORDER_STATUS_PENDING && orderStatus != ORDER_STATUS_PAID && orderStatus != ORDER_STATUS_CANCELLED)) {
            return R.err("状态值不正确");
        }

        Order order = this.getById(id);
        if (order == null) {
            return R.err("订单不存在");
        }

        if (ORDER_TYPE_RECHARGE.equals(order.getType())) {
            Integer current = order.getOrderStatus();
            // 已支付的充值订单不能改回：余额不会退回，之后再标记已支付或网关重发通知都会再加一次钱
            if (current != null && current == ORDER_STATUS_PAID && orderStatus != ORDER_STATUS_PAID) {
                return R.err("已支付的充值订单不能修改状态");
            }
            if (orderStatus == ORDER_STATUS_PAID) {
                // 待支付改为已支付：委托给充值服务，与网关回调走相同的原子更新+钱包加值逻辑
                if (current != null && current == ORDER_STATUS_PENDING) {
                    return rechargeService.markOrderPaidManually(id);
                }
                // 其他状态直接改成已支付不会给钱包加值，订单和余额就对不上了
                if (current == null || current != ORDER_STATUS_PAID) {
                    return R.err("已取消的充值订单请先改回待支付，再标记为已支付");
                }
            }
        }

        // 只在状态没变时更新：否则网关回调刚把订单改成已支付，这里又会用旧判断把它改回去
        UpdateWrapper<Order> update = new UpdateWrapper<Order>().eq("id", id)
                .set("order_status", orderStatus)
                .set("updated_time", System.currentTimeMillis());
        if (order.getOrderStatus() != null) {
            update.eq("order_status", order.getOrderStatus());
        }
        boolean result = this.update(update);
        return result ? R.ok("状态已更新") : R.err("订单状态已变化，请刷新后重试");
    }

    private String generateOrderNo() {
        return System.currentTimeMillis() + String.valueOf(ThreadLocalRandom.current().nextInt(1000, 9999));
    }
}
