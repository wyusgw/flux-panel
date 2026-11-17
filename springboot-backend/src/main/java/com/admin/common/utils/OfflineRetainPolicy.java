package com.admin.common.utils;

import com.admin.entity.DeviceGroup;
import com.admin.entity.Node;
import com.admin.entity.ViteConfig;
import com.admin.mapper.DeviceGroupMapper;
import com.admin.mapper.ViteConfigMapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import java.util.List;

/**
 * 设备离线保留期：设备离线后，节点状态页继续显示最后一次上报的状态多久（秒），超过后清空。
 * 优先取绑定该节点的设备组自定义设置，未启用自定义则取全局默认（推送通知页）；都没启用时返回 {@link #DISABLED}，
 * 表示沿用原来的行为（页面上已有的数据保留到刷新为止，刷新后离线设备不显示状态）。
 * 只依赖 Mapper，WebSocketServer 和 NodeServiceImpl 共用。
 */
@Slf4j
@Component
public class OfflineRetainPolicy {

    public static final long DISABLED = -1L;

    @Resource
    private DeviceGroupMapper deviceGroupMapper;

    @Resource
    private ViteConfigMapper viteConfigMapper;

    public long retainSeconds(Long nodeId) {
        try {
            List<DeviceGroup> groups = deviceGroupMapper.selectList(new QueryWrapper<DeviceGroup>().eq("node_id", nodeId));
            for (DeviceGroup group : groups) {
                if (group.getOfflineRetainEnabled() != null && group.getOfflineRetainEnabled() == 1
                        && group.getOfflineRetainSeconds() != null && group.getOfflineRetainSeconds() >= 0) {
                    return group.getOfflineRetainSeconds();
                }
            }
            if (!"true".equals(configValue("device_offline_retain_enabled"))) {
                return DISABLED;
            }
            String seconds = configValue("device_offline_retain_seconds");
            return seconds == null || seconds.trim().isEmpty() ? 86400L : Math.max(0L, Long.parseLong(seconds.trim()));
        } catch (Exception e) {
            log.info("解析节点 {} 离线保留期失败，按未启用处理: {}", nodeId, e.getMessage());
            return DISABLED;
        }
    }

    /** 离线节点的最后状态保留到什么时候（毫秒时间戳）；没启用、不在离线、没有记录或已过期时返回 null */
    public static Long retainedUntil(Node node, long retainSeconds, long now) {
        if (node == null || retainSeconds < 0 || node.getStatus() == null || node.getStatus() == 1
                || node.getOfflineTime() == null || node.getLastInfo() == null || node.getLastInfo().isEmpty()) {
            return null;
        }
        long until = node.getOfflineTime() + retainSeconds * 1000L;
        return until > now ? until : null;
    }

    private String configValue(String name) {
        ViteConfig config = viteConfigMapper.selectOne(new QueryWrapper<ViteConfig>().eq("name", name));
        return config == null ? null : config.getValue();
    }
}
