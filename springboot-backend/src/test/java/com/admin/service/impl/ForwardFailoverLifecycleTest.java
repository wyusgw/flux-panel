package com.admin.service.impl;

import com.admin.common.dto.GostDto;
import com.admin.common.lang.R;
import com.admin.entity.Forward;
import com.admin.entity.Tunnel;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;

class ForwardFailoverLifecycleTest {

    private static final String NAME = "7_5_-1";

    private ForwardServiceImpl service;
    private Forward forward;
    private Tunnel tunnel;

    @BeforeEach
    void setUp() {
        service = spy(new ForwardServiceImpl());
        forward = new Forward();
        forward.setId(7L);
        forward.setUserId(5);
        forward.setStatus(0);
        forward.setOutPort(2000);
        tunnel = new Tunnel();
        tunnel.setType(2);
        tunnel.setStatus(1);
        tunnel.setInNodeId(10L);
        tunnel.setOutNodeId(20L);
        tunnel.setOutIp("203.0.113.1");
        doNothing().when(service).restorePausedStatus(anyLong());
    }

    private GostDto gost(String msg) {
        GostDto dto = new GostDto();
        dto.setMsg(msg);
        return dto;
    }

    private boolean backupsChanged(Forward exist, Tunnel t) {
        return Boolean.TRUE.equals(ReflectionTestUtils.invokeMethod(service, "isBackupSetChanged", exist, t));
    }

    @Test
    void pausedRuleIsPausedAgainOnPrimaryAndEveryBackupExit() {
        tunnel.setBackupOutNodeIds(Arrays.asList(21L, 22L));
        doReturn(gost("OK")).when(service).pauseOnNode(anyLong(), anyString());
        doReturn(gost("OK")).when(service).pauseRemoteOnNode(anyLong(), anyString());

        R result = service.keepPausedAfterPush(forward, tunnel, NAME, R.ok());

        assertEquals(0, result.getCode());
        var order = inOrder(service);
        order.verify(service).pauseOnNode(10L, NAME);
        order.verify(service).pauseRemoteOnNode(20L, NAME);
        order.verify(service).pauseRemoteOnNode(21L, NAME);
        order.verify(service).pauseRemoteOnNode(22L, NAME);
    }

    @Test
    void aBackupThatCannotBePausedFailsTheRepausePushSoTheQueueRetries() {
        tunnel.setBackupOutNodeIds(Collections.singletonList(21L));
        doReturn(gost("OK")).when(service).pauseOnNode(anyLong(), anyString());
        doReturn(gost("OK")).when(service).pauseRemoteOnNode(20L, NAME);
        doReturn(gost("节点不在线")).when(service).pauseRemoteOnNode(21L, NAME);

        assertEquals(-1, service.keepPausedAfterPush(forward, tunnel, NAME, R.ok()).getCode());
    }

    @Test
    void ruleWithoutBackupsBehavesAsBefore() {
        doReturn(gost("OK")).when(service).pauseOnNode(anyLong(), anyString());
        doReturn(gost("OK")).when(service).pauseRemoteOnNode(anyLong(), anyString());

        assertEquals(0, service.keepPausedAfterPush(forward, tunnel, NAME, R.ok()).getCode());

        verify(service).pauseRemoteOnNode(20L, NAME);
        verify(service, never()).pauseRemoteOnNode(21L, NAME);
    }

    @Test
    void backupSetChangeIsDetectedOnlyForDeviceGroupForwards() {
        // 没有备用出口、规则上也没记录：没变化
        assertFalse(backupsChanged(forward, tunnel));

        // 规则创建时没有故障转移，之后出口设备组配置了：变了，需要重建
        tunnel.setBackupOutNodeIds(Arrays.asList(21L, 22L));
        assertTrue(backupsChanged(forward, tunnel));

        // 规则上记录的和当前一致：没变化
        forward.setBackupOutNodeIds("21,22");
        assertFalse(backupsChanged(forward, tunnel));

        // 顺序不同也算变化（优先级变了）
        forward.setBackupOutNodeIds("22,21");
        assertTrue(backupsChanged(forward, tunnel));

        // 故障转移被取消
        tunnel.setBackupOutNodeIds(Collections.emptyList());
        assertTrue(backupsChanged(forward, tunnel));
        forward.setBackupOutNodeIds(null);
        assertFalse(backupsChanged(forward, tunnel));
    }

    @Test
    void explicitTunnelForwardsNeverCountAsBackupChange() {
        tunnel.setId(3L);
        tunnel.setBackupOutNodeIds(Arrays.asList(21L));
        assertFalse(backupsChanged(forward, tunnel));

        Tunnel synthetic = new Tunnel();
        synthetic.setBackupOutNodeIds(Arrays.asList(21L));
        forward.setTunnelId(3);
        assertFalse(backupsChanged(forward, synthetic));
    }
}
