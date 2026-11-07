package com.admin.common.utils;

import org.springframework.stereotype.Component;

import javax.servlet.http.HttpServletRequest;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/**
 * 限制密码尝试次数，登录和订阅接口共用（订阅接口没有验证码）。计数放在内存里，重启后清零。
 * 客户端 IP 可能被伪造（后端端口对外开放时请求头可以随便写），所以除了按账号+IP，还按账号限制总次数。
 */
@Component
public class LoginAttemptLimiter {

    public static final String TOO_MANY_ATTEMPTS = "尝试次数过多，请 15 分钟后再试";

    private static final long WINDOW_MS = 15 * 60 * 1000L;
    private static final int MAX_PER_USER_AND_IP = 10;
    private static final int MAX_PER_IP = 50;
    private static final int MAX_PER_USER = 30;
    private static final int MAX_TRACKED_KEYS = 100_000;

    private final Map<String, Window> windows = new ConcurrentHashMap<>();
    private final LongSupplier clock;

    public LoginAttemptLimiter() {
        this(System::currentTimeMillis);
    }

    LoginAttemptLimiter(LongSupplier clock) {
        this.clock = clock;
    }

    /** 由 nginx 写入的真实 IP，直连后端时用连接地址；不用 X-Forwarded-For，它的第一段可以被客户端伪造 */
    public static String clientIp(HttpServletRequest request) {
        String realIp = request.getHeader("X-Real-IP");
        return realIp != null && !realIp.trim().isEmpty() ? realIp.trim() : request.getRemoteAddr();
    }

    public boolean isBlocked(String username, String ip) {
        return count("ui:" + username + "|" + ip) >= MAX_PER_USER_AND_IP
                || count("i:" + ip) >= MAX_PER_IP
                || count("u:" + username) >= MAX_PER_USER;
    }

    public void recordFailure(String username, String ip) {
        evictIfNeeded();
        increment("ui:" + username + "|" + ip);
        increment("i:" + ip);
        increment("u:" + username);
    }

    /** 登录成功只清除这个账号在这个 IP 上的计数，账号和 IP 的总计数继续保留，否则攻击者能用自己的账号清零 */
    public void recordSuccess(String username, String ip) {
        windows.remove("ui:" + username + "|" + ip);
    }

    private int count(String key) {
        Window window = windows.get(key);
        return window == null || window.expired(clock.getAsLong()) ? 0 : window.count;
    }

    private void increment(String key) {
        long now = clock.getAsLong();
        windows.compute(key, (k, window) -> {
            if (window == null || window.expired(now)) {
                return new Window(now, 1);
            }
            return new Window(window.start, window.count + 1);
        });
    }

    private void evictIfNeeded() {
        if (windows.size() < MAX_TRACKED_KEYS) {
            return;
        }
        long now = clock.getAsLong();
        windows.values().removeIf(window -> window.expired(now));
        // 大量不同账号名的请求可能撑满内存，此时宁可清零计数
        if (windows.size() >= MAX_TRACKED_KEYS) {
            windows.clear();
        }
    }

    private static final class Window {
        private final long start;
        private final int count;

        private Window(long start, int count) {
            this.start = start;
            this.count = count;
        }

        private boolean expired(long now) {
            return now - start >= WINDOW_MS;
        }
    }
}
