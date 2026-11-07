package com.admin.controller;

import com.admin.common.dto.ResetFlowDto;
import com.admin.common.utils.JwtUtil;
import com.admin.entity.User;
import com.admin.service.DemoChangeService;
import com.admin.service.UserService;
import com.admin.service.impl.UserServiceImpl;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LimitedAdminGuardTest {

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(JwtUtil.class, "SECRET_KEY", "test-secret");
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    private User user(long id, int roleId, String pages) {
        User user = new User();
        user.setId(id);
        user.setUser("u" + id);
        user.setRoleId(roleId);
        user.setStatus(1);
        user.setDemoMode(0);
        user.setMenuPermissions(pages);
        return user;
    }

    private void loginAs(User user) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", JwtUtil.generateToken(user));
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    }

    private DemoController demo(UserService users, DemoChangeService changes) {
        DemoController controller = new DemoController();
        ReflectionTestUtils.setField(controller, "userService", users);
        ReflectionTestUtils.setField(controller, "demoChangeService", changes);
        return controller;
    }

    @Test
    void limitedAdminCannotManageDemoAccounts() {
        User me = user(1, 0, "user");
        User demoAccount = user(2, 0, null);
        demoAccount.setDemoMode(1);
        UserService users = mock(UserService.class);
        when(users.getById(any())).thenAnswer(call -> Long.valueOf(call.getArgument(0).toString()) == 1L ? me : demoAccount);
        DemoChangeService changes = mock(DemoChangeService.class);
        DemoController controller = demo(users, changes);
        loginAs(me);
        Map<String, Object> params = new HashMap<>();
        params.put("id", 2);
        params.put("areas", Collections.singletonList("site"));

        assertEquals(403, controller.updatePermission(params).getCode());
        assertEquals(403, controller.commit(params).getCode());
        assertEquals(403, controller.restore(params).getCode());

        verify(users, never()).update(any(Wrapper.class));
        verify(changes, never()).commit(any());
        verify(changes, never()).restore(any());
    }

    @Test
    void fullAdminCanStillManageDemoAccounts() {
        User me = user(1, 0, null);
        User demoAccount = user(2, 0, null);
        demoAccount.setDemoMode(1);
        UserService users = mock(UserService.class);
        when(users.getById(any())).thenAnswer(call -> Long.valueOf(call.getArgument(0).toString()) == 1L ? me : demoAccount);
        DemoController controller = demo(users, mock(DemoChangeService.class));
        loginAs(me);
        Map<String, Object> params = new HashMap<>();
        params.put("id", 2);

        assertEquals(0, controller.commit(params).getCode());
    }

    private UserServiceImpl usersWith(User... records) {
        UserServiceImpl users = spy(new UserServiceImpl());
        for (User record : records) {
            doReturn(record).when(users).getById(record.getId());
            doReturn(record).when(users).getById(record.getId().intValue());
        }
        doReturn(true).when(users).updateById(any(User.class));
        return users;
    }

    @Test
    void limitedAdminCannotResetAnAdminsFlowButCanResetAUsers() {
        User me = user(1, 0, "user");
        User otherAdmin = user(2, 0, null);
        User normal = user(3, 1, null);
        UserServiceImpl users = usersWith(me, otherAdmin, normal);
        loginAs(me);
        ResetFlowDto dto = new ResetFlowDto();
        dto.setType(1);

        dto.setId(2);
        assertEquals(403, users.reset(dto).getCode());
        dto.setId(3);
        assertEquals(0, users.reset(dto).getCode());
    }
}
