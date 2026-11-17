package com.admin.common.utils;

import com.admin.common.dto.ChainExitHop;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ChainExitTest {

    private static final String NAME = "7_5_-1";

    private List<ChainExitHop> threeHops() {
        return new ArrayList<>(Arrays.asList(
                new ChainExitHop(21L, 1L, 30001, "tls", "203.0.113.1"),
                new ChainExitHop(22L, 2L, 30002, "mwss", "2001:db8::2"),
                new ChainExitHop(23L, 3L, 30003, "tcp", "203.0.113.3")));
    }

    @Test
    void muxSwitchesToTheMultiplexedProtocolAndBlankMeansTls() {
        assertEquals("tls", ChainExit.effectiveProtocol(null, false));
        assertEquals("tls", ChainExit.effectiveProtocol("  ", false));
        assertEquals("mtls", ChainExit.effectiveProtocol("", true));
        assertEquals("mwss", ChainExit.effectiveProtocol("wss", true));
        assertEquals("mtcp", ChainExit.effectiveProtocol("tcp", true));
        // 已经是复用协议、或没有复用版本的协议不变
        assertEquals("mtls", ChainExit.effectiveProtocol("mtls", true));
        assertEquals("quic", ChainExit.effectiveProtocol("quic", true));
        assertEquals("wss", ChainExit.effectiveProtocol("wss", false));
    }

    @Test
    void firstHopKeepsTheNormalExitNamesAndLaterHopsAreNumbered() {
        assertEquals(NAME, ChainExit.hopServiceBase(NAME, 0));
        assertEquals(NAME + "_h2", ChainExit.hopServiceBase(NAME, 1));
        assertEquals(NAME + "_h3", ChainExit.hopServiceBase(NAME, 2));
        assertEquals(NAME + "_h1", ChainExit.hopChainBase(NAME, 0));
        assertEquals(NAME + "_h2", ChainExit.hopChainBase(NAME, 1));
    }

    @Test
    void intermediateHopRelaysThroughItsChainToTheNextHop() {
        List<ChainExitHop> hops = threeHops();

        ChainExit.HopService first = ChainExit.hopService(NAME, 0, hops, "1.1.1.1:80,2.2.2.2:80", "round", "2,1", "eth1");
        JSONObject service = ChainExit.buildHopService(first);
        assertEquals(NAME + "_tls", service.getString("name"));
        assertEquals(":30001", service.getString("addr"));
        assertEquals("relay", service.getJSONObject("handler").getString("type"));
        assertEquals(NAME + "_h1_chains", service.getJSONObject("handler").getString("chain"));
        // 第 1 跳用自己的协议监听（入口按同一协议连过来）
        assertEquals("tls", service.getJSONObject("listener").getString("type"));
        // 中间跳只放一个名义目标，不带负载策略的权重和出口网卡
        JSONArray nodes = service.getJSONObject("forwarder").getJSONArray("nodes");
        assertEquals(1, nodes.size());
        assertEquals("1.1.1.1:80", nodes.getJSONObject(0).getString("addr"));
        assertFalse(service.containsKey("metadata"));

        JSONObject chain = ChainExit.buildHopChain(ChainExit.hopChain(NAME, 0, hops));
        assertEquals(NAME + "_h1_chains", chain.getString("name"));
        JSONObject chainNode = chain.getJSONArray("hops").getJSONObject(0).getJSONArray("nodes").getJSONObject(0);
        // 连下一跳：IPv6 加方括号、用下一跳的端口和协议、relay 连接器
        assertEquals("[2001:db8::2]:30002", chainNode.getString("addr"));
        assertEquals("mwss", chainNode.getJSONObject("dialer").getString("type"));
        assertEquals("relay", chainNode.getJSONObject("connector").getString("type"));
    }

    @Test
    void lastHopForwardsToTheRealTargetsWithStrategyWeightsAndInterface() {
        List<ChainExitHop> hops = threeHops();

        ChainExit.HopService last = ChainExit.hopService(NAME, 2, hops, "1.1.1.1:80,2.2.2.2:80", "round", "2,1", "eth1");
        JSONObject service = ChainExit.buildHopService(last);
        assertEquals(NAME + "_h3_tls", service.getString("name"));
        assertEquals(":30003", service.getString("addr"));
        assertFalse(service.getJSONObject("handler").containsKey("chain"));
        assertEquals("tcp", service.getJSONObject("listener").getString("type"));
        JSONObject forwarder = service.getJSONObject("forwarder");
        assertEquals(2, forwarder.getJSONArray("nodes").size());
        assertEquals("round", forwarder.getJSONObject("selector").getString("strategy"));
        assertEquals(2, forwarder.getJSONArray("nodes").getJSONObject(0).getJSONObject("metadata").getIntValue("weight"));
        assertEquals("eth1", service.getJSONObject("metadata").getString("interface"));

        assertNull(ChainExit.hopChain(NAME, 2, hops));
    }

    @Test
    void singleHopChainIsJustAnExitWithItsOwnProtocol() {
        List<ChainExitHop> hops = new ArrayList<>(Arrays.asList(new ChainExitHop(21L, 1L, 30001, "mtls", "203.0.113.1")));
        JSONObject service = ChainExit.buildHopService(ChainExit.hopService(NAME, 0, hops, "1.1.1.1:80", null, null, null));
        assertEquals(NAME + "_tls", service.getString("name"));
        assertFalse(service.getJSONObject("handler").containsKey("chain"));
        assertEquals("mtls", service.getJSONObject("listener").getString("type"));
        assertNull(ChainExit.hopChain(NAME, 0, hops));
    }

    @Test
    void normalExitServiceHasNoChain() {
        JSONObject service = GostUtil.buildRemoteService(NAME, 2000, "1.1.1.1:80", "tls", null, null, null, null);
        assertFalse(service.getJSONObject("handler").containsKey("chain"));
        assertEquals(NAME + "_tls", service.getString("name"));
    }

    @Test
    void recordedPathRoundTripsWithoutTheAddress() {
        String json = ChainExit.serialize(threeHops());
        assertFalse(json.contains("203.0.113.1"));
        List<ChainExitHop> parsed = ChainExit.parse(json);
        assertEquals(3, parsed.size());
        assertEquals(22L, parsed.get(1).getNodeId());
        assertEquals(2L, parsed.get(1).getGroupId());
        assertEquals(30002, parsed.get(1).getPort());
        assertEquals("mwss", parsed.get(1).getProtocol());
        assertNull(parsed.get(1).getIp());

        assertNull(ChainExit.serialize(null));
        assertNull(ChainExit.serialize(new ArrayList<>()));
        assertTrue(ChainExit.parse(null).isEmpty());
        assertTrue(ChainExit.parse("").isEmpty());
        assertTrue(ChainExit.parse("not json").isEmpty());
        // 缺端口的记录不可信，按没有记录处理
        assertTrue(ChainExit.parse("[{\"nodeId\":1,\"protocol\":\"tls\"}]").isEmpty());
    }

    @Test
    void topologyIgnoresPortsButNotNodesOrProtocols() {
        List<ChainExitHop> a = threeHops();
        List<ChainExitHop> b = ChainExit.copy(a);
        b.get(0).setPort(40000);
        assertEquals(ChainExit.topologyKey(a), ChainExit.topologyKey(b));
        b.get(1).setProtocol("wss");
        assertFalse(ChainExit.topologyKey(a).equals(ChainExit.topologyKey(b)));
        assertEquals("", ChainExit.topologyKey(null));
        assertEquals(Arrays.asList(21L, 22L, 23L), ChainExit.nodeIds(a));
    }
}
