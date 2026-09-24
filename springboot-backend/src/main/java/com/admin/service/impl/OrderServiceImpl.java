package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.common.utils.JwtUtil;
import com.admin.entity.Order;
import com.admin.entity.PackagePlan;
import com.admin.entity.RedeemCode;
import com.admin.entity.User;
import com.admin.mapper.OrderMapper;
import com.admin.service.OrderService;
import com.admin.service.PackagePlanService;
import com.admin.service.RechargeService;
import com.admin.service.RedeemCodeService;
import com.admin.service.UserService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

@Service
public class OrderServiceImpl extends ServiceImpl<OrderMapper, Order> implements OrderService {

    private static final String ERROR_USER_NOT_FOUND = "用户不存在";
    private static final String ERROR_PACKAGE_NOT_FOUND = "套餐不存在或已下架";
    private static final String ERROR_INSUFFICIENT_BALANCE = "钱包余额不足，请先充值";
    private static final String ORDER_TYPE_PACKAGE = "package";
    private static final String ORDER_TYPE_MANUAL = "manual";
    private static final String ORDER_TYPE_RECHARGE = "recharge";
    private static final int ORDER_STATUS_PENDING = 0;
    private static final int ORDER_STATUS_PAID = 1;
    private static final int ORDER_STATUS_CANCELLED = 2;

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

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R purchasePackage(Long packageId, String redeemCode) {
        Integer userId = JwtUtil.getUserIdFromToken();
        if (userId == null) {
            return R.err("用户未登录或token无效");
        }

        User user = userService.getById(userId);
        if (user == null) {
            return R.err(ERROR_USER_NOT_FOUND);
        }

        return purchasePackageForUser(user, packageId, redeemCode);
    }

    /**
     * 购买/续费套餐的核心逻辑，不依赖 JWT 上下文，供定时任务（如自动续费）等非请求场景直接调用。
     * HTTP 入口 purchasePackage 仅负责从 JWT 解析出 user 后委托到这里，逻辑完全一致。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R purchasePackageForUser(User user, Long packageId, String redeemCode) {
        PackagePlan packagePlan = packagePlanService.getById(packageId);
        if (packagePlan == null) {
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

        BigDecimal balance = user.getWalletBalance() != null ? user.getWalletBalance() : BigDecimal.ZERO;

        if (balance.compareTo(price) < 0) {
            return R.err(ERROR_INSUFFICIENT_BALANCE);
        }

        // 所有校验通过后，才真正占用兑换码次数（原子扣减，失败说明被并发抢占）
        String appliedCode = null;
        if (redeemCodeEntity != null) {
            if (!redeemCodeService.consumeRedeemCode(redeemCodeEntity.getId())) {
                throw new RuntimeException("兑换码已被使用完，请重试");
            }
            appliedCode = redeemCode.trim();
        }

        long currentTime = System.currentTimeMillis();

        // 1. 扣减钱包余额
        User updateUser = new User();
        updateUser.setId(user.getId());
        updateUser.setWalletBalance(balance.subtract(price));

        // 2. 应用套餐：分配用户组、重置流量与转发数配额、延长/设置到期时间
        updateUser.setGroupId(packagePlan.getGroupId());
        updateUser.setPackageId(packagePlan.getId());
        updateUser.setFlow(packagePlan.getTraffic() != null ? packagePlan.getTraffic() : 0L);
        updateUser.setInFlow(0L);
        updateUser.setOutFlow(0L);
        updateUser.setNum(packagePlan.getMaxRules() != null ? packagePlan.getMaxRules() : 0);

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

        // 3. 记录订单
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
    @Transactional(rollbackFor = Exception.class)
    private R redeemBalanceCode(RedeemCode redeemCodeEntity) {
        Integer userId = JwtUtil.getUserIdFromToken();
        if (userId == null) {
            return R.err("用户未登录或token无效");
        }
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
        BigDecimal balance = user.getWalletBalance() != null ? user.getWalletBalance() : BigDecimal.ZERO;
        BigDecimal newBalance = balance.add(redeemCodeEntity.getAmount());
        User updateUser = new User();
        updateUser.setId(user.getId());
        updateUser.setWalletBalance(newBalance);
        updateUser.setUpdatedTime(currentTime);
        userService.updateById(updateUser);

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

        // 充值订单由待支付改为已支付：委托给充值服务，与网关回调走相同的原子更新+钱包加值逻辑
        if (ORDER_TYPE_RECHARGE.equals(order.getType())
                && orderStatus == ORDER_STATUS_PAID
                && order.getOrderStatus() != null && order.getOrderStatus() == ORDER_STATUS_PENDING) {
            return rechargeService.markOrderPaidManually(id);
        }

        Order update = new Order();
        update.setId(id);
        update.setOrderStatus(orderStatus);
        update.setUpdatedTime(System.currentTimeMillis());
        boolean result = this.updateById(update);
        return result ? R.ok("状态已更新") : R.err("更新失败");
    }

    private String generateOrderNo() {
        return System.currentTimeMillis() + String.valueOf(ThreadLocalRandom.current().nextInt(1000, 9999));
    }
}
