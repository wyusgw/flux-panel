package com.admin.service.impl;

import com.admin.entity.User;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class RuleServiceBlockTest {

    private static final long GB = 1024L * 1024L * 1024L;
    private static final long NOW = 1_000_000L;

    private User user(Long packageId, Long flow, Long in, Long out, Long expTime) {
        User user = new User();
        user.setPackageId(packageId);
        user.setFlow(flow);
        user.setInFlow(in);
        user.setOutFlow(out);
        user.setExpTime(expTime);
        return user;
    }

    @Test
    void noPackageWithoutQuotaIsBlocked() {
        assertEquals("用户未购买套餐", ForwardServiceImpl.ruleServiceBlockReason(user(null, 0L, 0L, 0L, null), NOW));
        assertEquals("用户未购买套餐", ForwardServiceImpl.ruleServiceBlockReason(user(null, null, null, null, null), NOW));
    }

    @Test
    void noPackageIsBlockedEvenWithManualQuota() {
        assertEquals("用户未购买套餐", ForwardServiceImpl.ruleServiceBlockReason(user(null, 10L, 0L, 0L, null), NOW));
    }

    @Test
    void newlyRegisteredUserIsToldToBuyAPackageNotThatTheyExpired() {
        assertEquals("用户未购买套餐", ForwardServiceImpl.ruleServiceBlockReason(user(null, 0L, 0L, 0L, NOW), NOW));
    }

    @Test
    void exhaustedFlowIsBlockedCountingBothDirections() {
        assertEquals("用户流量已用完", ForwardServiceImpl.ruleServiceBlockReason(user(1L, 10L, 6 * GB, 4 * GB, null), NOW));
        assertEquals("用户流量已用完", ForwardServiceImpl.ruleServiceBlockReason(user(1L, 10L, 11 * GB, 0L, null), NOW));
        assertEquals("用户流量已用完", ForwardServiceImpl.ruleServiceBlockReason(user(1L, 0L, 0L, 0L, null), NOW));
    }

    @Test
    void flowLeftIsAllowed() {
        assertNull(ForwardServiceImpl.ruleServiceBlockReason(user(1L, 10L, 5 * GB, 5 * GB - 1, null), NOW));
        assertNull(ForwardServiceImpl.ruleServiceBlockReason(user(1L, 99999L, 500 * GB, 500 * GB, null), NOW));
    }

    @Test
    void expiredAccountIsBlockedFirst() {
        assertEquals("当前账号已到期", ForwardServiceImpl.ruleServiceBlockReason(user(1L, 10L, 0L, 0L, NOW), NOW));
        assertNull(ForwardServiceImpl.ruleServiceBlockReason(user(1L, 10L, 0L, 0L, NOW + 1), NOW));
    }

    @Test
    void disabledUserIsBlockedEvenWithFlowLeft() {
        User user = user(1L, 10L, 0L, 0L, null);
        user.setStatus(0);
        assertEquals("用户已被禁用", ForwardServiceImpl.ruleServiceBlockReason(user, NOW));
        user.setStatus(1);
        assertNull(ForwardServiceImpl.ruleServiceBlockReason(user, NOW));
    }

    @Test
    void tunnelGrantExpiryIsCheckedSeparately() {
        com.admin.entity.UserTunnel grant = new com.admin.entity.UserTunnel();
        grant.setStatus(1);
        assertEquals(false, ForwardServiceImpl.isTunnelGrantExpired(grant, NOW));
        grant.setExpTime(NOW + 1);
        assertEquals(false, ForwardServiceImpl.isTunnelGrantExpired(grant, NOW));
        grant.setExpTime(NOW);
        assertEquals(true, ForwardServiceImpl.isTunnelGrantExpired(grant, NOW));
        assertEquals(false, ForwardServiceImpl.isTunnelGrantExpired(null, NOW));
    }

    /** 走真实的创建流程：账号没到期，隧道授权到期了（状态还没被 0 点的任务改掉）也要拦住 */
    @Test
    void expiredTunnelGrantBlocksRuleCreation() {
        org.springframework.test.util.ReflectionTestUtils.setField(com.admin.common.utils.JwtUtil.class, "SECRET_KEY", "test-secret");
        long now = System.currentTimeMillis();
        User owner = user(1L, 100L, 0L, 0L, now + 86400000L);
        owner.setId(5L);
        owner.setUser("u");
        owner.setRoleId(1);
        owner.setStatus(1);
        owner.setDemoMode(0);
        owner.setNum(10);
        org.springframework.mock.web.MockHttpServletRequest request = new org.springframework.mock.web.MockHttpServletRequest();
        request.addHeader("Authorization", com.admin.common.utils.JwtUtil.generateToken(owner));
        org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(new org.springframework.web.context.request.ServletRequestAttributes(request));
        try {
            ForwardServiceImpl service = org.mockito.Mockito.spy(new ForwardServiceImpl());
            com.admin.service.UserService users = org.mockito.Mockito.mock(com.admin.service.UserService.class);
            org.mockito.Mockito.when(users.getById(org.mockito.ArgumentMatchers.any())).thenReturn(owner);
            com.admin.common.utils.TunnelResolver resolver = org.mockito.Mockito.mock(com.admin.common.utils.TunnelResolver.class);
            com.admin.entity.Tunnel tunnel = new com.admin.entity.Tunnel();
            tunnel.setStatus(1);
            tunnel.setType(1);
            tunnel.setInNodeId(1L);
            org.mockito.Mockito.when(resolver.resolveTunnel(org.mockito.ArgumentMatchers.any(Integer.class), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any())).thenReturn(tunnel);
            com.admin.entity.UserTunnel grant = new com.admin.entity.UserTunnel();
            grant.setId(9);
            grant.setStatus(1);
            grant.setExpTime(now - 1000);
            org.mockito.Mockito.when(resolver.resolveUserTunnel(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(Integer.class), org.mockito.ArgumentMatchers.any())).thenReturn(grant);
            org.springframework.test.util.ReflectionTestUtils.setField(service, "userService", users);
            org.springframework.test.util.ReflectionTestUtils.setField(service, "tunnelResolver", resolver);
            org.springframework.test.util.ReflectionTestUtils.setField(service, "deviceGroupService", org.mockito.Mockito.mock(com.admin.service.DeviceGroupService.class));
            org.springframework.test.util.ReflectionTestUtils.setField(service, "viteConfigService", org.mockito.Mockito.mock(com.admin.service.ViteConfigService.class));
            org.springframework.test.util.ReflectionTestUtils.setField(service, "nodeService", org.mockito.Mockito.mock(com.admin.service.NodeService.class));
            com.admin.common.dto.ForwardDto dto = new com.admin.common.dto.ForwardDto();
            dto.setTunnelId(3);

            com.admin.common.lang.R result = service.createForward(dto);

            assertEquals(403, result.getCode());
            assertEquals("隧道权限已到期", result.getMsg());
        } finally {
            org.springframework.web.context.request.RequestContextHolder.resetRequestAttributes();
        }
    }

    @Test
    void missingUserIsBlocked() {
        assertEquals("用户不存在", ForwardServiceImpl.ruleServiceBlockReason(null, NOW));
    }
}
