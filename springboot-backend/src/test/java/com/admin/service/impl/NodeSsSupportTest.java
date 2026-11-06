package com.admin.service.impl;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NodeSsSupportTest {

    @Test
    void onlyNodesFromVersion125SupportIt() {
        for (String version : new String[]{"1.2.5", "1.2.10", "1.3.0", "2.0.0", "1.2.5.1"}) {
            assertTrue(NodeServiceImpl.supportsSsBlock(version), version);
        }
        for (String version : new String[]{"1.2.4", "1.1.9", "0.9.9", "1.2", "", "abc", "v1.2.5"}) {
            assertFalse(NodeServiceImpl.supportsSsBlock(version), version);
        }
        assertFalse(NodeServiceImpl.supportsSsBlock(null));
    }
}
