package com.admin.service.impl;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class ForwardFailoverHelpersTest {

    @Test
    void outAddressesBracketIpv6AndKeepOrder() {
        assertEquals(Arrays.asList("1.1.1.1:2000", "[2001:db8::1]:2000", "node.example.com:2000"),
                ForwardServiceImpl.buildOutAddrs(Arrays.asList("1.1.1.1", "2001:db8::1", "node.example.com"), 2000));
    }

    @Test
    void firstFreePortSkipsUsedPortsAndRespectsTheRange() {
        Set<Integer> used = new HashSet<>(Arrays.asList(2000, 2001, 2003));
        assertEquals(Integer.valueOf(2002), ForwardServiceImpl.firstFreePort(2000, 2010, used));
        assertNull(ForwardServiceImpl.firstFreePort(2000, 2001, used));
        // 各出口节点端口范围没有交集时 low > high，不应分配出端口
        assertNull(ForwardServiceImpl.firstFreePort(2005, 2004, used));
    }
}
