package com.admin.common.utils;

import com.admin.entity.DeviceGroup;
import com.admin.entity.Node;
import com.admin.entity.ViteConfig;
import com.admin.mapper.DeviceGroupMapper;
import com.admin.mapper.ViteConfigMapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatcher;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OfflineRetainPolicyTest {

    private OfflineRetainPolicy policy;
    private final List<DeviceGroup> groups = new ArrayList<>();
    private final Map<String, String> config = new HashMap<>();

    @BeforeEach
    void setUp() {
        policy = new OfflineRetainPolicy();
        DeviceGroupMapper groupMapper = mock(DeviceGroupMapper.class);
        ViteConfigMapper configMapper = mock(ViteConfigMapper.class);
        ReflectionTestUtils.setField(policy, "deviceGroupMapper", groupMapper);
        ReflectionTestUtils.setField(policy, "viteConfigMapper", configMapper);
        when(groupMapper.selectList(any())).thenReturn(groups);
        when(configMapper.selectOne(any())).thenAnswer(invocation -> {
            QueryWrapper<?> wrapper = invocation.getArgument(0);
            String sql = wrapper.getTargetSql();
            for (Map.Entry<String, String> entry : config.entrySet()) {
                Object value = wrapper.getParamNameValuePairs().values().stream().filter(v -> entry.getKey().equals(v)).findFirst().orElse(null);
                if (value != null) {
                    ViteConfig vc = new ViteConfig();
                    vc.setName(entry.getKey());
                    vc.setValue(entry.getValue());
                    return vc;
                }
            }
            return null;
        });
    }

    @Test
    void notEnabledAnywhereKeepsTheOldBehaviour() {
        assertEquals(OfflineRetainPolicy.DISABLED, policy.retainSeconds(1L));
        config.put("device_offline_retain_enabled", "false");
        config.put("device_offline_retain_seconds", "600");
        assertEquals(OfflineRetainPolicy.DISABLED, policy.retainSeconds(1L));
    }

    @Test
    void globalDefaultAndGroupOverride() {
        config.put("device_offline_retain_enabled", "true");
        config.put("device_offline_retain_seconds", "600");
        assertEquals(600L, policy.retainSeconds(1L));

        DeviceGroup group = new DeviceGroup();
        group.setOfflineRetainEnabled(1);
        group.setOfflineRetainSeconds(30);
        groups.add(group);
        assertEquals(30L, policy.retainSeconds(1L));

        // 设备组开了自定义但没填秒数：回到全局默认
        group.setOfflineRetainSeconds(null);
        assertEquals(600L, policy.retainSeconds(1L));
    }

    @Test
    void retainedOnlyWhileOfflineWithinThePeriod() {
        Node node = new Node();
        node.setStatus(0);
        node.setOfflineTime(1_000_000L);
        node.setLastInfo("{\"cpu_usage\":1}");

        assertEquals(1_000_000L + 60_000L, OfflineRetainPolicy.retainedUntil(node, 60, 1_000_000L + 59_000L));
        assertNull(OfflineRetainPolicy.retainedUntil(node, 60, 1_000_000L + 60_000L));
        assertNull(OfflineRetainPolicy.retainedUntil(node, OfflineRetainPolicy.DISABLED, 1_000_001L));

        node.setStatus(1);
        assertNull(OfflineRetainPolicy.retainedUntil(node, 60, 1_000_001L));
        node.setStatus(0);
        node.setLastInfo(null);
        assertNull(OfflineRetainPolicy.retainedUntil(node, 60, 1_000_001L));
    }
}
