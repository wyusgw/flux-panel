package com.admin.service.impl;

import com.admin.common.utils.DemoDataMasker;
import com.admin.entity.DeviceGroup;
import com.admin.entity.Forward;
import com.admin.entity.Node;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Collections;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NodeConfigTest {

    private Map<String, Object> sample() {
        Node node = new Node();
        node.setId(7L);
        node.setName("real-node");
        node.setSecret("real-secret-value");
        node.setServerIp("203.0.113.10");
        node.setIp("203.0.113.11");

        DeviceGroup group = new DeviceGroup();
        group.setId(526L);
        group.setName("real-group");
        group.setDirection("inbound");
        group.setRatio(BigDecimal.ONE);
        group.setRemark("real-remark");

        Forward forward = new Forward();
        forward.setId(11L);
        forward.setName("real-rule");
        forward.setInPort(3001);
        forward.setRemoteAddr("198.51.100.9:443");
        forward.setInDeviceGroupId(526L);

        return NodeServiceImpl.buildNodeConfig(node, Arrays.asList(group),
                Collections.singletonMap(526L, Arrays.asList(1L, 2L)), Arrays.asList(forward));
    }

    @Test
    void containsNodeGroupsAndRulesButNotTheSecret() {
        JsonNode json = new ObjectMapper().valueToTree(sample());
        assertEquals(7, json.get("id").asInt());
        assertEquals("inbound", json.get("deviceGroups").get(0).get("direction").asText());
        assertEquals(2, json.get("deviceGroups").get(0).get("userGroupIds").size());
        assertEquals(3001, json.get("rules").get(0).get("inPort").asInt());
        assertFalse(json.toString().contains("real-secret-value"));
        assertFalse(json.has("secret"));
    }

    private JsonNode protocolOf(String direction) {
        Node node = new Node();
        node.setId(7L);
        DeviceGroup group = new DeviceGroup();
        group.setId(1L);
        group.setDirection(direction);
        group.setProtocol("tls");
        JsonNode json = new ObjectMapper().valueToTree(NodeServiceImpl.buildNodeConfig(node, Arrays.asList(group),
                Collections.emptyMap(), Collections.emptyList()));
        return json.get("deviceGroups").get(0).get("protocol");
    }

    @Test
    void protocolIsOnlyReturnedForGroupsWithAnOutboundRole() {
        assertEquals("tls", protocolOf("outbound").asText());
        assertEquals("tls", protocolOf("both").asText());
        assertTrue(protocolOf("inbound").isNull());
        assertTrue(protocolOf("monitor").isNull());
    }

    @Test
    void demoMaskingHidesAddressesAndRemarks() {
        String masked = DemoDataMasker.mask(new ObjectMapper().valueToTree(sample())).toString();
        for (String real : new String[]{"203.0.113.10", "203.0.113.11", "198.51.100.9", "real-remark"}) {
            assertFalse(masked.contains(real), real);
        }
    }
}
