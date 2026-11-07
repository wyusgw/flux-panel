package com.admin.common.utils;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LoginAttemptLimiterTest {

    private final AtomicLong now = new AtomicLong(1_000_000L);
    private final LoginAttemptLimiter limiter = new LoginAttemptLimiter(now::get);

    private void fail(String user, String ip, int times) {
        for (int i = 0; i < times; i++) {
            limiter.recordFailure(user, ip);
        }
    }

    @Test
    void sameUserAndIpIsBlockedAfterTenFailures() {
        fail("alice", "1.1.1.1", 9);
        assertFalse(limiter.isBlocked("alice", "1.1.1.1"));
        fail("alice", "1.1.1.1", 1);
        assertTrue(limiter.isBlocked("alice", "1.1.1.1"));
        // 同一账号换个 IP、同一 IP 换个账号都还没到上限
        assertFalse(limiter.isBlocked("alice", "2.2.2.2"));
        assertFalse(limiter.isBlocked("bob", "1.1.1.1"));
    }

    @Test
    void forgedIpsStillHitThePerUserLimit() {
        for (int i = 0; i < 30; i++) {
            limiter.recordFailure("admin", "10.0.0." + i);
        }
        assertTrue(limiter.isBlocked("admin", "99.99.99.99"));
    }

    @Test
    void oneIpGuessingManyUsersIsBlocked() {
        for (int i = 0; i < 50; i++) {
            limiter.recordFailure("user" + i, "1.1.1.1");
        }
        assertTrue(limiter.isBlocked("someone-else", "1.1.1.1"));
    }

    @Test
    void limitExpiresAfterTheWindow() {
        fail("alice", "1.1.1.1", 10);
        now.addAndGet(15 * 60 * 1000L);
        assertFalse(limiter.isBlocked("alice", "1.1.1.1"));
        limiter.recordFailure("alice", "1.1.1.1");
        assertFalse(limiter.isBlocked("alice", "1.1.1.1"));
    }

    @Test
    void successClearsOnlyTheUserAndIpCounter() {
        fail("alice", "1.1.1.1", 9);
        limiter.recordSuccess("alice", "1.1.1.1");
        fail("alice", "1.1.1.1", 9);
        assertFalse(limiter.isBlocked("alice", "1.1.1.1"));

        // 攻击者用自己的账号登录成功，不能清掉该 IP 的总计数
        for (int i = 0; i < 50; i++) {
            limiter.recordFailure("victim" + i, "3.3.3.3");
        }
        limiter.recordSuccess("attacker", "3.3.3.3");
        assertTrue(limiter.isBlocked("victim0", "3.3.3.3"));
    }

    @Test
    void clientIpIgnoresForwardedForAndUsesRealIp() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("172.18.0.5");
        request.addHeader("X-Forwarded-For", "6.6.6.6");
        assertEquals("172.18.0.5", LoginAttemptLimiter.clientIp(request));

        request.addHeader("X-Real-IP", "8.8.4.4");
        assertEquals("8.8.4.4", LoginAttemptLimiter.clientIp(request));
    }
}
