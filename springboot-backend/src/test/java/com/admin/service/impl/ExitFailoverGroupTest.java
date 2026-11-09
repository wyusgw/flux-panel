package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.DeviceGroup;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.spy;

class ExitFailoverGroupTest {

    private DeviceGroup group(Long id, String direction) {
        DeviceGroup g = new DeviceGroup();
        g.setId(id);
        g.setName("g" + id);
        g.setDirection(direction);
        return g;
    }

    private DeviceGroupServiceImpl service() {
        DeviceGroupServiceImpl s = spy(new DeviceGroupServiceImpl());
        doReturn(group(1L, "outbound")).when(s).getById(1L);
        doReturn(group(2L, "both")).when(s).getById(2L);
        doReturn(group(3L, "inbound")).when(s).getById(3L);
        doReturn(group(4L, "chain")).when(s).getById(4L);
        for (long id = 5; id <= 8; id++) {
            doReturn(group(id, "outbound")).when(s).getById(id);
        }
        doReturn(null).when(s).getById(99L);
        return s;
    }

    private R check(Long id, Long self) {
        return ReflectionTestUtils.invokeMethod(service(), "validateFailoverGroupId", id, self);
    }

    @Test
    void emptyMeansNone() {
        assertEquals(0, check(null, 10L).getCode());
    }

    @Test
    void acceptsOutboundAndBothBackup() {
        assertEquals(0, check(1L, 10L).getCode());
        assertEquals(0, check(2L, null).getCode());
    }

    @Test
    void rejectsSelfMissingAndNonExitBackup() {
        assertEquals(-1, check(2L, 2L).getCode());
        assertEquals(-1, check(99L, 10L).getCode());
        R inbound = check(3L, 10L);
        assertEquals(-1, inbound.getCode());
        assertTrue(inbound.getMsg().contains("g3"));
        assertEquals(-1, check(4L, 10L).getCode());
    }
}
