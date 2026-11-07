package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.common.utils.MenuPermission;
import com.admin.entity.DeviceGroup;
import com.admin.entity.NodeTrafficCycle;
import com.admin.service.NodeTrafficCycleService;
import com.admin.service.ViteConfigService;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;

class DeviceFlowClearTest {

    private NodeTrafficCycleServiceImpl cycles() {
        NodeTrafficCycleServiceImpl service = spy(new NodeTrafficCycleServiceImpl());
        ReflectionTestUtils.setField(service, "viteConfigService", mock(ViteConfigService.class));
        doReturn(null).when(service).getOne(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class));
        return service;
    }

    @Test
    void clearingResetsTheTotalButKeepsTheCounterBaseline() {
        NodeTrafficCycleServiceImpl service = cycles();
        service.record(1L, 1000, 2000); // 第一次上报只记基准，不算流量
        service.record(1L, 1100, 2200);
        assertEquals(300, service.usedBytes(1L));

        service.clear(1L);
        assertEquals(0, service.usedBytes(1L));

        // 基准还在：下次只计增量，不会把整个网卡计数都算进来
        NodeTrafficCycle next = service.record(1L, 1110, 2220);
        assertEquals(10, next.getUpBytes());
        assertEquals(20, next.getDownBytes());
        assertEquals(30, service.usedBytes(1L));
    }

    @Test
    void nodeThatNeverReportedHasNothingToClearOrSave() {
        NodeTrafficCycleServiceImpl service = cycles();

        assertEquals(0, service.usedBytes(2L));
        service.clear(2L);

        assertTrue(((java.util.Set<?>) ReflectionTestUtils.getField(service, "dirty")).isEmpty());
    }

    private DeviceGroup group(long id, long owner, Long nodeId) {
        DeviceGroup group = new DeviceGroup();
        group.setId(id);
        group.setOwnerUserId(owner);
        group.setNodeId(nodeId);
        return group;
    }

    private DeviceGroupServiceImpl groups(NodeTrafficCycleService cycle) {
        DeviceGroupServiceImpl service = spy(new DeviceGroupServiceImpl());
        ReflectionTestUtils.setField(service, "nodeTrafficCycleService", cycle);
        doReturn(group(1, 5, 11L)).when(service).getById(1L);
        doReturn(group(2, 5, 12L)).when(service).getById(2L);
        doReturn(group(3, 6, 13L)).when(service).getById(3L);
        doReturn(group(4, 5, null)).when(service).getById(4L);
        return service;
    }

    @Test
    void ownerCanClearTheirDevices() {
        NodeTrafficCycleService cycle = mock(NodeTrafficCycleService.class);

        R result = groups(cycle).clearMyDeviceFlow(5, Arrays.asList(1L, 2L, 4L));

        assertEquals(0, result.getCode());
        verify(cycle).clear(11L);
        verify(cycle).clear(12L);
    }

    @Test
    void anyDeviceOfAnotherUserRejectsTheWholeRequest() {
        NodeTrafficCycleService cycle = mock(NodeTrafficCycleService.class);

        R result = groups(cycle).clearMyDeviceFlow(5, Arrays.asList(1L, 3L));

        assertEquals(-1, result.getCode());
        verify(cycle, never()).clear(any());
    }

    @Test
    void emptySelectionIsRejected() {
        NodeTrafficCycleService cycle = mock(NodeTrafficCycleService.class);
        assertEquals(-1, groups(cycle).clearMyDeviceFlow(5, Collections.emptyList()).getCode());
        assertEquals(-1, groups(cycle).clearMyDeviceFlow(5, null).getCode());
    }

    @Test
    void endpointFollowsTheSingleTunnelPagePermission() {
        assertTrue(MenuPermission.allowsEndpoint("singleTunnel", "/api/v1/userDeviceGroup/clearFlow"));
        assertFalse(MenuPermission.allowsEndpoint("forward", "/api/v1/userDeviceGroup/clearFlow"));
    }
}
