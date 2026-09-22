package com.admin.service.impl;

import com.admin.common.dto.DeviceGroupDto;
import com.admin.common.dto.DeviceGroupUpdateDto;
import com.admin.common.lang.R;
import com.admin.common.utils.JwtUtil;
import com.admin.entity.DeviceGroup;
import com.admin.entity.Forward;
import com.admin.entity.Node;
import com.admin.entity.User;
import com.admin.mapper.DeviceGroupMapper;
import com.admin.service.DeviceGroupService;
import com.admin.service.ForwardService;
import com.admin.service.NodeService;
import com.admin.service.UserService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class DeviceGroupServiceImpl extends ServiceImpl<DeviceGroupMapper, DeviceGroup> implements DeviceGroupService {

    private static final String ERROR_NODE_NOT_FOUND = "所属节点不存在";
    private static final String ERROR_GROUP_NOT_FOUND = "设备组不存在";
    private static final String ERROR_CREATE_FAILED = "设备组创建失败";
    private static final String ERROR_UPDATE_FAILED = "设备组更新失败";
    private static final String ERROR_IN_USE = "该设备组仍被转发规则使用，请先删除相关规则";
    private static final String SUCCESS_UPDATE_MSG = "设备组更新成功";
    private static final String SUCCESS_DELETE_MSG = "设备组删除成功";

    @Autowired
    private NodeService nodeService;

    @Autowired
    @Lazy
    private UserService userService;

    @Autowired
    @Lazy
    private ForwardService forwardService;

    @Override
    public R createDeviceGroup(DeviceGroupDto dto) {
        Node node = nodeService.getById(dto.getNodeId());
        if (node == null) {
            return R.err(ERROR_NODE_NOT_FOUND);
        }

        DeviceGroup group = new DeviceGroup();
        group.setName(dto.getName());
        group.setNodeId(dto.getNodeId());
        group.setDirection(normalizeDirection(dto.getDirection()));
        group.setUserGroupId(dto.getUserGroupId());
        group.setRatio(dto.getRatio() != null ? dto.getRatio() : BigDecimal.ONE);
        group.setHideInProbe(dto.getHideInProbe() != null ? dto.getHideInProbe() : 0);
        group.setRemark(dto.getRemark());
        group.setSort(dto.getSort() != null ? dto.getSort() : 0);

        long currentTime = System.currentTimeMillis();
        group.setCreatedTime(currentTime);
        group.setUpdatedTime(currentTime);
        group.setStatus(1);

        boolean result = this.save(group);
        return result ? R.ok() : R.err(ERROR_CREATE_FAILED);
    }

    @Override
    public R getAllDeviceGroups() {
        Integer roleId = JwtUtil.getRoleIdFromToken();
        boolean isAdmin = roleId != null && roleId == 0;

        List<DeviceGroup> groups;
        if (isAdmin) {
            groups = this.list(new QueryWrapper<DeviceGroup>().orderByAsc("sort"));
        } else {
            Integer userId = JwtUtil.getUserIdFromToken();
            User user = userService.getById(userId);
            Long userGroupId = user != null ? user.getGroupId() : null;

            QueryWrapper<DeviceGroup> query = new QueryWrapper<DeviceGroup>().orderByAsc("sort");
            if (userGroupId != null) {
                query.and(w -> w.isNull("user_group_id").or().eq("user_group_id", userGroupId));
            } else {
                query.isNull("user_group_id");
            }
            // 普通用户不应看到对所有人隐藏的设备组
            query.ne("hide_in_probe", 2);
            groups = this.list(query);
        }

        Map<Long, Node> nodeMap = new HashMap<>();
        for (DeviceGroup group : groups) {
            if (!nodeMap.containsKey(group.getNodeId())) {
                Node node = nodeService.getById(group.getNodeId());
                if (node != null) {
                    nodeMap.put(group.getNodeId(), node);
                }
            }
        }

        List<Map<String, Object>> result = groups.stream().map(group -> {
            Node node = nodeMap.get(group.getNodeId());
            Map<String, Object> item = new HashMap<>();
            item.put("id", group.getId());
            item.put("name", group.getName());
            item.put("nodeId", group.getNodeId());
            item.put("direction", group.getDirection() == null ? "inbound" : group.getDirection());
            item.put("nodeName", node != null ? node.getName() : "未知节点");
            // 普通用户的节点列表按设备组权限过滤；同时在此返回已验证可见的节点摘要，
            // 供节点状态页与设备组保持同一份可见性数据，避免两个接口筛选不同步。
            if (node != null) {
                Map<String, Object> nodeInfo = new HashMap<>();
                nodeInfo.put("id", node.getId());
                nodeInfo.put("name", node.getName());
                nodeInfo.put("ip", node.getIp());
                nodeInfo.put("serverIp", node.getServerIp());
                nodeInfo.put("version", node.getVersion());
                nodeInfo.put("portSta", node.getPortSta());
                nodeInfo.put("portEnd", node.getPortEnd());
                nodeInfo.put("status", node.getStatus());
                item.put("node", nodeInfo);
            }
            item.put("userGroupId", group.getUserGroupId());
            item.put("ratio", group.getRatio());
            item.put("hideInProbe", group.getHideInProbe());
            item.put("sort", group.getSort());
            if (isAdmin) {
                item.put("remark", group.getRemark());
            }
            return item;
        }).collect(Collectors.toList());

        return R.ok(result);
    }

    @Override
    public R updateDeviceGroup(DeviceGroupUpdateDto dto) {
        DeviceGroup group = this.getById(dto.getId());
        if (group == null) {
            return R.err(ERROR_GROUP_NOT_FOUND);
        }

        Node node = nodeService.getById(dto.getNodeId());
        if (node == null) {
            return R.err(ERROR_NODE_NOT_FOUND);
        }

        group.setName(dto.getName());
        group.setNodeId(dto.getNodeId());
        group.setDirection(normalizeDirection(dto.getDirection()));
        group.setUserGroupId(dto.getUserGroupId());
        group.setRatio(dto.getRatio() != null ? dto.getRatio() : BigDecimal.ONE);
        group.setHideInProbe(dto.getHideInProbe() != null ? dto.getHideInProbe() : 0);
        group.setRemark(dto.getRemark());
        if (dto.getSort() != null) {
            group.setSort(dto.getSort());
        }
        group.setUpdatedTime(System.currentTimeMillis());

        boolean result = this.updateById(group);
        return result ? R.ok(SUCCESS_UPDATE_MSG) : R.err(ERROR_UPDATE_FAILED);
    }

    @Override
    public R deleteDeviceGroup(Long id) {
        DeviceGroup group = this.getById(id);
        if (group == null) {
            return R.err(ERROR_GROUP_NOT_FOUND);
        }

        long usageCount = forwardService.count(new QueryWrapper<Forward>()
                .eq("in_device_group_id", id)
                .or()
                .eq("out_device_group_id", id));
        if (usageCount > 0) {
            return R.err(ERROR_IN_USE);
        }

        boolean result = this.removeById(id);
        if (!result) {
            return R.err("设备组删除失败");
        }

        // 若该节点不再被其他设备组引用，则一并删除节点本身，避免残留成需要"补全配置"的孤儿节点
        long remainingGroupCount = this.count(new QueryWrapper<DeviceGroup>().eq("node_id", group.getNodeId()));
        if (remainingGroupCount == 0) {
            nodeService.deleteNode(group.getNodeId());
        }

        return R.ok(SUCCESS_DELETE_MSG);
    }

    @Override
    public R batchDeleteDeviceGroup(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return R.err("请选择要删除的设备");
        }

        int successCount = 0;
        String lastError = null;
        for (Long id : ids) {
            R result = this.deleteDeviceGroup(id);
            if (result.getCode() == 0) {
                successCount++;
            } else {
                lastError = result.getMsg();
            }
        }

        if (successCount == ids.size()) {
            return R.ok(SUCCESS_DELETE_MSG);
        }
        if (successCount == 0) {
            return R.err(lastError != null ? lastError : "设备组删除失败");
        }
        return R.ok("成功删除 " + successCount + " / " + ids.size() + " 个设备，其余未能删除：" + lastError);
    }

    @Override
    public R reorderDeviceGroups(List<Map<String, Object>> groups) {
        if (groups == null || groups.isEmpty()) {
            return R.err("排序数据不能为空");
        }

        List<DeviceGroup> toUpdate = new java.util.ArrayList<>();
        for (Map<String, Object> item : groups) {
            DeviceGroup group = new DeviceGroup();
            group.setId(Long.valueOf(item.get("id").toString()));
            group.setSort(Integer.valueOf(item.get("sort").toString()));
            toUpdate.add(group);
        }

        boolean result = this.updateBatchById(toUpdate);
        return result ? R.ok("排序更新成功") : R.err("排序更新失败");
    }

    private String normalizeDirection(String direction) {
        if ("outbound".equals(direction) || "monitor".equals(direction) || "both".equals(direction)) {
            return direction;
        }
        return "inbound";
    }
}
