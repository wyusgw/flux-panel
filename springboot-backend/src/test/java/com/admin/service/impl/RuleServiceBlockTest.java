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
    void noPackageWithManualQuotaIsAllowed() {
        assertNull(ForwardServiceImpl.ruleServiceBlockReason(user(null, 10L, 0L, 0L, null), NOW));
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
    void missingUserIsBlocked() {
        assertEquals("用户不存在", ForwardServiceImpl.ruleServiceBlockReason(null, NOW));
    }
}
