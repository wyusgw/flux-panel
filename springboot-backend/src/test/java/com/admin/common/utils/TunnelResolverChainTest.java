package com.admin.common.utils;

import com.admin.common.dto.ChainExitHop;
import com.admin.entity.DeviceGroup;
import com.admin.entity.DeviceGroupChainHop;
import com.admin.entity.Forward;
import com.admin.entity.Node;
import com.admin.entity.Tunnel;
import com.admin.mapper.DeviceGroupChainHopMapper;
import com.admin.service.DeviceGroupService;
import com.admin.service.NodeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TunnelResolverChainTest {

    private TunnelResolver resolver;
    private DeviceGroupService groups;
    private NodeService nodes;
    private DeviceGroupChainHopMapper hopMapper;
    private final List<DeviceGroupChainHop> configured = new ArrayList<>();

    @BeforeEach
    void setUp() {
        resolver = new TunnelResolver();
        groups = mock(DeviceGroupService.class);
        nodes = mock(NodeService.class);
        hopMapper = mock(DeviceGroupChainHopMapper.class);
        ReflectionTestUtils.setField(resolver, "deviceGroupService", groups);
        ReflectionTestUtils.setField(resolver, "nodeService", nodes);
        ReflectionTestUtils.setField(resolver, "chainHopMapper", hopMapper);
        when(hopMapper.selectList(any())).thenReturn(configured);

        group(1L, "inbound", 10L, null);
        group(9L, "chain", null, null);
        group(2L, "outbound", 21L, "tls");
        group(3L, "outbound", 22L, "wss");
        node(10L, "198.51.100.10");
        node(21L, "203.0.113.1");
        node(22L, "203.0.113.2");
        hop(2L, 0);
        hop(3L, 1);
    }

    private DeviceGroup group(Long id, String direction, Long nodeId, String protocol) {
        DeviceGroup g = new DeviceGroup();
        g.setId(id);
        g.setName("g" + id);
        g.setDirection(direction);
        g.setNodeId(nodeId);
        g.setProtocol(protocol);
        when(groups.getById(id)).thenReturn(g);
        return g;
    }

    private Node node(Long id, String serverIp) {
        Node n = new Node();
        n.setId(id);
        n.setIp(serverIp);
        n.setServerIp(serverIp);
        when(nodes.getById(id)).thenReturn(n);
        return n;
    }

    private void hop(Long target, int mux) {
        DeviceGroupChainHop h = new DeviceGroupChainHop();
        h.setDeviceGroupId(9L);
        h.setHopOrder(configured.size() + 1);
        h.setTargetDeviceGroupId(target);
        h.setMux(mux);
        configured.add(h);
    }

    @Test
    void chainExitResolvesToATunnelWhoseExitIsTheFirstHop() {
        Tunnel tunnel = resolver.buildSyntheticTunnel(1L, 9L);

        assertNotNull(tunnel);
        assertEquals(2, tunnel.getType());
        assertEquals(10L, tunnel.getInNodeId());
        assertEquals(21L, tunnel.getOutNodeId());
        assertEquals("203.0.113.1", tunnel.getOutIp());
        assertEquals("tls", tunnel.getProtocol());
        assertTrue(tunnel.getBackupOutNodeIds().isEmpty());
        List<ChainExitHop> hops = tunnel.getChainHops();
        assertEquals(2, hops.size());
        assertEquals(22L, hops.get(1).getNodeId());
        assertEquals(3L, hops.get(1).getGroupId());
        assertEquals("mwss", hops.get(1).getProtocol()); // 第 2 跳开了 Mux
        assertNull(hops.get(1).getPort());
    }

    @Test
    void brokenHopsAreExplainedAndCannotBeResolved() {
        assertNull(resolver.chainExitError(groups.getById(9L)));

        group(3L, "inbound", 22L, "tls");
        String notExit = resolver.chainExitError(groups.getById(9L));
        assertTrue(notExit.contains("第 2 跳") && notExit.contains("不是出口设备组"));
        assertNull(resolver.buildSyntheticTunnel(1L, 9L));

        group(3L, "outbound", null, "tls");
        assertTrue(resolver.chainExitError(groups.getById(9L)).contains("没有绑定设备"));

        configured.clear();
        assertTrue(resolver.chainExitError(groups.getById(9L)).contains("还没有配置任何一跳"));
    }

    @Test
    void existingRuleUsesItsRecordedPathEvenAfterTheChainConfigChanged() {
        Forward forward = new Forward();
        forward.setInDeviceGroupId(1L);
        forward.setOutDeviceGroupId(9L);
        forward.setChainHops(ChainExit.serialize(Arrays.asList(
                new ChainExitHop(21L, 2L, 30001, "tls", null),
                new ChainExitHop(22L, 3L, 30002, "mwss", null))));
        // 链式出口之后被改坏（某一跳的设备组不再是出口）：已有规则仍按记录的路径删除 / 暂停
        group(3L, "inbound", 22L, "tls");

        Tunnel tunnel = resolver.resolveTunnel(forward);

        assertNotNull(tunnel);
        assertEquals(21L, tunnel.getOutNodeId());
        assertEquals(30002, tunnel.getChainHops().get(1).getPort());
        assertEquals("203.0.113.2", tunnel.getChainHops().get(1).getIp());
        assertEquals("mwss", tunnel.getChainHops().get(1).getProtocol());
    }

    @Test
    void normalExitIsUnchanged() {
        Tunnel tunnel = resolver.buildSyntheticTunnel(1L, 2L);
        assertNotNull(tunnel);
        assertEquals(21L, tunnel.getOutNodeId());
        assertNull(tunnel.getChainHops());
        assertEquals("tls", tunnel.getProtocol());
    }
}
