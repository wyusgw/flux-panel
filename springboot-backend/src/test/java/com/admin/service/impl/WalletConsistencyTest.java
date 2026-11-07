package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.common.utils.NotificationUtil;
import com.admin.entity.Order;
import com.admin.entity.PackagePlan;
import com.admin.entity.RedeemCode;
import com.admin.entity.User;
import com.admin.service.ForwardService;
import com.admin.service.PackagePlanService;
import com.admin.service.RedeemCodeService;
import com.admin.service.UserService;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WalletConsistencyTest {

    private static final long NOW_FUTURE = 4000000000000L;
    private static final long DAY = 24L * 60 * 60 * 1000;

    private OrderServiceImpl orders;
    private UserService users;
    private PackagePlanService plans;
    private RedeemCodeService codes;

    @BeforeEach
    void setUp() {
        orders = spy(new OrderServiceImpl());
        users = mock(UserService.class);
        plans = mock(PackagePlanService.class);
        codes = mock(RedeemCodeService.class);
        ReflectionTestUtils.setField(orders, "userService", users);
        ReflectionTestUtils.setField(orders, "packagePlanService", plans);
        ReflectionTestUtils.setField(orders, "redeemCodeService", codes);
        ReflectionTestUtils.setField(orders, "forwardService", mock(ForwardService.class));
        doReturn(true).when(orders).save(any(Order.class));
        when(users.updateById(any(User.class))).thenReturn(true);
    }

    private User user(long id, Long packageId, Long expTime) {
        User user = new User();
        user.setId(id);
        user.setUser("u" + id);
        user.setStatus(1);
        user.setPackageId(packageId);
        user.setExpTime(expTime);
        return user;
    }

    private PackagePlan plan(long id, String price, int hidden) {
        PackagePlan plan = new PackagePlan();
        plan.setId(id);
        plan.setName("plan");
        plan.setPrice(new BigDecimal(price));
        plan.setHidden(hidden);
        plan.setDurationDays(30);
        return plan;
    }

    @SuppressWarnings("unchecked")
    private String lastWalletSql() {
        ArgumentCaptor<Wrapper<User>> captor = ArgumentCaptor.forClass(Wrapper.class);
        verify(users).update(eq(null), captor.capture());
        return ((UpdateWrapper<User>) captor.getValue()).getSqlSet();
    }

    @Test
    void purchaseUsesFreshLockedDataForExpiryAndDebitsAtomically() {
        User stale = user(1, 7L, 1000L);
        when(plans.getById(7L)).thenReturn(plan(7, "10.00", 0));
        when(users.getOne(any(Wrapper.class))).thenReturn(user(1, 7L, NOW_FUTURE));
        when(users.update(eq(null), any(Wrapper.class))).thenReturn(true);

        assertEquals(0, orders.purchasePackageForUser(stale, 7L, null).getCode());

        assertTrue(lastWalletSql().contains("wallet_balance = wallet_balance - 10.00"));
        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(users).updateById(saved.capture());
        // 到期时间从锁内读到的最新值延长，而不是事务外的旧值
        assertEquals(NOW_FUTURE + 30 * DAY, saved.getValue().getExpTime());
        // 余额不能再用绝对值写回
        assertEquals(null, saved.getValue().getWalletBalance());
    }

    @Test
    void insufficientBalanceStopsBeforeConsumingCodeOrApplyingPlan() {
        when(plans.getById(7L)).thenReturn(plan(7, "10.00", 0));
        when(users.getOne(any(Wrapper.class))).thenReturn(user(1, null, null));
        when(users.update(eq(null), any(Wrapper.class))).thenReturn(false);
        RedeemCode code = new RedeemCode();
        code.setId(3L);
        code.setDiscountRatio(100);
        when(codes.validateRedeemCode("C", 7L)).thenReturn(code);

        R result = orders.purchasePackageForUser(user(1, null, null), 7L, "C");

        assertEquals(-1, result.getCode());
        verify(codes, never()).consumeRedeemCode(any());
        verify(users, never()).updateById(any(User.class));
    }

    @Test
    void codeRaceAfterDebitThrowsSoTheTransactionRollsBack() {
        when(plans.getById(7L)).thenReturn(plan(7, "10.00", 0));
        when(users.getOne(any(Wrapper.class))).thenReturn(user(1, null, null));
        when(users.update(eq(null), any(Wrapper.class))).thenReturn(true);
        RedeemCode code = new RedeemCode();
        code.setId(3L);
        code.setDiscountRatio(100);
        when(codes.validateRedeemCode("C", 7L)).thenReturn(code);
        when(codes.consumeRedeemCode(3L)).thenReturn(false);

        assertThrows(RuntimeException.class, () -> orders.purchasePackageForUser(user(1, null, null), 7L, "C"));
    }

    @Test
    void accountDisabledWhileWaitingForTheLockIsNotCharged() {
        when(plans.getById(7L)).thenReturn(plan(7, "10.00", 0));
        User disabled = user(1, 7L, null);
        disabled.setStatus(0);
        disabled.setDisableReason(User.DISABLE_REASON_MANUAL);
        when(users.getOne(any(Wrapper.class))).thenReturn(disabled);

        assertEquals("账号已被禁用，无法购买套餐", orders.purchasePackageForUser(user(1, 7L, null), 7L, null).getMsg());
        verify(users, never()).update(eq(null), any(Wrapper.class));
    }

    @Test
    void hiddenPlanRules() {
        PackagePlan hidden = plan(7, "0", 1);
        assertFalse(OrderServiceImpl.isPlanPurchasable(hidden, user(1, null, null), null));
        assertFalse(OrderServiceImpl.isPlanPurchasable(hidden, user(1, 8L, null), " "));
        assertTrue(OrderServiceImpl.isPlanPurchasable(hidden, user(1, null, null), "CODE"));
        assertTrue(OrderServiceImpl.isPlanPurchasable(hidden, user(1, 7L, null), null));
        assertTrue(OrderServiceImpl.isPlanPurchasable(plan(7, "0", 0), user(1, null, null), null));
        PackagePlan legacy = plan(7, "0", 0);
        legacy.setHidden(null);
        assertTrue(OrderServiceImpl.isPlanPurchasable(legacy, user(1, null, null), null));
    }

    @Test
    void hiddenPlanIsRejectedWithoutCharging() {
        when(plans.getById(7L)).thenReturn(plan(7, "0", 1));
        when(users.getOne(any(Wrapper.class))).thenReturn(user(1, null, null));

        assertEquals("套餐不存在或已下架", orders.purchasePackageForUser(user(1, null, null), 7L, null).getMsg());
        R precheck = ReflectionTestUtils.invokeMethod(orders, "precheckPurchase", user(1, null, null), 7L, null);
        assertEquals("套餐不存在或已下架", precheck.getMsg());
        verify(users, never()).update(eq(null), any(Wrapper.class));
    }

    @Test
    void balanceCodeCreditsAtomicallyAndReportsFreshBalance() {
        User fresh = user(1, null, null);
        fresh.setWalletBalance(new BigDecimal("25.00"));
        when(users.getById(1)).thenReturn(user(1, null, null));
        when(users.getById(1L)).thenReturn(fresh);
        when(users.update(eq(null), any(Wrapper.class))).thenReturn(true);
        when(codes.consumeRedeemCode(3L)).thenReturn(true);
        RedeemCode code = new RedeemCode();
        code.setId(3L);
        code.setAmount(new BigDecimal("5.00"));
        code.setUsesRemaining(1);

        R result = orders.applyBalanceCode(1, code);

        assertEquals(0, result.getCode());
        assertTrue(lastWalletSql().contains("wallet_balance = wallet_balance + 5.00"));
        assertEquals(new BigDecimal("25.00"), ((java.util.Map<?, ?>) result.getData()).get("newBalance"));
    }

    @Test
    void balanceCodeCreditFailureThrowsSoTheCodeIsRolledBack() {
        when(users.getById(1)).thenReturn(user(1, null, null));
        when(users.update(eq(null), any(Wrapper.class))).thenReturn(false);
        when(codes.consumeRedeemCode(3L)).thenReturn(true);
        RedeemCode code = new RedeemCode();
        code.setId(3L);
        code.setAmount(new BigDecimal("5.00"));
        code.setUsesRemaining(1);

        assertThrows(RuntimeException.class, () -> orders.applyBalanceCode(1, code));
    }

    @Test
    void rechargeCreditsAtomically() {
        RechargeServiceImpl recharge = new RechargeServiceImpl();
        ReflectionTestUtils.setField(recharge, "userService", users);
        ReflectionTestUtils.setField(recharge, "notificationUtil", mock(NotificationUtil.class));
        User fresh = user(1, null, null);
        fresh.setWalletBalance(new BigDecimal("30.00"));
        when(users.getById(1L)).thenReturn(fresh);
        when(users.update(eq(null), any(Wrapper.class))).thenReturn(true);
        Order order = new Order();
        order.setUserId(1L);
        order.setAmount(new BigDecimal("10.00"));

        Boolean credited = ReflectionTestUtils.invokeMethod(recharge, "creditWallet", order, 1000L);

        assertTrue(credited);
        assertTrue(lastWalletSql().contains("wallet_balance = wallet_balance + 10.00"));
    }
}
