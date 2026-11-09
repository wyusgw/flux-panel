package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.common.task.AutoRenewAsync;
import com.admin.entity.TaskQueue;
import com.admin.entity.User;
import com.admin.service.OrderService;
import com.admin.service.PackagePlanService;
import com.admin.service.TaskQueueService;
import com.admin.service.UserService;
import com.admin.service.impl.task.OrderRenewTaskHandler;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DisabledAccountPurchaseTest {

    private User user(long id, int status, Integer reason) {
        User user = new User();
        user.setId(id);
        user.setUser("u" + id);
        user.setStatus(status);
        user.setDisableReason(reason);
        user.setExpTime(1000L);
        user.setAutoRenew(1);
        user.setPackageId(1L);
        return user;
    }

    @Test
    void onlyAdminDisabledAndLegacyAccountsCount() {
        assertTrue(User.disabledByAdmin(user(1, 0, User.DISABLE_REASON_MANUAL)));
        assertTrue(User.disabledByAdmin(user(1, 0, User.DISABLE_REASON_NONE)));
        assertTrue(User.disabledByAdmin(user(1, 0, null)));
        assertFalse(User.disabledByAdmin(user(1, 0, User.DISABLE_REASON_EXPIRED)));
        assertFalse(User.disabledByAdmin(user(1, 1, User.DISABLE_REASON_NONE)));
        assertFalse(User.disabledByAdmin(null));
    }

    @Test
    void purchaseIsRejectedBeforeAnyChargeForAdminDisabledAccount() {
        OrderServiceImpl service = new OrderServiceImpl();
        User banned = user(1, 0, User.DISABLE_REASON_MANUAL);

        // 没有注入任何依赖：如果校验不在最前面，这里会空指针
        assertEquals("账号已被禁用，无法购买套餐", service.purchasePackageForUser(banned, 1L, null).getMsg());
        R precheck = ReflectionTestUtils.invokeMethod(service, "precheckPurchase", banned, 1L, null);
        assertEquals("账号已被禁用，无法购买套餐", precheck.getMsg());
    }

    @Test
    void expiredAccountCanStillReachTheChargeStep() {
        OrderServiceImpl service = new OrderServiceImpl();
        PackagePlanService plans = mock(PackagePlanService.class);
        ReflectionTestUtils.setField(service, "packagePlanService", plans);
        User expired = user(1, 0, User.DISABLE_REASON_EXPIRED);

        // 查不到套餐时返回套餐不存在，说明通过了禁用校验
        assertEquals("套餐不存在或已下架", service.purchasePackageForUser(expired, 1L, null).getMsg());
        verify(plans).getById(1L);
    }

    @Test
    void renewTaskStopsWithoutChargingOrNotifyingAdminDisabledAccount() {
        OrderRenewTaskHandler handler = new OrderRenewTaskHandler();
        UserService users = mock(UserService.class);
        OrderService orders = mock(OrderService.class);
        ReflectionTestUtils.setField(handler, "userService", users);
        ReflectionTestUtils.setField(handler, "orderService", orders);
        when(users.getById(1L)).thenReturn(user(1, 0, User.DISABLE_REASON_MANUAL));
        TaskQueue task = new TaskQueue();
        task.setPayload("{\"userId\":1,\"expTime\":1000,\"packageId\":1}");

        assertEquals(0, handler.handle(task).getCode());

        verify(orders, never()).purchasePackageForUser(any(), any(), any());
    }

    @Test
    void autoRenewSkipsAdminDisabledAccountButKeepsExpiredOnes() {
        AutoRenewAsync job = new AutoRenewAsync();
        UserService users = mock(UserService.class);
        TaskQueueService queue = mock(TaskQueueService.class);
        ReflectionTestUtils.setField(job, "userService", users);
        ReflectionTestUtils.setField(job, "taskQueueService", queue);
        ReflectionTestUtils.setField(job, "packagePlanService", mock(PackagePlanService.class));
        when(users.list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(Arrays.asList(
                user(1, 0, User.DISABLE_REASON_MANUAL),
                user(2, 0, User.DISABLE_REASON_EXPIRED),
                user(3, 1, User.DISABLE_REASON_NONE)));
        when(queue.enqueue(anyString(), anyString(), anyString(), any(), any())).thenReturn(1L);

        job.autoRenew();

        verify(queue, never()).enqueue(anyString(), org.mockito.ArgumentMatchers.startsWith("1:"), anyString(), any(), any());
        verify(queue, times(2)).enqueue(anyString(), anyString(), anyString(), any(), any());
    }

    @Test
    void ruleOwnerCannotBeChangedByTheUpdateRequest() {
        ForwardServiceImpl service = new ForwardServiceImpl();
        com.admin.entity.Forward exist = new com.admin.entity.Forward();
        exist.setUserId(5);
        exist.setTunnelId(3);
        exist.setInPort(3001);
        exist.setOutPort(4001);
        com.admin.common.dto.ForwardUpdateDto request = new com.admin.common.dto.ForwardUpdateDto();
        request.setId(7L);
        request.setUserId(6);
        request.setTunnelId(3);
        request.setInPort(3001);

        com.admin.entity.Forward updated = ReflectionTestUtils.invokeMethod(service, "updateForwardEntity",
                request, exist, new com.admin.entity.Tunnel(), false);

        assertEquals(5, updated.getUserId());
        assertEquals(3001, updated.getInPort());
    }
}
