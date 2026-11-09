package com.admin.service.impl;

import com.admin.entity.DeviceGroup;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

class AllowedOutGroupTest {

    private DeviceGroup group(Long id, String name, String allowed) {
        DeviceGroup g = new DeviceGroup();
        g.setId(id);
        g.setName(name);
        g.setAllowedOutGroupIds(allowed);
        return g;
    }

    @Test
    void emptyRestrictionAllowsAnyExit() {
        assertNull(ForwardServiceImpl.allowedOutGroupError(group(1L, "in", null), group(9L, "out", null)));
        assertNull(ForwardServiceImpl.allowedOutGroupError(group(1L, "in", "  "), group(9L, "out", null)));
    }

    @Test
    void noExitIsAlwaysAllowed() {
        assertNull(ForwardServiceImpl.allowedOutGroupError(group(1L, "in", "3,5"), null));
    }

    @Test
    void exitMustBeInAllowedList() {
        DeviceGroup in = group(1L, "in", "3, 5,8");
        assertNull(ForwardServiceImpl.allowedOutGroupError(in, group(5L, "a", null)));
        assertNull(ForwardServiceImpl.allowedOutGroupError(in, group(8L, "b", null)));
        assertNotNull(ForwardServiceImpl.allowedOutGroupError(in, group(4L, "c", null)));
        // 55 不能因为包含 5 而被放行
        assertNotNull(ForwardServiceImpl.allowedOutGroupError(in, group(55L, "d", null)));
    }

    @Test
    void directForwardModeControlsWhetherExitIsRequired() {
        DeviceGroup in = group(1L, "in", null);
        DeviceGroup out = group(9L, "out", null);
        // 未配置（旧数据）和 1-可选：有没有出口都行
        assertNull(ForwardServiceImpl.directForwardError(in, null));
        assertNull(ForwardServiceImpl.directForwardError(in, out));
        in.setDirectForwardMode(1);
        assertNull(ForwardServiceImpl.directForwardError(in, null));
        assertNull(ForwardServiceImpl.directForwardError(in, out));
        // 0-禁止直接转发：必须选出口
        in.setDirectForwardMode(0);
        assertNotNull(ForwardServiceImpl.directForwardError(in, null));
        assertNull(ForwardServiceImpl.directForwardError(in, out));
        // 2-强制直接转发：不能选出口
        in.setDirectForwardMode(2);
        assertNull(ForwardServiceImpl.directForwardError(in, null));
        assertNotNull(ForwardServiceImpl.directForwardError(in, out));
    }

    @Test
    void entryMustBeInExitAllowedInList() {
        DeviceGroup out = group(9L, "out", null);
        out.setAllowedInGroupIds("2, 4");
        assertNull(ForwardServiceImpl.allowedInGroupError(group(2L, "a", null), out));
        assertNull(ForwardServiceImpl.allowedInGroupError(group(4L, "b", null), out));
        assertNotNull(ForwardServiceImpl.allowedInGroupError(group(1L, "c", null), out));
        assertNotNull(ForwardServiceImpl.allowedInGroupError(group(24L, "d", null), out));
        out.setAllowedInGroupIds(null);
        assertNull(ForwardServiceImpl.allowedInGroupError(group(1L, "c", null), out));
        assertNull(ForwardServiceImpl.allowedInGroupError(group(1L, "c", null), null));
    }

    @Test
    void normalizeAcceptsOnlyCommaSeparatedPositiveIds() {
        assertNull(DeviceGroupServiceImpl.normalizeAllowedOutGroupIds(null));
        assertNull(DeviceGroupServiceImpl.normalizeAllowedOutGroupIds("   "));
        assertEquals("3,5,8", DeviceGroupServiceImpl.normalizeAllowedOutGroupIds(" 3 , 5,8,5 "));
        assertEquals("!invalid", DeviceGroupServiceImpl.normalizeAllowedOutGroupIds("3,,5"));
        assertEquals("!invalid", DeviceGroupServiceImpl.normalizeAllowedOutGroupIds("3，5"));
        assertEquals("!invalid", DeviceGroupServiceImpl.normalizeAllowedOutGroupIds("a,3"));
        assertEquals("!invalid", DeviceGroupServiceImpl.normalizeAllowedOutGroupIds("0"));
        assertEquals("!invalid", DeviceGroupServiceImpl.normalizeAllowedOutGroupIds("-1"));
    }
}
