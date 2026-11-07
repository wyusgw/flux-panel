package com.admin.common.utils;

import com.admin.service.NodeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.WebSocketSession;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WebSocketNodeVisibilityTest {

    private WebSocketServer server;
    private NodeService nodes;
    private int userId;

    @BeforeEach
    void setUp() {
        server = new WebSocketServer();
        nodes = mock(NodeService.class);
        server.nodeService = nodes;
        // 可见节点缓存是静态的，每个用例用不同的用户
        userId = ThreadLocalRandom.current().nextInt(1_000_000, Integer.MAX_VALUE);
    }

    private WebSocketSession session(Object id, Object roleId) {
        Map<String, Object> attributes = new HashMap<>();
        attributes.put("id", id);
        attributes.put("roleId", roleId);
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getAttributes()).thenReturn(attributes);
        return session;
    }

    @Test
    void adminSeesEveryNodeWithoutQuery() {
        assertTrue(server.canSeeNode(session(1, 0), 7L));
        verify(nodes, never()).getVisibleNodeIds(any());
    }

    @Test
    void userOnlySeesVisibleNodesAndResultIsCached() {
        when(nodes.getVisibleNodeIds(userId)).thenReturn(Collections.singleton(7L));
        WebSocketSession session = session(userId, 1);

        assertTrue(server.canSeeNode(session, 7L));
        assertFalse(server.canSeeNode(session, 8L));

        verify(nodes, times(1)).getVisibleNodeIds(userId);
    }

    @Test
    void missingRoleIsTreatedAsNormalUser() {
        when(nodes.getVisibleNodeIds(userId)).thenReturn(Collections.emptySet());
        assertFalse(server.canSeeNode(session(userId, null), 7L));
    }

    @Test
    void lookupFailureHidesNodes() {
        when(nodes.getVisibleNodeIds(userId)).thenThrow(new RuntimeException("db down"));
        assertFalse(server.canSeeNode(session(userId, 1), 7L));
    }
}
