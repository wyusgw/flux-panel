package com.admin.common.utils;

import com.admin.entity.DeviceGroup;
import com.admin.entity.DeviceGroupChainHop;
import com.admin.entity.NodeGroupRelation;
import com.admin.entity.User;
import com.admin.entity.UserGroup;
import com.admin.mapper.DeviceGroupChainHopMapper;
import com.admin.mapper.DeviceGroupMapper;
import com.admin.mapper.NodeGroupRelationMapper;
import com.admin.mapper.UserGroupMapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 用户组的「可用节点组」：用户组设置了可用节点组时，该组的普通用户只能看到、使用节点属于这些节点组的设备组
 * （与设备组自己的用户组可见性同时生效）；没设置表示不限制。套餐通过分配的用户组间接生效。
 * <p>
 * 只限制管理员建立的设备组，用户自己的单端隧道设备不受限制（由调用方判断）。
 * 链式出口没有自己的节点，要求每一跳的节点都在范围内。
 * 设置里的节点组被删除后不会自动放开限制：剩下的节点组都匹配不到时，这个用户组就看不到任何设备组。
 * </p>
 * 只依赖 Mapper，避免和各个 Service 之间形成循环依赖。
 */
@Component
public class NodeGroupScope {

    @Resource
    private UserGroupMapper userGroupMapper;

    @Resource
    private NodeGroupRelationMapper nodeGroupRelationMapper;

    @Resource
    private DeviceGroupMapper deviceGroupMapper;

    @Resource
    private DeviceGroupChainHopMapper chainHopMapper;

    /** 逗号分隔的节点组 ID → 集合；空、格式不对的项忽略 */
    public static Set<Long> parseIds(String csv) {
        Set<Long> ids = new LinkedHashSet<>();
        if (csv == null) {
            return ids;
        }
        for (String part : csv.split(",")) {
            String s = part.trim();
            if (s.matches("\\d{1,18}") && Long.parseLong(s) > 0) {
                ids.add(Long.parseLong(s));
            }
        }
        return ids;
    }

    /** 节点组 ID 列表 → 逗号分隔（去重、去掉非正数）；空列表返回空串，表示不限制 */
    public static String joinIds(Collection<Long> ids) {
        if (ids == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (Long id : new LinkedHashSet<>(ids)) {
            if (id == null || id <= 0) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append(',');
            }
            sb.append(id);
        }
        return sb.toString();
    }

    /** 用户所在用户组限定的可用节点组；不限制（没有用户组、用户组不存在或没设置）时返回 null */
    public Set<Long> allowedNodeGroups(User user) {
        if (user == null || user.getGroupId() == null) {
            return null;
        }
        UserGroup group = userGroupMapper.selectById(user.getGroupId());
        if (group == null) {
            return null;
        }
        Set<Long> ids = parseIds(group.getNodeGroupIds());
        return ids.isEmpty() ? null : ids;
    }

    /** 各节点所属的节点组 */
    public Map<Long, Set<Long>> nodeGroupsOf(Collection<Long> nodeIds) {
        Map<Long, Set<Long>> result = new HashMap<>();
        if (nodeIds == null || nodeIds.isEmpty()) {
            return result;
        }
        for (NodeGroupRelation relation : nodeGroupRelationMapper.selectList(
                new QueryWrapper<NodeGroupRelation>().in("node_id", new HashSet<>(nodeIds)))) {
            result.computeIfAbsent(relation.getNodeId(), k -> new HashSet<>()).add(relation.getNodeGroupId());
        }
        return result;
    }

    /** 节点是否属于范围内的任一节点组；不限制时都算 */
    public static boolean nodeAllowed(Long nodeId, Set<Long> allowed, Map<Long, Set<Long>> nodeGroups) {
        if (allowed == null) {
            return true;
        }
        if (nodeId == null) {
            return false;
        }
        Set<Long> groups = nodeGroups.getOrDefault(nodeId, Collections.emptySet());
        for (Long id : groups) {
            if (allowed.contains(id)) {
                return true;
            }
        }
        return false;
    }

    /** 设备组（管理员建立的）是否在范围内：普通设备组看自己的节点，链式出口要求每一跳的节点都在范围内 */
    public boolean groupAllowed(DeviceGroup group, Set<Long> allowed) {
        if (allowed == null) {
            return true;
        }
        List<Long> nodeIds = nodesOf(group);
        if (nodeIds.isEmpty()) {
            return false;
        }
        Map<Long, Set<Long>> nodeGroups = nodeGroupsOf(nodeIds);
        for (Long nodeId : nodeIds) {
            if (!nodeAllowed(nodeId, allowed, nodeGroups)) {
                return false;
            }
        }
        return true;
    }

    /** 设备组涉及的节点：普通设备组是它自己的节点，链式出口是每一跳设备组的节点（有一跳缺节点时返回空） */
    List<Long> nodesOf(DeviceGroup group) {
        List<Long> nodeIds = new ArrayList<>();
        if (!"chain".equals(group.getDirection())) {
            if (group.getNodeId() != null) {
                nodeIds.add(group.getNodeId());
            }
            return nodeIds;
        }
        List<DeviceGroupChainHop> hops = chainHopMapper.selectList(new QueryWrapper<DeviceGroupChainHop>()
                .eq("device_group_id", group.getId()));
        for (DeviceGroupChainHop hop : hops) {
            DeviceGroup target = hop.getTargetDeviceGroupId() == null ? null : deviceGroupMapper.selectById(hop.getTargetDeviceGroupId());
            if (target == null || target.getNodeId() == null) {
                return new ArrayList<>();
            }
            nodeIds.add(target.getNodeId());
        }
        return nodeIds;
    }
}
