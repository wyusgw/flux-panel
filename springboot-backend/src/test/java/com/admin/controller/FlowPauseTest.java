package com.admin.controller;

import com.admin.common.utils.TunnelResolver;
import com.admin.entity.Forward;
import com.admin.entity.Tunnel;
import com.admin.entity.UserTunnel;
import com.admin.service.ForwardService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FlowPauseTest {

    private FlowController controller;
    private TunnelResolver resolver;
    private ForwardService forwardService;
    private Tunnel tunnel;

    @BeforeEach
    void setUp() {
        controller = spy(new FlowController());
        resolver = mock(TunnelResolver.class);
        forwardService = mock(ForwardService.class);
        controller.tunnelResolver = resolver;
        controller.forwardService = forwardService;
        tunnel = new Tunnel();
        tunnel.setInNodeId(10L);
        when(resolver.resolveTunnel(any(Forward.class))).thenReturn(tunnel);
        when(resolver.buildServiceName(any(), any(), any())).thenCallRealMethod();
        doNothing().when(controller).pauseOnNodes(any(), anyString());
    }

    private Forward forward(long id, int status) {
        Forward forward = new Forward();
        forward.setId(id);
        forward.setName("rule-" + id); // Forward 的 equals 不含父类的 id，靠名称区分，否则下面按规则打桩会串
        forward.setUserId(5);
        forward.setStatus(status);
        return forward;
    }

    private UserTunnel userTunnel(int id) {
        UserTunnel userTunnel = new UserTunnel();
        userTunnel.setId(id);
        return userTunnel;
    }

    @Test
    void everyRuleIsPausedWithItsOwnServiceName() {
        Forward reported = forward(1L, 1);
        Forward deviceGroupRule = forward(2L, 1);
        Forward tunnelRule = forward(3L, 1);
        Forward adminStyleRule = forward(4L, 1);
        when(resolver.resolveUserTunnel(5, deviceGroupRule)).thenReturn(userTunnel(-1));
        when(resolver.resolveUserTunnel(5, tunnelRule)).thenReturn(userTunnel(77));

        controller.pauseService(Arrays.asList(reported, deviceGroupRule, tunnelRule, adminStyleRule), "1_5_-1");

        verify(controller).pauseOnNodes(tunnel, "1_5_-1");
        verify(controller).pauseOnNodes(tunnel, "2_5_-1");
        verify(controller).pauseOnNodes(tunnel, "3_5_77");
        verify(controller).pauseOnNodes(tunnel, "4_5_0");
        verify(forwardService, times(4)).update(eq(null), any());
    }

    @Test
    void alreadyPausedRuleIsSkippedUnlessItIsStillReportingTraffic() {
        Forward stillRunning = forward(1L, 0);
        Forward paused = forward(2L, 0);

        controller.pauseService(Arrays.asList(stillRunning, paused), "1_5_-1");

        verify(controller).pauseOnNodes(tunnel, "1_5_-1");
        verify(controller, never()).pauseOnNodes(tunnel, "2_5_0");
        verify(forwardService, times(1)).update(eq(null), any());
    }

    @Test
    void reportedNameMustMatchTheWholeRuleId() {
        // 规则 1 上报时不能把规则 12 当成自己
        assertTrue(FlowController.shouldPause(forward(1L, 0), "1_5_-1"));
        assertFalse(FlowController.shouldPause(forward(12L, 0), "1_5_-1"));
    }

    @Test
    void errorStatusRuleIsStillPaused() {
        assertTrue(FlowController.shouldPause(forward(2L, -1), "1_5_-1"));
    }

    @Test
    void ruleWithoutTunnelIsMarkedPausedWithoutCallingNodes() {
        when(resolver.resolveTunnel(any(Forward.class))).thenReturn(null);

        controller.pauseService(Collections.singletonList(forward(2L, 1)), "1_5_-1");

        verify(controller, never()).pauseOnNodes(any(), anyString());
        verify(forwardService).update(eq(null), any());
    }
}
