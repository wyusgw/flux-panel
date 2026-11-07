package com.admin.controller;

import com.admin.common.dto.FlowDto;
import com.admin.entity.Forward;
import com.admin.entity.Tunnel;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FlowReportTrustTest {

    private static final long IN_NODE = 10L;
    private static final long OUT_NODE = 20L;

    private Forward forward() {
        Forward forward = new Forward();
        forward.setUserId(5);
        return forward;
    }

    private Tunnel tunnel(Long outNode) {
        Tunnel tunnel = new Tunnel();
        tunnel.setInNodeId(IN_NODE);
        tunnel.setOutNodeId(outNode);
        return tunnel;
    }

    private FlowDto flow(Long up, Long down) {
        FlowDto flow = new FlowDto();
        flow.setU(up);
        flow.setD(down);
        return flow;
    }

    @Test
    void acceptsReportsFromTheEntryNode() {
        assertTrue(FlowController.isTrustedFlowReport(forward(), tunnel(OUT_NODE), "5", IN_NODE, flow(1L, 2L)));
        assertTrue(FlowController.isTrustedFlowReport(forward(), tunnel(OUT_NODE), "5", IN_NODE, flow(0L, 0L)));
        assertTrue(FlowController.isTrustedFlowReport(forward(), tunnel(null), "5", IN_NODE, flow(1L, 2L)));
    }

    @Test
    void rejectsNegativeOrMissingFlow() {
        assertFalse(FlowController.isTrustedFlowReport(forward(), tunnel(OUT_NODE), "5", IN_NODE, flow(-1L, 2L)));
        assertFalse(FlowController.isTrustedFlowReport(forward(), tunnel(OUT_NODE), "5", IN_NODE, flow(1L, -2L)));
        assertFalse(FlowController.isTrustedFlowReport(forward(), tunnel(OUT_NODE), "5", IN_NODE, flow(null, 2L)));
    }

    @Test
    void rejectsReportForAnotherUsersIdOnTheRule() {
        assertFalse(FlowController.isTrustedFlowReport(forward(), tunnel(OUT_NODE), "6", IN_NODE, flow(1L, 2L)));
    }

    @Test
    void rejectsReportFromNodeThatDoesNotCarryTheRule() {
        assertFalse(FlowController.isTrustedFlowReport(forward(), tunnel(OUT_NODE), "5", 99L, flow(1L, 2L)));
        assertFalse(FlowController.isTrustedFlowReport(forward(), tunnel(null), "5", 99L, flow(1L, 2L)));
    }

    @Test
    void rejectsReportFromExitNode() {
        // 出口节点的 _tls 服务不上报流量，收到就是伪造的
        assertFalse(FlowController.isTrustedFlowReport(forward(), tunnel(OUT_NODE), "5", OUT_NODE, flow(1L, 2L)));
    }

    @Test
    void strayReportIsOnlyAServiceOfThisRuleOnAnotherNode() {
        assertTrue(FlowController.isStrayReport(forward(), tunnel(OUT_NODE), "5", 99L));
        assertFalse(FlowController.isStrayReport(forward(), tunnel(OUT_NODE), "5", IN_NODE));
        assertFalse(FlowController.isStrayReport(forward(), tunnel(OUT_NODE), "6", 99L));
        assertFalse(FlowController.isStrayReport(null, tunnel(OUT_NODE), "5", 99L));
        assertFalse(FlowController.isStrayReport(forward(), null, "5", 99L));
    }

    @Test
    void rejectsUnknownRuleOrTunnel() {
        assertFalse(FlowController.isTrustedFlowReport(null, tunnel(OUT_NODE), "5", IN_NODE, flow(1L, 2L)));
        assertFalse(FlowController.isTrustedFlowReport(forward(), null, "5", IN_NODE, flow(1L, 2L)));
    }
}
