package com.admin.common.task;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class CheckGostConfigChainTest {

    @Test
    void hopNumberInTheNameMapsToTheHopIndex() {
        assertEquals(0, CheckGostConfigAsync.chainHopIndex("h1"));
        assertEquals(2, CheckGostConfigAsync.chainHopIndex("h3"));
        assertNull(CheckGostConfigAsync.chainHopIndex("h0"));
        assertNull(CheckGostConfigAsync.chainHopIndex("x1"));
        assertNull(CheckGostConfigAsync.chainHopIndex("h"));
        assertNull(CheckGostConfigAsync.chainHopIndex(null));
    }
}
