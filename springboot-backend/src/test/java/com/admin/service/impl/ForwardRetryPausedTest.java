package com.admin.service.impl;

import com.admin.common.dto.GostDto;
import com.admin.common.lang.R;
import com.admin.common.utils.TunnelResolver;
import com.admin.entity.Forward;
import com.admin.entity.Node;
import com.admin.entity.Tunnel;
import com.admin.service.NodeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ForwardRetryPausedTest {

    private static final String NAME = "7_5_-1";

    private ForwardServiceImpl service;
    private Forward forward;
    private Tunnel tunnel;

    @BeforeEach
    void setUp() {
        service = spy(new ForwardServiceImpl());
        forward = new Forward();
        forward.setId(7L);
        forward.setUserId(5);
        forward.setStatus(0);
        forward.setOutPort(2000);
        tunnel = new Tunnel();
        tunnel.setType(2);
        tunnel.setStatus(1);
        tunnel.setInNodeId(10L);
        tunnel.setOutNodeId(20L);
        tunnel.setOutIp("203.0.113.1");
        doNothing().when(service).restorePausedStatus(anyLong());
    }

    private GostDto gost(String msg) {
        GostDto dto = new GostDto();
        dto.setMsg(msg);
        return dto;
    }

    @Test
    void pausedRuleIsPausedAgainOnBothNodesAfterPush() {
        doReturn(gost("OK")).when(service).pauseOnNode(anyLong(), anyString());
        doReturn(gost("OK")).when(service).pauseRemoteOnNode(anyLong(), anyString());

        R result = service.keepPausedAfterPush(forward, tunnel, NAME, R.ok());

        assertEquals(0, result.getCode());
        var order = inOrder(service);
        order.verify(service).pauseOnNode(10L, NAME);
        order.verify(service).pauseRemoteOnNode(20L, NAME);
    }

    @Test
    void portForwardOnlyPausesEntryNode() {
        tunnel.setType(1);
        doReturn(gost("OK")).when(service).pauseOnNode(anyLong(), anyString());

        assertEquals(0, service.keepPausedAfterPush(forward, tunnel, NAME, R.ok()).getCode());

        verify(service, never()).pauseRemoteOnNode(any(), anyString());
    }

    @Test
    void pauseFailureIsReportedSoTheQueueRetries() {
        doReturn(gost("节点不在线")).when(service).pauseOnNode(anyLong(), anyString());
        assertNotEquals(0, service.keepPausedAfterPush(forward, tunnel, NAME, R.ok()).getCode());

        doReturn(gost("OK")).when(service).pauseOnNode(anyLong(), anyString());
        doReturn(gost("节点不在线")).when(service).pauseRemoteOnNode(anyLong(), anyString());
        assertNotEquals(0, service.keepPausedAfterPush(forward, tunnel, NAME, R.ok()).getCode());
    }

    @Test
    void failedPushKeepsTheRulePausedAndSendsNoPause() {
        forward.setStatus(-1); // 模拟 updateGostServices 失败时改成的异常状态

        R result = service.keepPausedAfterPush(forward, tunnel, NAME, R.err("节点不在线"));

        assertEquals("节点不在线", result.getMsg());
        assertEquals(0, forward.getStatus());
        verify(service).restorePausedStatus(7L);
        verify(service, never()).pauseOnNode(any(), anyString());
    }

    /** 走真实的 retrySyncForward：节点未连接时推送失败，暂停的规则要还原，不能停留在异常状态 */
    private R retryWithOfflineNodes() {
        TunnelResolver resolver = mock(TunnelResolver.class);
        NodeService nodeService = mock(NodeService.class);
        Node node = new Node();
        node.setId(10L);
        when(nodeService.getNodeById(any())).thenReturn(node);
        when(resolver.resolveTunnel(forward)).thenReturn(tunnel);
        ReflectionTestUtils.setField(service, "tunnelResolver", resolver);
        ReflectionTestUtils.setField(service, "nodeService", nodeService);
        doReturn(forward).when(service).getById(7L);
        doReturn(true).when(service).updateById(any(Forward.class));
        return service.retrySyncForward(7L);
    }

    @Test
    void retryOfPausedRuleWithOfflineNodeStaysPaused() {
        R result = retryWithOfflineNodes();

        assertNotEquals(0, result.getCode());
        assertEquals(0, forward.getStatus());
        verify(service).restorePausedStatus(7L);
    }

    @Test
    void retryOfRunningRuleDoesNotTouchPauseHandling() {
        forward.setStatus(1);

        R result = retryWithOfflineNodes();

        assertNotEquals(0, result.getCode());
        verify(service, never()).restorePausedStatus(anyLong());
        verify(service, never()).pauseOnNode(any(), anyString());
    }
}
