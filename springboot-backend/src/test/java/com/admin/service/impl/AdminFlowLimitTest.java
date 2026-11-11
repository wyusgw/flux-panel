package com.admin.service.impl;

import com.admin.common.dto.ForwardDto;
import com.admin.common.dto.ForwardUpdateDto;
import com.admin.common.lang.R;
import com.admin.common.utils.JwtUtil;
import com.admin.common.utils.TunnelResolver;
import com.admin.entity.Forward;
import com.admin.entity.Tunnel;
import com.admin.entity.User;
import com.admin.service.UserService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.when;

class AdminFlowLimitTest {

    private static final long GB = 1024L * 1024L * 1024L;
    private static final int ADMIN_ID = 5;

    private ForwardServiceImpl service;
    private UserService users;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(JwtUtil.class, "SECRET_KEY", "test-secret");
        service = spy(new ForwardServiceImpl());
        users = mock(UserService.class);
        ReflectionTestUtils.setField(service, "userService", users);
        TunnelResolver resolver = mock(TunnelResolver.class);
        Tunnel disabled = new Tunnel();
        disabled.setStatus(0);
        when(resolver.resolveTunnel(any(Forward.class))).thenReturn(disabled);
        ReflectionTestUtils.setField(service, "tunnelResolver", resolver);
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    private User admin(long flow, long in, long out) {
        User user = new User();
        user.setId((long) ADMIN_ID);
        user.setUser("admin");
        user.setRoleId(0);
        user.setStatus(1);
        user.setDemoMode(0);
        user.setFlow(flow);
        user.setInFlow(in);
        user.setOutFlow(out);
        return user;
    }

    private void loginAs(User user) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", JwtUtil.generateToken(user));
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        when(users.getById(any())).thenReturn(user);
    }

    private ForwardUpdateDto updateOf(Forward forward) {
        ForwardUpdateDto dto = new ForwardUpdateDto();
        dto.setId(forward.getId());
        dto.setTunnelId(3);
        return dto;
    }

    private Forward rule(int ownerId) {
        Forward forward = new Forward();
        forward.setId(7L);
        forward.setUserId(ownerId);
        forward.setTunnelId(3);
        doReturn(forward).when(service).getById(7L);
        return forward;
    }

    @Test
    void flowRules() {
        long now = System.currentTimeMillis();
        assertNull(ForwardServiceImpl.adminBlockReason(admin(99999, 0, 0), now));
        assertNull(ForwardServiceImpl.adminBlockReason(admin(10, 5 * GB, 5 * GB - 1), now));
        assertEquals("用户流量已用完", ForwardServiceImpl.adminBlockReason(admin(0, 0, 0), now));
        assertEquals("用户流量已用完", ForwardServiceImpl.adminBlockReason(admin(10, 6 * GB, 4 * GB), now));
    }

    @Test
    void expiredAdminIsBlockedButNoExpiryOrFutureExpiryIsNot() {
        long now = 1_000_000L;
        User admin = admin(99999, 0, 0);
        assertNull(ForwardServiceImpl.adminBlockReason(admin, now));
        admin.setExpTime(now + 1);
        assertNull(ForwardServiceImpl.adminBlockReason(admin, now));
        admin.setExpTime(now);
        assertEquals("当前账号已到期", ForwardServiceImpl.adminBlockReason(admin, now));
    }

    @Test
    void expiredAdminCannotCreateEditOrResumeOwnRulesButCanStillManageUsers() {
        User expired = admin(99999, 0, 0);
        expired.setExpTime(System.currentTimeMillis() - 1000);
        loginAs(expired);

        assertEquals(403, service.createForward(new ForwardDto()).getCode());
        assertEquals(403, service.updateForward(updateOf(rule(ADMIN_ID))).getCode());
        assertNotEquals(403, service.updateForward(updateOf(rule(99))).getCode());
        assertNotEquals(403, service.syncForwardForTunnel(updateOf(rule(ADMIN_ID))).getCode());

        ReflectionTestUtils.setField(service, "tunnelResolver", enabledTunnelResolver());
        rule(ADMIN_ID);
        assertEquals(403, service.resumeForward(7L).getCode());
    }

    @Test
    void adminWithoutPackageButWithFlowCanCreate() {
        loginAs(admin(99999, 0, 0)); // packageId 为空，和默认管理员账号一样

        // 通过了流量校验，停在后面的「请指定隧道」
        assertEquals(-1, service.createForward(new ForwardDto()).getCode());
    }

    @Test
    void adminOutOfFlowCannotCreate() {
        loginAs(admin(0, 0, 0));
        assertEquals(403, service.createForward(new ForwardDto()).getCode());

        loginAs(admin(10, 6 * GB, 5 * GB));
        assertEquals(403, service.createForward(new ForwardDto()).getCode());
    }

    @Test
    void adminOutOfFlowCannotEditOwnRule() {
        loginAs(admin(0, 0, 0));

        R result = service.updateForward(updateOf(rule(ADMIN_ID)));

        assertEquals(403, result.getCode());
        assertEquals("用户流量已用完", result.getMsg());
    }

    @Test
    void adminOutOfFlowCanStillEditAUsersRule() {
        loginAs(admin(0, 0, 0));

        // 没被流量拦下，走到后面的隧道检查
        assertNotEquals(403, service.updateForward(updateOf(rule(99))).getCode());
    }

    @Test
    void tunnelSyncIsNotBlockedByTheAdminsFlow() {
        loginAs(admin(0, 0, 0));

        assertNotEquals(403, service.syncForwardForTunnel(updateOf(rule(ADMIN_ID))).getCode());
    }

    @Test
    void resumeIsGuardedTheSameWay() {
        ReflectionTestUtils.setField(service, "tunnelResolver", enabledTunnelResolver());
        loginAs(admin(0, 0, 0));
        rule(ADMIN_ID);
        assertEquals(403, service.resumeForward(7L).getCode());

        // 管理员恢复别人的规则不受自己的流量限制；节点不存在时规则记为运行中并登记同步任务，不再报错
        doReturn(true).when(service).updateById(any(com.admin.entity.Forward.class));
        ReflectionTestUtils.setField(service, "taskQueueService", mock(com.admin.service.TaskQueueService.class));
        rule(99);
        assertNotEquals(403, service.resumeForward(7L).getCode());
    }

    private TunnelResolver enabledTunnelResolver() {
        TunnelResolver resolver = mock(TunnelResolver.class);
        Tunnel tunnel = new Tunnel();
        tunnel.setStatus(1);
        tunnel.setType(1);
        tunnel.setInNodeId(1L);
        when(resolver.resolveTunnel(any(Forward.class))).thenReturn(tunnel);
        com.admin.service.NodeService nodes = mock(com.admin.service.NodeService.class);
        ReflectionTestUtils.setField(service, "nodeService", nodes);
        return resolver;
    }
}
