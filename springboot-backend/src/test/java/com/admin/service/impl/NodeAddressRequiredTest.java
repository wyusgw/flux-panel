package com.admin.service.impl;

import com.admin.common.dto.NodeDto;
import org.junit.jupiter.api.Test;

import javax.validation.Validation;
import javax.validation.Validator;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NodeAddressRequiredTest {

    @Test
    void monitorOnlyMayLeaveAddressesBlank() {
        assertFalse(NodeServiceImpl.isAddressMissing("monitor", ""));
        assertFalse(NodeServiceImpl.isAddressMissing("monitor", null));
    }

    @Test
    void otherTypesRequireServerAddress() {
        for (String direction : new String[]{"inbound", "outbound", "both", null}) {
            assertTrue(NodeServiceImpl.isAddressMissing(direction, ""), direction);
            assertTrue(NodeServiceImpl.isAddressMissing(direction, " "), direction);
            assertTrue(NodeServiceImpl.isAddressMissing(direction, null), direction);
            assertFalse(NodeServiceImpl.isAddressMissing(direction, "2.2.2.2"), direction);
        }
    }

    @Test
    void blankEntryIpDefaultsToServerAddress() {
        assertEquals("node.example.com", NodeServiceImpl.resolveEntryIp("", "node.example.com"));
        assertEquals("node.example.com", NodeServiceImpl.resolveEntryIp(" ", "node.example.com"));
        assertEquals("node.example.com", NodeServiceImpl.resolveEntryIp(null, "node.example.com"));
        assertEquals("1.1.1.1,2.2.2.2", NodeServiceImpl.resolveEntryIp("1.1.1.1,2.2.2.2", "node.example.com"));
        assertEquals("", NodeServiceImpl.resolveEntryIp("", ""));
    }

    @Test
    void createDtoAcceptsMissingAddressesButStillValidatesTheRest() {
        Validator validator = Validation.buildDefaultValidatorFactory().getValidator();
        NodeDto dto = new NodeDto();
        dto.setName("monitor-node");
        dto.setPortSta(1000);
        dto.setPortEnd(65535);
        assertEquals(0, validator.validate(dto).size());

        dto.setName(" ");
        assertEquals(1, validator.validate(dto).size());
    }
}
