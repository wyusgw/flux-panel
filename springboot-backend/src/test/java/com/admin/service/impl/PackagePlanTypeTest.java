package com.admin.service.impl;

import com.admin.entity.Order;
import com.admin.entity.PackagePlan;
import com.admin.entity.User;
import com.admin.service.ForwardService;
import com.admin.service.PackagePlanService;
import com.admin.service.RedeemCodeService;
import com.admin.service.UserService;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 套餐类型：不限时流量包、不限时流量包（可叠加）、月付、日付
 */
class PackagePlanTypeTest {

    private static final long DAY = 24L * 60 * 60 * 1000;

    private OrderServiceImpl orders;
    private UserService users;
    private PackagePlanService plans;
    private ForwardService forwards;

    @BeforeEach
    void setUp() {
        orders = spy(new OrderServiceImpl());
        users = mock(UserService.class);
        plans = mock(PackagePlanService.class);
        forwards = mock(ForwardService.class);
        ReflectionTestUtils.setField(orders, "userService", users);
        ReflectionTestUtils.setField(orders, "packagePlanService", plans);
        ReflectionTestUtils.setField(orders, "redeemCodeService", mock(RedeemCodeService.class));
        ReflectionTestUtils.setField(orders, "forwardService", forwards);
        doReturn(true).when(orders).save(any(Order.class));
        when(users.updateById(any(User.class))).thenReturn(true);
        when(users.update(eq(null), any(Wrapper.class))).thenReturn(true);
    }

