package com.admin.common.utils;

import com.alibaba.fastjson.JSONObject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UdpSourceInOutTest {

    @Test
    void udpListenerCarriesFlagOnlyWhenEnabled() {
        JSONObject on = GostUtil.createListener("udp", true);
        assertTrue(on.getJSONObject("metadata").getBooleanValue("sourceInOut"));
        assertTrue(on.getJSONObject("metadata").getBooleanValue("keepAlive"));

        JSONObject off = GostUtil.createListener("udp", false);
        assertFalse(off.getJSONObject("metadata").containsKey("sourceInOut"));
    }

    @Test
    void tcpListenerNeverGetsFlag() {
        JSONObject tcp = GostUtil.createListener("tcp", true);
        assertEquals("tcp", tcp.getString("type"));
        assertNull(tcp.get("metadata"));
    }
}
