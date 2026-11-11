package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.PackagePlan;
import com.admin.entity.User;
import com.admin.entity.UserGroup;
import com.admin.service.ForwardService;
import com.admin.service.UserGroupService;
import com.admin.service.UserService;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 推送套餐更新：把套餐的流量、用户组、规则数、限速推送给持有该套餐的用户
 */
class PackagePlanPushTest {

    private PackagePlanServiceImpl service;
    private UserService users;
    private UserGroupService groups;
    private ForwardService forwards;

    @BeforeEach
    void setUp() {
        service = spy(new PackagePlanServiceImpl());
        users = mock(UserService.class);
        groups = mock(UserGroupService.class);
        forwards = mock(ForwardService.class);
        ReflectionTestUtils.setField(service, "userService", users);
        ReflectionTestUtils.setField(service, "userGroupService", groups);
        ReflectionTestUtils.setField(service, "forwardService", forwards);
        when(groups.getById(3L)).thenReturn(new UserGroup());
    }

    private PackagePlan plan(String type, long traffic, int maxRules) {
        PackagePlan plan = new PackagePlan();
        plan.setId(7L);
        plan.setType(type);
        plan.setTraffic(traffic);
        plan.setMaxRules(maxRules);
        plan.setGroupId(3L);
        return plan;
    }

    private User user(long id) {
        User user = new User();
        user.setId(id);
        return user;
    }

    @SuppressWarnings("unchecked")
    private String pushedSql() {
        ArgumentCaptor<Wrapper<User>> captor = ArgumentCaptor.forClass(Wrapper.class);
        verify(users).update(eq(null), captor.capture());
        return ((UpdateWrapper<User>) captor.getValue()).getSqlSet();
    }

    @Test
    void pushesOnlyTheChosenFieldsToHoldersOfThePlan() {
        doReturn(plan(PackagePlan.TYPE_MONTHLY, 0, 8)).when(service).getById(7L);
        when(users.list(any(Wrapper.class))).thenReturn(Arrays.asList(user(1), user(2)));

        R result = service.pushPackagePlanToUsers(7L, true, false, true, false);

        assertEquals(0, result.getCode());
        assertEquals(2, result.getData());
        String sql = pushedSql();
        assertTrue(sql.contains("flow="));
        assertTrue(sql.contains("num="));
        assertFalse(sql.contains("group_id"));
        // 不清零已用流量
        assertFalse(sql.contains("in_flow"));
        verify(forwards, never()).refreshLimitsAfterCommit(any());
    }

    @Test
    @SuppressWarnings("unchecked")
    void unlimitedTrafficAndRulesAreWrittenAsTheUnlimitedMarker() {
        doReturn(plan(PackagePlan.TYPE_TRAFFIC, 0, 0)).when(service).getById(7L);
        when(users.list(any(Wrapper.class))).thenReturn(Collections.singletonList(user(1)));

        service.pushPackagePlanToUsers(7L, true, false, true, false);

        ArgumentCaptor<Wrapper<User>> captor = ArgumentCaptor.forClass(Wrapper.class);
        verify(users).update(eq(null), captor.capture());
        UpdateWrapper<User> wrapper = (UpdateWrapper<User>) captor.getValue();
        assertTrue(wrapper.getParamNameValuePairs().values().stream().filter(v -> Long.valueOf(99999L).equals(v)).count() >= 2);
    }

    @Test
    @SuppressWarnings("unchecked")
    void limitsOnlyRefreshesRunningRulesWithoutWritingUsers() {
        doReturn(plan(PackagePlan.TYPE_MONTHLY, 10, 8)).when(service).getById(7L);
        when(users.list(any(Wrapper.class))).thenReturn(Arrays.asList(user(1), user(2)));

        service.pushPackagePlanToUsers(7L, false, false, false, true);

        verify(users, never()).update(any(), any(Wrapper.class));
        ArgumentCaptor<Collection<Integer>> ids = ArgumentCaptor.forClass(Collection.class);
        verify(forwards).refreshLimitsAfterCommit(ids.capture());
        assertEquals(Arrays.asList(1, 2), ids.getValue());
    }

    @Test
    void rejectsStackPacksAndEmptySelections() {
        doReturn(plan(PackagePlan.TYPE_TRAFFIC_STACK, 10, 0)).when(service).getById(7L);
        assertEquals("可叠加流量包不作为用户的套餐，没有可推送的用户", service.pushPackagePlanToUsers(7L, true, false, false, false).getMsg());

        doReturn(plan(PackagePlan.TYPE_MONTHLY, 10, 0)).when(service).getById(7L);
        assertEquals("请选择要推送的内容", service.pushPackagePlanToUsers(7L, false, false, false, false).getMsg());
        verify(users, never()).update(any(), any(Wrapper.class));
    }

    @Test
    void noHoldersMeansNothingIsWritten() {
        doReturn(plan(PackagePlan.TYPE_MONTHLY, 10, 0)).when(service).getById(7L);
        when(users.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        assertEquals(0, service.pushPackagePlanToUsers(7L, true, true, true, true).getData());
        verify(users, never()).update(any(), any(Wrapper.class));
        verify(forwards, never()).refreshLimitsAfterCommit(any());
    }
}
