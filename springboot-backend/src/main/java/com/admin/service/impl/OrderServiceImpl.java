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
import java.util.concurrent.ThreadLocalRandom;

@Service
public class OrderServiceImpl extends ServiceImpl<OrderMapper, Order> implements OrderService {

    private static final String ERROR_USER_NOT_FOUND = "用户不存在";
    private static final String ERROR_PACKAGE_NOT_FOUND = "套餐不存在或已下架";
    private static final String ERROR_INSUFFICIENT_BALANCE = "钱包余额不足，请先充值";
    private static final String ORDER_TYPE_PACKAGE = "package";
    private static final int ORDER_STATUS_PAID = 1;

    @Autowired
    @Lazy
    private UserService userService;

    @Autowired
    @Lazy
    private PackagePlanService packagePlanService;

    @Autowired
    @Lazy
    private RedeemCodeService redeemCodeService;

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
        if (redeemCodeEntity.getPackageId() == null) {
            return R.err("兑换码未关联套餐");
        }

        return purchasePackage(redeemCodeEntity.getPackageId(), redeemCode);
    }

    @Override
    public R getOrders() {
        Integer userId = JwtUtil.getUserIdFromToken();
        Integer roleId = JwtUtil.getRoleIdFromToken();

        List<Order> orders = (roleId != null && roleId == 0)
                ? this.list(new QueryWrapper<Order>().orderByDesc("created_time"))
                : this.list(new QueryWrapper<Order>().eq("user_id", userId).orderByDesc("created_time"));

        return R.ok(orders);
    }

    private String generateOrderNo() {
        return System.currentTimeMillis() + String.valueOf(ThreadLocalRandom.current().nextInt(1000, 9999));
    }
}
