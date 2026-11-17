package com.admin.service.impl;

import com.admin.common.dto.ChainExitHop;
import com.admin.common.dto.GostDto;
import com.admin.common.lang.R;
import com.admin.common.utils.ChainExit;
import com.admin.entity.Forward;
import com.admin.entity.Node;
import com.admin.entity.Tunnel;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class ForwardChainExitTest {

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
        forward.setStatus(1);
        forward.setRemoteAddr("1.1.1.1:80");
        tunnel = new Tunnel();
        tunnel.setType(2);
        tunnel.setStatus(1);
        tunnel.setInNodeId(10L);
        tunnel.setChainHops(new ArrayList<>(Arrays.asList(
                new ChainExitHop(21L, 1L, 30001, "tls", "203.0.113.1"),
                new ChainExitHop(22L, 2L, 30002, "mtls", "203.0.113.2"),
                new ChainExitHop(23L, 3L, 30003, "tcp", "203.0.113.3"))));
        tunnel.setOutNodeId(21L);
        tunnel.setOutIp("203.0.113.1");
        tunnel.setProtocol("tls");
        doNothing().when(service).restorePausedStatus(anyLong());
    }

    private GostDto gost(String msg) {
        GostDto dto = new GostDto();
        dto.setMsg(msg);
        return dto;
    }

    private Node node(long id, int sta, int end) {
        Node n = new Node();
        n.setId(id);
        n.setPortSta(sta);
        n.setPortEnd(end);
        return n;
    }

    @Test
    void hopsArePushedFromTheLastToTheFirstWithEachChainBeforeItsService() {
        doReturn(gost("OK")).when(service).pushHopChain(anyLong(), any(), anyBoolean());
        doReturn(gost("OK")).when(service).pushHopService(anyLong(), any(), anyBoolean());

        assertEquals(0, service.pushChainHops(NAME, forward, tunnel, false).getCode());

        ArgumentCaptor<ChainExit.HopService> services = ArgumentCaptor.forClass(ChainExit.HopService.class);
        ArgumentCaptor<ChainExit.HopChain> chains = ArgumentCaptor.forClass(ChainExit.HopChain.class);
        var order = inOrder(service);
        order.verify(service).pushHopService(eq(23L), services.capture(), eq(false));
        order.verify(service).pushHopChain(eq(22L), chains.capture(), eq(false));
        order.verify(service).pushHopService(eq(22L), services.capture(), eq(false));
        order.verify(service).pushHopChain(eq(21L), chains.capture(), eq(false));
        order.verify(service).pushHopService(eq(21L), services.capture(), eq(false));
        // 最后一跳没有链
        verify(service, never()).pushHopChain(eq(23L), any(), anyBoolean());

        assertEquals(NAME + "_h3", services.getAllValues().get(0).base);
        assertNull(services.getAllValues().get(0).chain);
        assertEquals(NAME + "_h2", services.getAllValues().get(1).base);
        assertEquals(NAME + "_h2_chains", services.getAllValues().get(1).chain);
        assertEquals(NAME, services.getAllValues().get(2).base);
        assertEquals(NAME + "_h1_chains", services.getAllValues().get(2).chain);
        assertEquals("203.0.113.3:30003", chains.getAllValues().get(0).nextAddress);
        assertEquals("tcp", chains.getAllValues().get(0).protocol);
        assertEquals("203.0.113.2:30002", chains.getAllValues().get(1).nextAddress);
        assertEquals("mtls", chains.getAllValues().get(1).protocol);
    }

    @Test
    void aHopThatFailsStopsThePushAndKeepsTheNodeMessageForTheOfflineCheck() {
        doReturn(gost("OK")).when(service).pushHopService(eq(23L), any(), anyBoolean());
        doReturn(gost("节点不在线")).when(service).pushHopChain(eq(22L), any(), anyBoolean());

        R result = service.pushChainHops(NAME, forward, tunnel, true);

        assertEquals(-1, result.getCode());
        assertTrue(result.getMsg().contains("第 2 跳"));
        assertTrue(result.getMsg().contains("不在线"));
        verify(service, never()).pushHopService(eq(22L), any(), anyBoolean());
        verify(service, never()).pushHopService(eq(21L), any(), anyBoolean());
    }

    @Test
    void aDeletedHopNodeIsReportedInsteadOfPushingAnEmptyAddress() {
        tunnel.getChainHops().get(1).setIp(null);
        doReturn(gost("OK")).when(service).pushHopService(anyLong(), any(), anyBoolean());
        doReturn(gost("OK")).when(service).pushHopChain(anyLong(), any(), anyBoolean());

        R result = service.pushChainHops(NAME, forward, tunnel, false);

        assertEquals(-1, result.getCode());
        assertTrue(result.getMsg().contains("第 2 跳的节点不存在"));
    }

    @Test
    void pausedChainRuleIsPausedAgainOnEveryHop() {
        doReturn(gost("OK")).when(service).pauseOnNode(anyLong(), anyString());
        doReturn(gost("OK")).when(service).pauseRemoteOnNode(anyLong(), anyString());

        assertEquals(0, service.keepPausedAfterPush(forward, tunnel, NAME, R.ok()).getCode());

        var order = inOrder(service);
        order.verify(service).pauseOnNode(10L, NAME);
        order.verify(service).pauseRemoteOnNode(21L, NAME);
        order.verify(service).pauseRemoteOnNode(22L, NAME + "_h2");
        order.verify(service).pauseRemoteOnNode(23L, NAME + "_h3");
    }

    @Test
    void laterHopServicesListOnlyHopsAfterTheFirst() {
        List<Map.Entry<Long, String>> later = ForwardServiceImpl.chainHopServicesAfterFirst(tunnel, NAME);
        assertEquals(2, later.size());
        assertEquals(22L, later.get(0).getKey());
        assertEquals(NAME + "_h2", later.get(0).getValue());
        assertEquals(23L, later.get(1).getKey());

        Tunnel normal = new Tunnel();
        normal.setType(2);
        normal.setOutNodeId(20L);
        assertTrue(ForwardServiceImpl.chainHopServicesAfterFirst(normal, NAME).isEmpty());
    }

    @Test
    void hopPortsAreFreeOnEachNodeAndNeverClashWithinTheSameRule() {
        // 第 1 跳和入口是同一个节点，第 2、3 跳也是同一个节点
        List<ChainExitHop> hops = new ArrayList<>(Arrays.asList(
                new ChainExitHop(10L, 1L, null, "tls", "a"),
                new ChainExitHop(22L, 2L, null, "tls", "b"),
                new ChainExitHop(22L, 2L, null, "tls", "b")));
        Map<Long, Node> nodes = new HashMap<>();
        nodes.put(10L, node(10, 1000, 1010));
        nodes.put(22L, node(22, 2000, 2010));
        Map<Long, Set<Integer>> used = new HashMap<>();
        used.put(10L, new HashSet<>(Arrays.asList(1000, 1002)));
        used.put(22L, new HashSet<>(Collections.singletonList(2000)));

        String error = ForwardServiceImpl.assignChainHopPorts(hops, 10L, 1001, nodes::get, id -> used.getOrDefault(id, Collections.emptySet()));

        assertNull(error);
        assertEquals(1003, hops.get(0).getPort()); // 1000、1002 被别的规则占用，1001 是这条规则的入口端口
        assertEquals(2001, hops.get(1).getPort());
        assertEquals(2002, hops.get(2).getPort());
    }

    @Test
    void hopPortAllocationReportsWhichHopIsFullOrMissing() {
        List<ChainExitHop> hops = new ArrayList<>(Arrays.asList(
                new ChainExitHop(21L, 1L, null, "tls", "a"),
                new ChainExitHop(22L, 2L, null, "tls", "b")));
        Map<Long, Node> nodes = new HashMap<>();
        nodes.put(21L, node(21, 3000, 3000));
        nodes.put(22L, node(22, 4000, 4000));
        Map<Long, Set<Integer>> used = new HashMap<>();
        used.put(22L, new HashSet<>(Collections.singletonList(4000)));

        String full = ForwardServiceImpl.assignChainHopPorts(hops, 10L, 1000, nodes::get, id -> used.getOrDefault(id, Collections.emptySet()));
        assertTrue(full.contains("第 2 跳的端口已满"));

        nodes.remove(21L);
        String missing = ForwardServiceImpl.assignChainHopPorts(hops, 10L, 1000, nodes::get, id -> Collections.emptySet());
        assertTrue(missing.contains("第 1 跳的节点不存在"));
    }

    @Test
    void chainPathChangeIsDetectedFromNodesAndProtocolsButNotPorts() {
        forward.setChainHops(ChainExit.serialize(tunnel.getChainHops()));
        Tunnel current = new Tunnel();
        current.setChainHops(ChainExit.copy(tunnel.getChainHops()));
        for (ChainExitHop hop : current.getChainHops()) {
            hop.setPort(null);
        }
        assertFalse(ForwardServiceImpl.isChainPathChanged(forward, current));

        current.getChainHops().get(2).setNodeId(24L);
        assertTrue(ForwardServiceImpl.isChainPathChanged(forward, current));

        // 从链式出口换成普通出口 / 普通规则从来没有链
        assertTrue(ForwardServiceImpl.isChainPathChanged(forward, new Tunnel()));
        forward.setChainHops(null);
        assertFalse(ForwardServiceImpl.isChainPathChanged(forward, new Tunnel()));

        // 显式隧道的规则不看链式出口
        forward.setTunnelId(3);
        assertFalse(ForwardServiceImpl.isChainPathChanged(forward, current));
    }

    @Test
    void unchangedPathKeepsTheDeployedPorts() {
        forward.setChainHops(ChainExit.serialize(tunnel.getChainHops()));
        Tunnel current = new Tunnel();
        current.setChainHops(ChainExit.copy(tunnel.getChainHops()));
        for (ChainExitHop hop : current.getChainHops()) {
            hop.setPort(null);
        }

        ForwardServiceImpl.keepDeployedChainPorts(current, forward);

        assertEquals(30001, current.getChainHops().get(0).getPort());
        assertEquals(30003, current.getChainHops().get(2).getPort());

        current.getChainHops().remove(2);
        assertThrows(RuntimeException.class, () -> ForwardServiceImpl.keepDeployedChainPorts(current, forward));
    }

    @Test
    void theLastHopIsTheNodeThatConnectsToTheTarget() {
        assertEquals(23L, ForwardServiceImpl.targetDialNodeId(tunnel));

        Tunnel normal = new Tunnel();
        normal.setType(2);
        normal.setInNodeId(10L);
        normal.setOutNodeId(20L);
        assertEquals(20L, ForwardServiceImpl.targetDialNodeId(normal));
        normal.setType(1);
        assertEquals(10L, ForwardServiceImpl.targetDialNodeId(normal));
    }

    @Test
    void normalRulesAreUntouchedByTheChainPortHelper() {
        Tunnel normal = new Tunnel();
        normal.setType(2);
        ForwardServiceImpl.keepDeployedChainPorts(normal, forward);
        assertNull(normal.getChainHops());
        verify(service, times(0)).pushHopService(anyLong(), any(), anyBoolean());
    }
}