    private static long at(int y, int m, int d) {
        return LocalDateTime.of(y, m, d, 12, 0).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    private static PackagePlan plan(String type, int duration, long traffic) {
        PackagePlan plan = new PackagePlan();
        plan.setId(7L);
        plan.setName("plan");
        plan.setType(type);
        plan.setDurationDays(duration);
        plan.setTraffic(traffic);
        plan.setMaxRules(5);
        plan.setGroupId(3L);
        plan.setPrice(new BigDecimal("1.00"));
        plan.setHidden(0);
        return plan;
    }

    private User user(Long packageId, long flow, long expTime) {
        User user = new User();
        user.setId(1L);
        user.setUser("u1");
        user.setStatus(1);
        user.setPackageId(packageId);
        user.setFlow(flow);
        user.setInFlow(4L);
        user.setOutFlow(5L);
        user.setNum(10);
        user.setGroupId(9L);
        user.setExpTime(expTime);
        return user;
    }

    private User purchase(PackagePlan plan, User current) {
        when(plans.getById(7L)).thenReturn(plan);
        when(users.getOne(any(Wrapper.class))).thenReturn(current);
        assertEquals(0, orders.purchasePackageForUser(current, 7L, null).getCode());
        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(users).updateById(saved.capture());
        return saved.getValue();
    }

    @Test
    void monthlyExtendsByCalendarMonthsAndClampsToMonthEnd() {
        assertEquals(at(2027, 2, 28), plan(PackagePlan.TYPE_MONTHLY, 1, 0).computeExpTime(at(2027, 1, 31)));
        assertEquals(at(2028, 2, 29), plan(PackagePlan.TYPE_MONTHLY, 1, 0).computeExpTime(at(2028, 1, 31)));
        assertEquals(at(2027, 6, 15), plan(PackagePlan.TYPE_MONTHLY, 3, 0).computeExpTime(at(2027, 3, 15)));
    }

    @Test
    void weeklySemiannualAndYearlyExtendExpiry() {
        long base = at(2027, 3, 15);
        assertEquals(base + 14 * DAY, plan(PackagePlan.TYPE_WEEKLY, 2, 0).computeExpTime(base));
        assertEquals(at(2027, 9, 15), plan(PackagePlan.TYPE_SEMIANNUAL, 1, 0).computeExpTime(base));
        assertEquals(at(2028, 3, 15), plan(PackagePlan.TYPE_SEMIANNUAL, 2, 0).computeExpTime(base));
        assertEquals(at(2028, 3, 15), plan(PackagePlan.TYPE_YEARLY, 1, 0).computeExpTime(base));
        // 月末：8/31 + 半年 = 2/28，2/29 + 1 年 = 2/28
        assertEquals(at(2028, 2, 29), plan(PackagePlan.TYPE_SEMIANNUAL, 1, 0).computeExpTime(at(2027, 8, 31)));
        assertEquals(at(2029, 2, 28), plan(PackagePlan.TYPE_YEARLY, 1, 0).computeExpTime(at(2028, 2, 29)));

        PackagePlanServiceImpl service = new PackagePlanServiceImpl();
        assertEquals("时长倍数至少为 1", ReflectionTestUtils.invokeMethod(service, "normalizeType", plan(PackagePlan.TYPE_YEARLY, 0, 0)));
        assertNull(ReflectionTestUtils.invokeMethod(service, "normalizeType", plan(PackagePlan.TYPE_WEEKLY, 3, 0)));
    }

    @Test
    void dailyTrafficAndStackExpiry() {
        long base = at(2027, 3, 15);
        assertEquals(base + 10 * DAY, plan(PackagePlan.TYPE_DAILY, 10, 0).computeExpTime(base));
        assertEquals(PackagePlan.PERMANENT_EXP_TIME, plan(PackagePlan.TYPE_TRAFFIC, 0, 0).computeExpTime(base));
        assertNull(plan(PackagePlan.TYPE_TRAFFIC_STACK, 0, 10).computeExpTime(base));
    }

    @Test
    void legacyNormalTypeKeepsOldBehaviour() {
        assertEquals(PackagePlan.TYPE_DAILY, plan("normal", 30, 0).effectiveType());
        assertEquals(PackagePlan.TYPE_TRAFFIC, plan("normal", 0, 0).effectiveType());
        assertEquals(PackagePlan.TYPE_TRAFFIC, plan(null, 0, 0).effectiveType());
    }

    @Test
    void saveValidatesTypeAndDuration() {
        PackagePlanServiceImpl service = new PackagePlanServiceImpl();

        PackagePlan monthly = plan(PackagePlan.TYPE_MONTHLY, 0, 0);
        assertEquals("时长倍数至少为 1", ReflectionTestUtils.invokeMethod(service, "normalizeType", monthly));

        PackagePlan traffic = plan(PackagePlan.TYPE_TRAFFIC, 12, 0);
        assertNull(ReflectionTestUtils.invokeMethod(service, "normalizeType", traffic));
        assertEquals(0, traffic.getDurationDays());

        PackagePlan emptyStack = plan(PackagePlan.TYPE_TRAFFIC_STACK, 0, 0);
        assertEquals("可叠加流量包的流量必须大于 0", ReflectionTestUtils.invokeMethod(service, "normalizeType", emptyStack));

        assertEquals("套餐类型不合法", ReflectionTestUtils.invokeMethod(service, "normalizeType", plan("quarterly", 1, 0)));

        PackagePlan legacy = plan("normal", 30, 0);
        assertNull(ReflectionTestUtils.invokeMethod(service, "normalizeType", legacy));
        assertEquals(PackagePlan.TYPE_DAILY, legacy.getType());
    }

    @Test
    void stackTrafficOnlyAddsToQuota() {
        long exp = System.currentTimeMillis() + 5 * DAY;
        User saved = purchase(plan(PackagePlan.TYPE_TRAFFIC_STACK, 0, 50), user(2L, 100, exp));

        assertEquals(150L, saved.getFlow());
        // 不改用户组、套餐、到期时间、规则数和已用流量
        assertNull(saved.getGroupId());
        assertNull(saved.getPackageId());
        assertNull(saved.getExpTime());
        assertNull(saved.getNum());
        assertNull(saved.getInFlow());
        assertNull(saved.getOutFlow());
        verify(forwards, never()).refreshLimitsAfterCommit(any());
    }

    @Test
    void stackTrafficLeavesUnlimitedUsersUnchanged() {
        User saved = purchase(plan(PackagePlan.TYPE_TRAFFIC_STACK, 0, 50), user(2L, 99999L, System.currentTimeMillis() + DAY));
        assertNull(saved.getFlow());
    }

    @Test
    void monthlyPurchaseReplacesPlanAndExtendsFromCurrentExpiry() {
        long exp = at(2099, 1, 31);
        User saved = purchase(plan(PackagePlan.TYPE_MONTHLY, 1, 200), user(2L, 100, exp));

        assertEquals(at(2099, 2, 28), saved.getExpTime());
        assertEquals(200L, saved.getFlow());
        assertEquals(0L, saved.getInFlow());
        assertEquals(5, saved.getNum());
        assertEquals(3L, saved.getGroupId());
        assertEquals(7L, saved.getPackageId());
    }

    @Test
    void trafficPackageIsPermanent() {
        User saved = purchase(plan(PackagePlan.TYPE_TRAFFIC, 0, 200), user(7L, 100, System.currentTimeMillis() + DAY));
        assertEquals(PackagePlan.PERMANENT_EXP_TIME, saved.getExpTime());
        assertEquals(200L, saved.getFlow());
    }
}
