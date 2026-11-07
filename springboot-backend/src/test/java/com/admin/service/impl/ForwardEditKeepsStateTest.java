package com.admin.service.impl;

import com.admin.common.dto.ForwardUpdateDto;
import com.admin.common.dto.GostDto;
import com.admin.common.lang.R;
import com.admin.entity.Forward;
import com.admin.entity.Tunnel;
import com.admin.service.TaskQueueService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockingDetails;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;

class ForwardEditKeepsStateTest {

    private static final String NAME = "7_5_-1";

    private ForwardServiceImpl service;
    private TaskQueueService taskQueue;
    private Forward updated;
    private Tunnel tunnel;

    @BeforeEach
    void setUp() {
        service = spy(new ForwardServiceImpl());
        taskQueue = mock(TaskQueueService.class);
        ReflectionTestUtils.setField(service, "taskQueueService", taskQueue);
        updated = new Forward();
        updated.setId(7L);
        updated.setUserId(5);
        tunnel = new Tunnel();
        tunnel.setType(1);
        tunnel.setInNodeId(10L);
        doReturn(true).when(service).updateById(any(Forward.class));
        doNothing().when(service).restorePausedStatus(anyLong());
    }

    private Forward exist(int status) {
        Forward forward = new Forward();
        forward.setStatus(status);
        return forward;
    }

    private GostDto gost(String msg) {
        GostDto dto = new GostDto();
        dto.setMsg(msg);
        return dto;
    }

    private int enqueued() {
        return (int) mockingDetails(taskQueue).getInvocations().stream()
                .filter(call -> call.getMethod().getName().equals("enqueue")).count();
    }

    @Test
    void runningRuleStaysRunningAndIsNotPaused() {
        R result = service.saveUpdatedForward(updated, exist(1), tunnel, false, NAME, R.ok());

        assertEquals(0, result.getCode());
        assertEquals(1, updated.getStatus());
        verify(service, never()).pauseOnNode(any(), anyString());
    }

    @Test
    void errorRuleBecomesRunningAfterSuccessfulPush() {
        service.saveUpdatedForward(updated, exist(-1), tunnel, false, NAME, R.ok());

        assertEquals(1, updated.getStatus());
    }

    @Test
    void pausedRuleIsSavedPausedAndPausedAgainOnTheNode() {
        doReturn(gost("OK")).when(service).pauseOnNode(anyLong(), anyString());

        R result = service.saveUpdatedForward(updated, exist(0), tunnel, false, NAME, R.ok());

        assertEquals(0, result.getCode());
        assertEquals(0, updated.getStatus());
        verify(service).pauseOnNode(10L, NAME);
        verify(service).updateById(updated);
        assertEquals(0, enqueued());
    }

    @Test
    void pauseFailureSavesTheEditAndQueuesARetry() {
        doReturn(gost("节点不在线")).when(service).pauseOnNode(anyLong(), anyString());

        R result = service.saveUpdatedForward(updated, exist(0), tunnel, false, NAME, R.ok());

        assertEquals(0, result.getCode());
        assertTrue(result.getMsg().contains("离线"), "前端靠「离线」字样显示醒目提示");
        assertEquals(0, updated.getStatus());
        verify(service).updateById(updated);
        assertEquals(1, enqueued());
    }

    @Test
    void offlineNodeKeepsPausedStatusWhileSavingAndQueueing() {
        R result = service.saveUpdatedForward(updated, exist(0), tunnel, false, NAME, R.err("节点不在线"));

        assertEquals(0, result.getCode());
        assertEquals(0, updated.getStatus());
        assertEquals(1, enqueued());
        verify(service, never()).pauseOnNode(any(), anyString());
    }

    @Test
    void offlineNodeStillSavesRunningRuleAsRunning() {
        service.saveUpdatedForward(updated, exist(1), tunnel, false, NAME, R.err("节点不在线"));

        assertEquals(1, updated.getStatus());
        assertEquals(1, enqueued());
    }

    @Test
    void offlineTunnelChangeIsSavedWithoutQueueing() {
        service.saveUpdatedForward(updated, exist(0), tunnel, true, NAME, R.err("节点不在线"));

        assertEquals(0, updated.getStatus());
        assertEquals(0, enqueued());
    }

    @Test
    void failedPushOfPausedRuleRestoresPausedStatus() {
        updated.setStatus(-1); // updateGostServices 失败时改成的异常状态

        R result = service.saveUpdatedForward(updated, exist(0), tunnel, false, NAME, R.err("端口被占用"));

        assertEquals("端口被占用", result.getMsg());
        assertEquals(0, updated.getStatus());
        verify(service).restorePausedStatus(7L);
    }

    @Test
    void failedPushOfRunningRuleKeepsErrorStatus() {
        updated.setStatus(-1);

        R result = service.saveUpdatedForward(updated, exist(1), tunnel, false, NAME, R.err("端口被占用"));

        assertEquals("端口被占用", result.getMsg());
        assertEquals(-1, updated.getStatus());
        verify(service, never()).restorePausedStatus(eq(7L));
    }

    @Test
    void tunnelSyncCopiesEveryRuleSetting() {
        Forward forward = new Forward();
        forward.setId(7L);
        forward.setUserId(5);
        forward.setName("rule");
        forward.setTunnelId(3);
        forward.setRemoteAddr("198.51.100.9:443");
        forward.setStrategy("round");
        forward.setWeights("1,2");
        forward.setInPort(3001);
        forward.setInterfaceName("eth0");
        forward.setGroupId(4L);
        forward.setAcceptProxyProtocol(1);
        forward.setSendProxyProtocol(2);
        forward.setIpLimit(10);
        forward.setConnLimit(20);
        forward.setSpeedLimit(30);

        ForwardUpdateDto dto = TunnelServiceImpl.toForwardUpdateDto(forward);

        assertEquals(7L, dto.getId());
        assertEquals(5, dto.getUserId());
        assertEquals("rule", dto.getName());
        assertEquals(3, dto.getTunnelId());
        assertEquals("198.51.100.9:443", dto.getRemoteAddr());
        assertEquals("round", dto.getStrategy());
        assertEquals("1,2", dto.getWeights());
        assertEquals(3001, dto.getInPort());
        assertEquals("eth0", dto.getInterfaceName());
        assertEquals(4L, dto.getGroupId());
        assertEquals(1, dto.getAcceptProxyProtocol());
        assertEquals(2, dto.getSendProxyProtocol());
        assertEquals(10, dto.getIpLimit());
        assertEquals(20, dto.getConnLimit());
        assertEquals(30, dto.getSpeedLimit());
    }
}
