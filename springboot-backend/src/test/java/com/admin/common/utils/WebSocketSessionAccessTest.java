package com.admin.common.utils;

import com.admin.entity.User;
import com.admin.mapper.UserMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArraySet;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WebSocketSessionAccessTest {

    private User user(int roleId, int status, Integer reason, int demoMode) {
        User user = new User();
        user.setRoleId(roleId);
        user.setStatus(status);
        user.setDisableReason(reason);
        user.setDemoMode(demoMode);
        return user;
    }

    @Test
    void activeAccountsCanConnect() {
        assertTrue(WebSocketServer.canKeepUserSession(user(0, 1, 0, 0), 0, false));
        assertTrue(WebSocketServer.canKeepUserSession(user(1, 1, 0, 0), 1, false));
        assertTrue(WebSocketServer.canKeepUserSession(user(0, 1, 0, 1), 0, true));
    }

    @Test
    void deletedOrBannedAccountsCannot() {
        assertFalse(WebSocketServer.canKeepUserSession(null, 0, false));
        assertFalse(WebSocketServer.canKeepUserSession(user(0, 0, User.DISABLE_REASON_MANUAL, 0), 0, false));
        assertFalse(WebSocketServer.canKeepUserSession(user(1, 0, User.DISABLE_REASON_MANUAL, 0), 1, false));
    }

    @Test
    void expiredAccountsCanStillConnectBecauseTheyMayLogInToRenew() {
        assertTrue(WebSocketServer.canKeepUserSession(user(1, 0, User.DISABLE_REASON_EXPIRED, 0), 1, false));
    }

    @Test
    void oldAdminTokenStopsWorkingAfterDemotion() {
        assertFalse(WebSocketServer.canKeepUserSession(user(1, 1, 0, 0), 0, false));
    }

    @Test
    void demoRulesMatchTheHttpInterceptor() {
        // 关闭演示后旧的演示令牌失效；刚设为演示账号、令牌还不带标记时也不能当真管理员用
        assertFalse(WebSocketServer.canKeepUserSession(user(0, 1, 0, 0), 0, true));
        assertFalse(WebSocketServer.canKeepUserSession(user(0, 1, 0, 1), 0, false));
        assertFalse(WebSocketServer.canKeepUserSession(user(1, 1, 0, 1), 0, true));
    }

    private WebSocketSession session(int id, int roleId) {
        Map<String, Object> attributes = new HashMap<>();
        attributes.put("id", id);
        attributes.put("roleId", roleId);
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getAttributes()).thenReturn(attributes);
        when(session.getId()).thenReturn("s" + id);
        return session;
    }

    @SuppressWarnings("unchecked")
    private void withSession(WebSocketSession session, Runnable action) {
        CopyOnWriteArraySet<WebSocketSession> sessions = (CopyOnWriteArraySet<WebSocketSession>)
                ReflectionTestUtils.getField(WebSocketServer.class, "activeSessions");
        sessions.add(session);
        try {
            action.run();
        } finally {
            sessions.remove(session);
        }
    }

    @Test
    void bannedUsersOpenConnectionIsClosed() throws IOException {
        WebSocketServer server = new WebSocketServer();
        UserMapper mapper = mock(UserMapper.class);
        server.userMapper = mapper;
        when(mapper.selectById(any())).thenReturn(user(1, 0, User.DISABLE_REASON_MANUAL, 0));
        WebSocketSession session = session(901, 1);

        withSession(session, server::revalidateUserSessions);

        verify(session).close(CloseStatus.POLICY_VIOLATION);
    }

    @Test
    void activeUsersConnectionStaysAndDatabaseErrorsDoNotKickAnyone() throws IOException {
        WebSocketServer server = new WebSocketServer();
        UserMapper mapper = mock(UserMapper.class);
        server.userMapper = mapper;
        when(mapper.selectById(any())).thenReturn(user(1, 1, 0, 0));
        WebSocketSession session = session(902, 1);
        withSession(session, server::revalidateUserSessions);

        when(mapper.selectById(any())).thenThrow(new RuntimeException("db down"));
        withSession(session, server::revalidateUserSessions);

        verify(session, never()).close(any());
    }
}
