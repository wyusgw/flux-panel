package com.admin.common.utils;

import com.admin.entity.Node;
import org.junit.jupiter.api.Test;

import java.net.InetAddress;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NodeRegionLookupTest {

    private static InetAddress ip(String literal) {
        try {
            return InetAddress.getByName(literal);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private Node node(String serverIp, String entryIps) {
        Node node = new Node();
        node.setId(1L);
        node.setServerIp(serverIp);
        node.setIp(entryIps);
        return node;
    }

    private NodeRegionLookup lookup(Map<String, String> countries, Map<String, List<InetAddress>> dns, AtomicInteger calls) {
        NodeRegionLookup lookup = new NodeRegionLookup();
        lookup.countryFetcher = address -> {
            calls.incrementAndGet();
            return countries.get(address);
        };
        lookup.resolver = host -> dns.getOrDefault(host, Collections.emptyList());
        return lookup;
    }

    @Test
    void candidatesKeepServerAddressFirstAndStripBrackets() {
        assertEquals(Arrays.asList("1.1.1.1", "2001:db8::1", "a.example.com"),
                NodeRegionLookup.candidateHosts(" 1.1.1.1 ", "[2001:db8::1], ,a.example.com,1.1.1.1"));
        assertEquals(Collections.singletonList("a.example.com"), NodeRegionLookup.candidateHosts(null, "a.example.com"));
    }

    @Test
    void onlyPublicAddressesAreLookedUp() {
        for (String privateIp : new String[]{"10.0.0.1", "192.168.1.1", "172.16.0.1", "127.0.0.1", "100.64.0.1", "169.254.1.1", "fd00::1", "fe80::1", "::1"}) {
            assertFalse(NodeRegionLookup.isPublic(ip(privateIp)), privateIp);
        }
        assertTrue(NodeRegionLookup.isPublic(ip("8.8.8.8")));
        assertTrue(NodeRegionLookup.isPublic(ip("2606:4700::1111")));
    }

    @Test
    void ipv4AndIpv6RegionsComeFromTheFirstPublicAddressOfEachFamily() {
        Map<String, String> countries = new HashMap<>();
        countries.put("203.0.113.9", "US");
        // 查询时用的是 Java 写出的完整形式（2400:cb00:0:0:0:0:0:1），查询服务同样接受
        countries.put(ip("2400:cb00::1").getHostAddress(), "JP");
        Map<String, List<InetAddress>> dns = new HashMap<>();
        dns.put("node.example.com", Arrays.asList(ip("10.1.1.1"), ip("2400:cb00::1")));
        AtomicInteger calls = new AtomicInteger();
        NodeRegionLookup lookup = lookup(countries, dns, calls);

        // 服务器地址是内网，跳过；连接地址的域名解析出内网 IPv4（跳过）和公网 IPv6；后面的公网 IPv4 用作 IPv4 地区
        Map<String, String> regions = lookup.regionsOf(node("192.168.0.2", "node.example.com,203.0.113.9"));
        assertEquals("us", regions.get("v4"));
        assertEquals("jp", regions.get("v6"));

        // 第二次直接用缓存，不再查询
        lookup.regionsOf(node("192.168.0.2", "node.example.com,203.0.113.9"));
        assertEquals(2, calls.get());
    }

    @Test
    void missingFamiliesAndFailedLookupsAreEmpty() {
        AtomicInteger calls = new AtomicInteger();
        NodeRegionLookup lookup = lookup(new HashMap<>(), new HashMap<>(), calls);
        Map<String, String> regions = lookup.regionsOf(node("198.51.100.7", "unresolvable.example.com"));
        assertNull(regions.get("v4"));
        assertNull(regions.get("v6"));
        // 查询失败也会缓存一段时间，不会每次打开页面都去查
        lookup.regionsOf(node("198.51.100.7", null));
        assertEquals(1, calls.get());
    }

    @Test
    void batchReturnsEveryNode() {
        Map<String, String> countries = new HashMap<>();
        countries.put("203.0.113.9", "de");
        NodeRegionLookup lookup = lookup(countries, new HashMap<>(), new AtomicInteger());
        Node a = node("203.0.113.9", null);
        Node b = node(null, null);
        b.setId(2L);
        Map<Long, Map<String, String>> result = lookup.regionsOf(Arrays.asList(a, b));
        assertEquals("de", result.get(1L).get("v4"));
        assertNull(result.get(2L).get("v4"));
    }
}
