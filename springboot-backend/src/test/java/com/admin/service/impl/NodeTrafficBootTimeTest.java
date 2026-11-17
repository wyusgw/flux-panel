package com.admin.service.impl;

import com.admin.service.ViteConfigService;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;

class NodeTrafficBootTimeTest {

    private static final long BOOT = 1_700_000_000L;

    private NodeTrafficCycleServiceImpl cycles() {
        NodeTrafficCycleServiceImpl service = spy(new NodeTrafficCycleServiceImpl());
        ReflectionTestUtils.setField(service, "viteConfigService", mock(ViteConfigService.class));
        doReturn(null).when(service).getOne(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class));
        return service;
    }

    @Test
    void droppingReadingWithTheSameBootTimeRestartsCountingInsteadOfAddingEverything() {
        NodeTrafficCycleServiceImpl service = cycles();
        service.record(1L, 10_000, 20_000, BOOT);
        service.record(1L, 10_100, 20_200, BOOT);
        assertEquals(300, service.usedBytes(1L));

        // 容器停止、它的虚拟网卡消失：读数变小但没有重启，不能把整个读数再加一遍
        service.record(1L, 4_000, 5_000, BOOT);
        assertEquals(300, service.usedBytes(1L));
        // 之后按新的读数继续计增量
        service.record(1L, 4_050, 5_050, BOOT + 1);
        assertEquals(400, service.usedBytes(1L));
    }

    @Test
    void changedBootTimeMeansARebootEvenWhenTheReadingIsHigher() {
        NodeTrafficCycleServiceImpl service = cycles();
        service.record(1L, 1_000, 1_000, BOOT);
        service.record(1L, 1_100, 1_100, BOOT);
        // 重启后跑了很久，读数已经超过重启前：本次读数整体是重启后的流量
        service.record(1L, 5_000, 6_000, BOOT + 3600);
        assertEquals(200 + 11_000, service.usedBytes(1L));
    }

    @Test
    void firstReportAfterUpgradingTheNodeDoesNotDoubleCount() {
        NodeTrafficCycleServiceImpl service = cycles();
        // 旧版节点（不报开机时间）：统计所有网卡
        service.record(1L, 50_000, 60_000);
        service.record(1L, 50_100, 60_100);
        assertEquals(200, service.usedBytes(1L));
        // 升级后只统计物理网卡，读数变小，第一次带开机时间：从这里重新计数
        service.record(1L, 30_000, 40_000, BOOT);
        assertEquals(200, service.usedBytes(1L));
        service.record(1L, 30_010, 40_010, BOOT);
        assertEquals(220, service.usedBytes(1L));
    }

    @Test
    void oldNodesKeepTheOriginalRebootRule() {
        NodeTrafficCycleServiceImpl service = cycles();
        service.record(1L, 1_000, 1_000);
        service.record(1L, 100, 100);
        // 不知道是否重启：读数变小当作重启，本次读数整体计入
        assertEquals(200, service.usedBytes(1L));
    }

    @Test
    void rebootDecision() {
        assertNull(NodeTrafficCycleServiceImpl.rebooted(BOOT, null));
        assertNull(NodeTrafficCycleServiceImpl.rebooted(BOOT, 0L));
        assertFalse(NodeTrafficCycleServiceImpl.rebooted(null, BOOT));
        assertFalse(NodeTrafficCycleServiceImpl.rebooted(BOOT, BOOT + NodeTrafficCycleServiceImpl.BOOT_TIME_TOLERANCE_SECONDS));
        assertTrue(NodeTrafficCycleServiceImpl.rebooted(BOOT, BOOT + NodeTrafficCycleServiceImpl.BOOT_TIME_TOLERANCE_SECONDS + 1));
    }
}
