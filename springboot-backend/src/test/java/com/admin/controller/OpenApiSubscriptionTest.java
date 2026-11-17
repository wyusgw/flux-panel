package com.admin.controller;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class OpenApiSubscriptionTest {

    @Test
    void headerKeepsTheOriginalMappingAndJsonMatchesIt() {
        // 出站 200、入站 100、可用 1 GB、到期 2026-01-01 00:00:00 UTC
        OpenApiController.SubscriptionUsage usage = OpenApiController.SubscriptionUsage.of(200L, 100L, 1L, 1_767_225_600_000L);

        // 与原来的响应头完全一致：upload 取入站、download 取出站
        assertEquals("upload=100; download=200; total=1073741824; expire=1767225600", usage.header());

        Map<String, Object> json = usage.toMap();
        assertEquals(100L, json.get("upload"));
        assertEquals(200L, json.get("download"));
        assertEquals(1_073_741_824L, json.get("total"));
        assertEquals(1_767_225_600L, json.get("expire"));
        assertEquals("[upload, download, total, expire]", json.keySet().toString());
    }

    @Test
    void emptyValuesAreZero() {
        OpenApiController.SubscriptionUsage usage = OpenApiController.SubscriptionUsage.of(null, null, null, null);
        assertEquals("upload=0; download=0; total=0; expire=0", usage.header());
        assertEquals(0L, usage.toMap().get("expire"));
    }
}
