package com.admin.service;

import com.admin.common.lang.R;
import com.admin.entity.DeviceGroup;
import com.admin.entity.Forward;
import com.admin.entity.User;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class InvalidCleanupFlowTest {

    private final UserService users = mock(UserService.class);
    private final ForwardService forwards = mock(ForwardService.class);
    private final TunnelService tunnels = mock(TunnelService.class);
    private final DeviceGroupService groups = mock(DeviceGroupService.class);
    private final SingleTunnelGroupService singleGroups = mock(SingleTunnelGroupService.class);
    private final OrderService orders = mock(OrderService.class);
    private final InvalidCleanupService service = new InvalidCleanupService();

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "userService", users);
        ReflectionTestUtils.setField(service, "forwardService", forwards);
        ReflectionTestUtils.setField(service, "tunnelService", tunnels);
        ReflectionTestUtils.setField(service, "deviceGroupService", groups);
        ReflectionTestUtils.setField(service, "singleTunnelGroupService", singleGroups);
        ReflectionTestUtils.setField(service, "orderService", orders);
        when(orders.list(any(Wrapper.class))).thenReturn(Collections.emptyList());
        when(users.deleteUser(anyLong())).thenReturn(R.ok());
        when(groups.deleteUserDeviceGroup(anyInt(), anyLong())).thenReturn(R.ok());
    }

    private static User user(long id, String name) {
        User user = new User();
        user.setId(id);
        user.setUser(name);
        user.setRoleId(1);
        user.setDemoMode(0);
        user.setWalletBalance(BigDecimal.ZERO);
        return user;
    }

    private static DeviceGroup group(long id) {
        DeviceGroup group = new DeviceGroup();
        group.setId(id);
        group.setName("g" + id);
        return group;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> data(R result) {
        return (Map<String, Object>) result.getData();
    }

    @Test
    void deletesUserThenOwnedDevicesAndSingleGroups() {
        when(users.list()).thenReturn(Collections.singletonList(user(7, "alice")));
        when(groups.list(any(Wrapper.class))).thenReturn(Collections.singletonList(group(10)));
        when(forwards.count(any(Wrapper.class))).thenReturn(0);

        Map<String, Object> result = data(service.cleanInvalidUsers());

        assertEquals(1, result.get("deleted"));
        assertTrue(((List<?>) result.get("failures")).isEmpty());
        InOrder order = inOrder(users, groups, singleGroups);
        order.verify(users).deleteUser(7L);
        order.verify(groups).deleteUserDeviceGroup(7, 10L);
        order.verify(singleGroups).remove(any(Wrapper.class));
    }

    @Test
    void userWhoseDevicesServeOthersIsSkippedEntirely() {
        when(users.list()).thenReturn(Collections.singletonList(user(7, "alice")));
        when(groups.list(any(Wrapper.class))).thenReturn(Collections.singletonList(group(10)));
        when(forwards.count(any(Wrapper.class))).thenReturn(2);

        Map<String, Object> result = data(service.cleanInvalidUsers());

        assertEquals(0, result.get("deleted"));
        assertEquals(1, ((List<?>) result.get("failures")).size());
        verify(users, never()).deleteUser(anyLong());
    }

    @Test
    void oneFailureDoesNotStopTheRest() {
        User paid = user(9, "paid");
        paid.setGroupId(1L);
        when(users.list()).thenReturn(Arrays.asList(user(7, "alice"), user(8, "bob"), paid));
        when(groups.list(any(Wrapper.class))).thenReturn(Collections.emptyList());
        when(users.deleteUser(7L)).thenReturn(R.err("boom"));

        Map<String, Object> result = data(service.cleanInvalidUsers());

        assertEquals(1, result.get("deleted"));
        assertEquals(1, ((List<?>) result.get("failures")).size());
        verify(users, never()).deleteUser(9L);
    }

    private void oneInvalidForward() {
        Forward invalid = new Forward();
        invalid.setId(1L);
        invalid.setName("r1");
        invalid.setUserId(404);
        invalid.setTunnelId(2);
        when(users.list(any(Wrapper.class))).thenReturn(Collections.singletonList(user(7, "alice")));
        when(tunnels.list(any(Wrapper.class))).thenReturn(Collections.emptyList());
        when(groups.list(any(Wrapper.class))).thenReturn(Collections.emptyList());
        when(forwards.list()).thenReturn(Collections.singletonList(invalid));
    }

    @Test
    void invalidForwardUsesNormalDeleteWhenItWorks() {
        oneInvalidForward();
        when(forwards.deleteForward(1L)).thenReturn(R.ok());
        assertEquals(1, data(service.cleanInvalidForwards()).get("deleted"));
        verify(forwards, never()).forceDeleteForward(anyLong());
    }

    @Test
    void invalidForwardFallsBackToForceDelete() {
        oneInvalidForward();
        when(forwards.deleteForward(1L)).thenReturn(R.err("隧道不存在"));
        when(forwards.forceDeleteForward(1L)).thenReturn(R.ok());
        assertEquals(1, data(service.cleanInvalidForwards()).get("deleted"));
    }

    @Test
    void forwardDeleteFailureIsReported() {
        oneInvalidForward();
        when(forwards.deleteForward(1L)).thenReturn(R.err("x"));
        when(forwards.forceDeleteForward(1L)).thenReturn(R.err("y"));
        Map<String, Object> result = data(service.cleanInvalidForwards());
        assertEquals(0, result.get("deleted"));
        assertEquals(1, ((List<?>) result.get("failures")).size());
    }
}
