package com.admin.common.utils;

import com.admin.entity.DeviceGroup;
import com.admin.entity.Node;
import com.admin.entity.Tunnel;
import com.admin.service.DeviceGroupService;
import com.admin.service.NodeService;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ExitFailoverTest {

    // ---------- 列表与字符串互转 ----------

    @Test
    void joinAndParseRoundTrip() {
        assertEquals("3,5", ExitFailover.join(Arrays.asList(3L, 5L)));
        assertNull(ExitFailover.join(null));
        assertNull(ExitFailover.join(Collections.emptyList()));
        assertEquals(Arrays.asList(3L, 5L), ExitFailover.parse("3, 5,x,,3"));
        assertTrue(ExitFailover.parse(null).isEmpty());
        assertTrue(ExitFailover.parse("  ").isEmpty());
    }

    @Test
    void allOutNodesPutPrimaryFirstAndSkipDuplicates() {
        Tunnel t = new Tunnel();
        assertTrue(ExitFailover.allOutNodeIds(t).isEmpty());
        t.setOutNodeId(10L);
        t.setOutIp("1.1.1.1");
        assertEquals(Collections.singletonList(10L), ExitFailover.allOutNodeIds(t));
        t.setBackupOutNodeIds(Arrays.asList(20L, 10L, 30L));
        t.setBackupOutIps(Arrays.asList("2.2.2.2", "3.3.3.3"));
        assertEquals(Arrays.asList(10L, 20L, 30L), ExitFailover.allOutNodeIds(t));
        assertEquals(Arrays.asList("1.1.1.1", "2.2.2.2", "3.3.3.3"), ExitFailover.allOutIps(t));
    }

    // ---------- 链配置 ----------

    @Test
    void singleExitChainIsUnchangedFromBefore() {
        JSONObject chain = GostUtil.buildChain("7_1_-1", Collections.singletonList("1.1.1.1:2000"), "tls", null);
        assertEquals("7_1_-1_chains", chain.getString("name"));
        JSONObject hop = chain.getJSONArray("hops").getJSONObject(0);
        assertFalse(hop.containsKey("selector"));
        JSONArray nodes = hop.getJSONArray("nodes");
        assertEquals(1, nodes.size());
        assertEquals("node-7_1_-1", nodes.getJSONObject(0).getString("name"));
        assertEquals("1.1.1.1:2000", nodes.getJSONObject(0).getString("addr"));
        assertEquals("tls", nodes.getJSONObject(0).getJSONObject("dialer").getString("type"));
        assertEquals("relay", nodes.getJSONObject(0).getJSONObject("connector").getString("type"));
    }

    @Test
    void backupExitsAreFifoWithNumericFailTimeout() {
        JSONObject chain = GostUtil.buildChain("7_1_-1", Arrays.asList("1.1.1.1:2000", "2.2.2.2:2000", "[::1]:2000"), "tls", "eth0");
        JSONObject hop = chain.getJSONArray("hops").getJSONObject(0);
        JSONArray nodes = hop.getJSONArray("nodes");
        assertEquals(3, nodes.size());
        assertEquals("node-7_1_-1", nodes.getJSONObject(0).getString("name"));
        assertEquals("node-7_1_-1-b1", nodes.getJSONObject(1).getString("name"));
        assertEquals("node-7_1_-1-b2", nodes.getJSONObject(2).getString("name"));
        assertEquals("1.1.1.1:2000", nodes.getJSONObject(0).getString("addr"));
        assertEquals("2.2.2.2:2000", nodes.getJSONObject(1).getString("addr"));
        assertEquals("eth0", nodes.getJSONObject(2).getString("interface"));

        JSONObject selector = hop.getJSONObject("selector");
        assertEquals("fifo", selector.getString("strategy"));
        assertEquals(1, selector.getIntValue("maxFails"));
        // 链配置不经过节点端的时长预处理，failTimeout 必须是数字（纳秒），写成 "30s" 节点解析会失败
        Object failTimeout = selector.get("failTimeout");
        assertTrue(failTimeout instanceof Number);
        assertEquals(30_000_000_000L, ((Number) failTimeout).longValue());
    }

    @Test
    void tunnelHandlerRetriesOncePerBackupExit() {
        JSONObject none = GostUtil.createHandler("tcp", "7_1_-1", 2, null, 0);
        assertEquals("7_1_-1_chains", none.getString("chain"));
        assertFalse(none.containsKey("retries"));

        JSONObject two = GostUtil.createHandler("tcp", "7_1_-1", 2, null, 2);
        assertEquals(2, two.getIntValue("retries"));

        // 端口转发（不经过出口）不加 retries
        JSONObject direct = GostUtil.createHandler("tcp", "7_1_-1", 1, null, 2);
        assertFalse(direct.containsKey("chain"));
        assertFalse(direct.containsKey("retries"));
    }

    // ---------- 备用出口解析 ----------

    private DeviceGroup group(Long id, String direction, Long nodeId, Long failover) {
        DeviceGroup g = new DeviceGroup();
        g.setId(id);
        g.setDirection(direction);
        g.setNodeId(nodeId);
        g.setFailoverGroupId(failover);
        return g;
    }

    private TunnelResolver resolver(DeviceGroup... groups) {
        TunnelResolver r = new TunnelResolver();
        DeviceGroupService dg = mock(DeviceGroupService.class);
        NodeService ns = mock(NodeService.class);
        for (DeviceGroup g : groups) {
            when(dg.getById(g.getId())).thenReturn(g);
        }
        when(ns.getById(anyLong())).thenAnswer(inv -> {
            Node n = new Node();
            n.setId(inv.getArgument(0));
            n.setServerIp("10.0.0." + inv.getArgument(0));
            return n;
        });
        ReflectionTestUtils.setField(r, "deviceGroupService", dg);
        ReflectionTestUtils.setField(r, "nodeService", ns);
        return r;
    }

    private List<Long> backups(TunnelResolver r, DeviceGroup primary, Long inNodeId) {
        return r.resolveBackupNodeIds(primary, inNodeId, primary.getNodeId());
    }

    @Test
    void noFailoverMeansNoBackups() {
        DeviceGroup a = group(1L, "outbound", 11L, null);
        assertTrue(backups(resolver(a), a, 99L).isEmpty());
        a.setFailoverGroupId(0L);
        assertTrue(backups(resolver(a), a, 99L).isEmpty());
    }

    @Test
    void followsFailoverChainInOrderUpToTheLimit() {
        DeviceGroup a = group(1L, "outbound", 11L, 2L);
        DeviceGroup b = group(2L, "both", 12L, 3L);
        DeviceGroup c = group(3L, "outbound", 13L, 4L);
        DeviceGroup d = group(4L, "outbound", 14L, 5L);
        DeviceGroup e = group(5L, "outbound", 15L, null);
        assertEquals(Arrays.asList(12L, 13L, 14L), backups(resolver(a, b, c, d, e), a, 99L));
    }

    @Test
    void stopsAtCycleMissingWrongTypeAndSameNode() {
        // 循环：a -> b -> a
        DeviceGroup a = group(1L, "outbound", 11L, 2L);
        DeviceGroup b = group(2L, "outbound", 12L, 1L);
        assertEquals(Collections.singletonList(12L), backups(resolver(a, b), a, 99L));

        // 备用出口设备组已被删除
        DeviceGroup a2 = group(1L, "outbound", 11L, 9L);
        assertTrue(backups(resolver(a2), a2, 99L).isEmpty());

        // 备用不是出口类型
        DeviceGroup a3 = group(1L, "outbound", 11L, 2L);
        DeviceGroup inbound = group(2L, "inbound", 12L, null);
        assertTrue(backups(resolver(a3, inbound), a3, 99L).isEmpty());

        // 备用与主出口同一个节点，或与入口同一个节点
        DeviceGroup a4 = group(1L, "outbound", 11L, 2L);
        DeviceGroup sameNode = group(2L, "outbound", 11L, null);
        assertTrue(backups(resolver(a4, sameNode), a4, 99L).isEmpty());
        DeviceGroup a5 = group(1L, "outbound", 11L, 2L);
        DeviceGroup onInNode = group(2L, "outbound", 99L, null);
        assertTrue(backups(resolver(a5, onInNode), a5, 99L).isEmpty());
    }
}
