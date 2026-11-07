package com.admin.common.utils;

import org.junit.jupiter.api.Test;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ForwardTargetPolicyTest {

    /** 域名走假解析，其他地址按字面解析，不依赖真实 DNS */
    private final Map<String, String> dns = new HashMap<>();
    private final ForwardTargetPolicy.Resolver resolver = host -> {
        if (host.matches("[0-9.]+") || host.contains(":")) {
            return new InetAddress[]{InetAddress.getByName(host)};
        }
        String ip = dns.get(host);
        if (ip == null) {
            throw new UnknownHostException(host);
        }
        return new InetAddress[]{InetAddress.getByName(ip)};
    };

    private String check(String addr, boolean allowPrivate) {
        return ForwardTargetPolicy.checkRemoteAddrs(addr, allowPrivate, Collections.emptyList(), resolver);
    }

    @Test
    void publicAddressesAreAllowed() {
        dns.put("example.com", "93.184.216.34");
        assertNull(check("8.8.8.8:53", false));
        assertNull(check("example.com:443", false));
        assertNull(check("[2606:4700:4700::1111]:443", false));
        assertNull(check("8.8.8.8:53,1.1.1.1:53", false));
    }

    @Test
    void loopbackAnyLocalAndMetadataAreAlwaysBlocked() {
        for (String addr : new String[]{"127.0.0.1:22", "127.8.8.8:22", "0.0.0.0:22", "0.1.2.3:22", "[::1]:22", "::1",
                "[::]:22", "169.254.169.254:80", "[fe80::1]:22", "[::ffff:127.0.0.1]:22", "[::127.0.0.1]:22",
                "[64:ff9b::7f00:1]:22", "224.0.0.1:53", "localhost:22", "LOCALHOST:22", "a.localhost:22", "localhost.:22"}) {
            assertNotNull(check(addr, true), addr);
        }
    }

    @Test
    void numericTricksAreRejected() {
        for (String addr : new String[]{"127.1:22", "2130706433:22", "0x7f000001:22", "0x7f.0.0.1:22", "0177.0.0.1:22", "1.2.3:80", "256.1.1.1:80"}) {
            assertNotNull(check(addr, true), addr);
        }
    }

    @Test
    void privateAddressesFollowTheSwitch() {
        for (String addr : new String[]{"10.0.0.1:80", "172.16.0.1:80", "172.31.255.1:80", "192.168.1.1:80", "100.64.0.1:80",
                "100.127.0.1:80", "198.18.0.1:80", "[fd00::1]:80", "[fc00::1]:80"}) {
            assertTrue(check(addr, false).startsWith("不能转发到内网地址"), addr);
            assertNull(check(addr, true), addr);
        }
        assertNull(check("172.32.0.1:80", false));
        assertNull(check("100.128.0.1:80", false));
    }

    @Test
    void domainsAreJudgedByWhatTheyResolveTo() {
        dns.put("evil.example", "127.0.0.1");
        dns.put("intra.example", "10.0.0.5");
        assertNotNull(check("evil.example:22", true));
        assertNotNull(check("intra.example:80", false));
        assertNull(check("intra.example:80", true));
        // 面板解析不了不代表节点解析不了
        assertNull(check("unknown.example:80", false));
    }

    @Test
    void anyBadAddressInTheListBlocksTheRule() {
        assertNotNull(check("8.8.8.8:53,127.0.0.1:22", false));
        assertNotNull(check("8.8.8.8:53\n127.0.0.1:22", false));
        assertNotNull(check("8.8.8.8:53, 10.0.0.1:22", false));
    }

    @Test
    void nodeOwnAddressIsBlockedByTextAndByResolution() {
        dns.put("node.example", "203.0.113.5");
        dns.put("alias.example", "203.0.113.5");
        java.util.List<String> nodeAddrs = Arrays.asList("node.example", "203.0.113.9,203.0.113.10");
        assertNotNull(ForwardTargetPolicy.checkRemoteAddrs("203.0.113.5:22", true, nodeAddrs, resolver));
        assertNotNull(ForwardTargetPolicy.checkRemoteAddrs("alias.example:22", true, nodeAddrs, resolver));
        assertNotNull(ForwardTargetPolicy.checkRemoteAddrs("node.example:22", true, nodeAddrs, resolver));
        assertNotNull(ForwardTargetPolicy.checkRemoteAddrs("203.0.113.10:22", true, nodeAddrs, resolver));
        assertNull(ForwardTargetPolicy.checkRemoteAddrs("8.8.8.8:53", true, nodeAddrs, resolver));
        assertNull(ForwardTargetPolicy.checkRemoteAddrs("8.8.8.8:53", true, Arrays.asList((String) null, ""), resolver));
    }

    @Test
    void schemeAndUserinfoCannotHideTheHost() {
        assertEquals("127.0.0.1", ForwardTargetPolicy.extractHost("tcp://127.0.0.1:22"));
        assertEquals("127.0.0.1", ForwardTargetPolicy.extractHost("user:pw@127.0.0.1:22"));
        assertEquals("example.com", ForwardTargetPolicy.extractHost("http://example.com:80/path"));
        assertEquals("::1", ForwardTargetPolicy.extractHost("[::1]:22"));
        assertEquals("::1", ForwardTargetPolicy.extractHost("::1"));
        assertEquals("example.com", ForwardTargetPolicy.extractHost("example.com"));
    }

    @Test
    void optionLikeHostsAreRejected() {
        assertNotNull(check("-Fgost.json", true));
        assertNotNull(check("--report:80", true));
    }

    @Test
    void emptyInputIsNotAnError() {
        assertNull(check(null, false));
        assertNull(check(" ", false));
    }
}
