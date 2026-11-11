package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.Forward;
import com.admin.entity.Tunnel;
import com.admin.service.TaskQueueService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;

/**
 * 未同步的规则（没有设备、节点离线、服务还没推到节点）点暂停 / 恢复：规则记为目标状态，并登记转发同步任务，
 * 节点就绪后由同步队列推送配置（已暂停的推送后重新暂停）
 */
class ForwardPauseUnsyncedTest {

    private ForwardServiceImpl service;
    private TaskQueueService queue;
    private Forward forward;
    private Tunnel tunnel;

    @BeforeEach
    void setUp() {
        service = spy(new ForwardServiceImpl());
        queue = mock(TaskQueueService.class);
        ReflectionTestUtils.setField(service, "taskQueueService", queue);
        forward = new Forward();
        forward.setId(63L);
        forward.setUserId(5);
        forward.setName("test");
        forward.setStatus(1);
        tunnel = new Tunnel();
        tunnel.setType(2);
        tunnel.setInNodeId(10L);
        tunnel.setOutNodeId(20L);
    }

    @Test
    void unreachableNodeStillPausesAndQueuesSync() {
        doReturn(true).when(service).updateById(any(Forward.class));

        R result = service.saveStatusPendingSync(forward, tunnel, 0, "节点 10 不在线");

        assertEquals(0, result.getCode());
        assertEquals("服务已暂停，节点暂未同步，节点就绪后会自动补推", result.getMsg());
        assertEquals(0, forward.getStatus());
        verify(queue).enqueue(eq("FORWARD_SYNC"), eq("63"), anyString(), eq(Arrays.asList(10L, 20L)), eq("节点 10 不在线"));
    }

    @Test
    void ruleWithoutDevicesIsStillPaused() {
        doReturn(true).when(service).updateById(any(Forward.class));
        Tunnel noDevice = new Tunnel();
        noDevice.setType(1);

        assertEquals(0, service.saveStatusPendingSync(forward, noDevice, 0, "入口节点不存在").getCode());
        assertEquals(0, forward.getStatus());
        verify(queue).enqueue(eq("FORWARD_SYNC"), eq("63"), anyString(), eq(java.util.Collections.emptyList()), eq("入口节点不存在"));
    }

    @Test
    void unreachableNodeStillResumesAndQueuesSync() {
        doReturn(true).when(service).updateById(any(Forward.class));
        forward.setStatus(0);

        R result = service.saveStatusPendingSync(forward, tunnel, 1, "节点 10 不在线");

        assertEquals(0, result.getCode());
        assertEquals("服务已恢复，节点暂未同步，节点就绪后会自动补推", result.getMsg());
        assertEquals(1, forward.getStatus());
        verify(queue).enqueue(eq("FORWARD_SYNC"), eq("63"), anyString(), eq(Arrays.asList(10L, 20L)), eq("节点 10 不在线"));
    }

    @Test
    void deviceGroupsWithoutDevicesGetAPlaceholderTunnel() {
        com.admin.service.DeviceGroupService groups = mock(com.admin.service.DeviceGroupService.class);
        ReflectionTestUtils.setField(service, "deviceGroupService", groups);
        com.admin.entity.DeviceGroup in = new com.admin.entity.DeviceGroup();
        com.admin.entity.DeviceGroup out = new com.admin.entity.DeviceGroup();
        org.mockito.Mockito.when(groups.getById(3L)).thenReturn(in);
        org.mockito.Mockito.when(groups.getById(4L)).thenReturn(out);
        forward.setInDeviceGroupId(3L);
        forward.setOutDeviceGroupId(4L);

        Tunnel placeholder = service.unassignedDeviceTunnel(forward);
        assertEquals(1, placeholder.getStatus());
        assertEquals(2, placeholder.getType());
        assertEquals(null, placeholder.getInNodeId());

        // 出口设备组被删了：仍然算隧道不存在
        org.mockito.Mockito.when(groups.getById(4L)).thenReturn(null);
        assertEquals(null, service.unassignedDeviceTunnel(forward));

        // 旧版隧道模式的规则不走占位
        forward.setTunnelId(9);
        assertEquals(null, service.unassignedDeviceTunnel(forward));
    }

    @Test
    void offlineRetryKeepsRunningRuleUnsyncedNotError() {
        org.mockito.Mockito.doNothing().when(service).restoreActiveStatus(org.mockito.ArgumentMatchers.anyLong());
        forward.setStatus(-1); // updateGostServices 推送失败时已标成异常

        R offline = R.err("节点 10 不在线");
        assertEquals(offline, service.keepActiveIfNodeOffline(forward, offline));
        assertEquals(1, forward.getStatus());
        verify(service).restoreActiveStatus(63L);
    }

    @Test
    void onlineNodeRejectingConfigStaysError() {
        forward.setStatus(-1);

        service.keepActiveIfNodeOffline(forward, R.err("端口 46267 已被占用"));
        assertEquals(-1, forward.getStatus());
        verify(service, never()).restoreActiveStatus(org.mockito.ArgumentMatchers.anyLong());

        service.keepActiveIfNodeOffline(forward, R.ok());
        verify(service, never()).restoreActiveStatus(org.mockito.ArgumentMatchers.anyLong());
    }

    @Test
    void failedSaveDoesNotQueue() {
        doReturn(false).when(service).updateById(any(Forward.class));

        assertEquals("更新状态失败", service.saveStatusPendingSync(forward, tunnel, 0, "x").getMsg());
        verify(queue, never()).enqueue(anyString(), anyString(), anyString(), any(), anyString());
    }
}
