package com.admin.service.impl;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NodeProxyTest {

    @Test
    void onlyNodesFromVersion126SupportSetProxy() {
        assertTrue(NodeServiceImpl.supportsProxy("1.2.6"));
        assertTrue(NodeServiceImpl.supportsProxy("1.3.0"));
        assertFalse(NodeServiceImpl.supportsProxy("1.2.5"));
        assertFalse(NodeServiceImpl.supportsProxy(null));
    }

    @Test
    void emptyProxyMeansDirect() {
        assertNull(NodeServiceImpl.validateProxy(null));
        assertNull(NodeServiceImpl.validateProxy(""));
    }

    @Test
    void acceptsSocks5Addresses() {
        for (String proxy : new String[]{
                "socks5://127.0.0.1:1080",
                "socks5h://proxy.example.com:7890",
                "socks5://user:p%40ss@10.0.0.1:1080",
                "socks5://[2001:db8::1]:1080",
                "ssh://root:pass@10.0.0.1",
                "ssh://root:p%40ss@example.com:2222"}) {
            assertNull(NodeServiceImpl.validateProxy(proxy), proxy);
        }
    }

    @Test
    void rejectsOtherSchemesAndShellMetacharacters() {
        for (String proxy : new String[]{
                "http://127.0.0.1:8080",
                "127.0.0.1:1080",
                "socks5://127.0.0.1",
                "socks5://127.0.0.1:1080; rm -rf /",
                "socks5://127.0.0.1:1080\" && id",
                "socks5://u:p$(id)@127.0.0.1:1080",
                "socks5://127.0.0.1:1080 ",
                "ssh://10.0.0.1",
                "ssh://root@10.0.0.1:22",
                "ssh://root:pass@10.0.0.1:22; id"}) {
            assertNotNull(NodeServiceImpl.validateProxy(proxy), proxy);
        }
    }
}
