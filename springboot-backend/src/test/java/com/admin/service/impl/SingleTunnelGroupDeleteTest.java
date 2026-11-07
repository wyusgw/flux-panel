package com.admin.service.impl;

import com.admin.entity.DeviceGroup;
import com.admin.entity.SingleTunnelGroup;
import com.admin.service.DeviceGroupService;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;

class SingleTunnelGroupDeleteTest {

    private SingleTunnelGroupServiceImpl service(DeviceGroupService devices, Long ownerId) {
        SingleTunnelGroupServiceImpl service = spy(new SingleTunnelGroupServiceImpl());
        ReflectionTestUtils.setField(service, "deviceGroupService", devices);
        SingleTunnelGroup group = new SingleTunnelGroup();
        group.setId(10L);
        group.setOwnerUserId(ownerId);
        doReturn(group).when(service).getById(10L);
        doReturn(true).when(service).removeById(10L);
        return service;
    }

    @Test
    @SuppressWarnings("unchecked")
    void deletingAGroupMovesOnlyTheOwnersDevicesBackToUngrouped() {
        DeviceGroupService devices = mock(DeviceGroupService.class);

        assertEquals(0, service(devices, 5L).deleteMyGroup(5, 10L).getCode());

        ArgumentCaptor<Wrapper<DeviceGroup>> captor = ArgumentCaptor.forClass(Wrapper.class);
        verify(devices).update(captor.capture());
        UpdateWrapper<DeviceGroup> update = (UpdateWrapper<DeviceGroup>) captor.getValue();
        assertTrue(update.getSqlSet().contains("single_tunnel_group_id"));
        assertTrue(update.getSqlSegment().contains("owner_user_id"));
        assertTrue(update.getParamNameValuePairs().containsValue(10L));
        assertTrue(update.getParamNameValuePairs().containsValue(5));
    }

    @Test
    void otherUsersGroupCannotBeDeleted() {
        DeviceGroupService devices = mock(DeviceGroupService.class);
        SingleTunnelGroupServiceImpl service = service(devices, 6L);

        assertEquals(-1, service.deleteMyGroup(5, 10L).getCode());

        verify(devices, never()).update(any(Wrapper.class));
        verify(service, never()).removeById(10L);
    }
}
