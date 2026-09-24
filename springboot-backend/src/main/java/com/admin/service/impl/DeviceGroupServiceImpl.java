package com.admin.service.impl;

import com.admin.common.dto.DeviceGroupChainHopDto;
import com.admin.common.dto.DeviceGroupDto;
import com.admin.common.dto.DeviceGroupUpdateDto;
import com.admin.common.dto.UserDeviceGroupDto;
import com.admin.common.dto.UserDeviceGroupUpdateDto;
import com.admin.common.lang.R;
import com.admin.common.utils.JwtUtil;
import com.admin.entity.DeviceGroup;
import com.admin.entity.DeviceGroupChainHop;
import com.admin.entity.Forward;
import com.admin.entity.Node;
import com.admin.entity.User;
import com.admin.mapper.DeviceGroupChainHopMapper;
import com.admin.mapper.DeviceGroupMapper;
import com.admin.entity.SingleTunnelGroup;
import com.admin.service.DeviceGroupService;
import com.admin.service.ForwardService;
import com.admin.service.NodeService;
import com.admin.service.SingleTunnelGroupService;
import com.admin.service.UserService;
import com.admin.service.ViteConfigService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
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
    private static final String ERROR_IN_USE_AS_HOP = "该设备组仍被链式出口设备组用作某一跳，请先修改相关链式出口设备组";
    private static final String SUCCESS_UPDATE_MSG = "设备组更新成功";
    private static final String SUCCESS_DELETE_MSG = "设备组删除成功";
    private static final int MAX_CHAIN_HOPS = 3;

    @Autowired
    private NodeService nodeService;

    @Autowired
    @Lazy
    private UserService userService;

    @Autowired
    @Lazy
    private ForwardService forwardService;

    @Autowired
    @Lazy
    private ViteConfigService viteConfigService;

    @Autowired
    @Lazy
    private SingleTunnelGroupService singleTunnelGroupService;

    @Autowired
    private DeviceGroupChainHopMapper chainHopMapper;

    @Override
    @Transactional
    public R createDeviceGroup(DeviceGroupDto dto) {
        boolean isChain = "chain".equals(dto.getDirection());

        if (isChain) {
            R hopsCheck = validateChainHops(dto.getChainHops(), null);
            if (hopsCheck.getCode() != 0) {
                return hopsCheck;
            }
        } else {
            if (dto.getNodeId() == null) {
                return R.err("所属节点不能为空");
            }
            Node node = nodeService.getById(dto.getNodeId());
            if (node == null) {
                return R.err(ERROR_NODE_NOT_FOUND);
            }
        }

        DeviceGroup group = new DeviceGroup();
        group.setName(dto.getName());
        group.setNodeId(isChain ? null : dto.getNodeId());
        group.setDirection(normalizeDirection(dto.getDirection()));
        group.setProtocol(dto.getProtocol() != null && !dto.getProtocol().isEmpty() ? dto.getProtocol() : "tls");
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
        if (!result) {
            return R.err(ERROR_CREATE_FAILED);
        }

        if (isChain) {
            saveChainHops(group.getId(), dto.getChainHops());
        }

        return R.ok();
    }

    /**
     * 校验链式出口配置：1~{@value #MAX_CHAIN_HOPS} 跳，且每一跳指向的设备组必须存在、
     * 是 direction = "outbound" 的设备组（不支持嵌套链式出口，避免出现循环引用）。
     * excludeGroupId 用于更新时排除自身（理论上不会出现自引用，这里仅作防御）。
     */
    private R validateChainHops(List<DeviceGroupChainHopDto> hops, Long excludeGroupId) {
        if (hops == null || hops.isEmpty()) {
            return R.err("链式出口至少需要配置 1 跳");
        }
        if (hops.size() > MAX_CHAIN_HOPS) {
            return R.err("链式出口最多支持 " + MAX_CHAIN_HOPS + " 跳");
        }
        for (int i = 0; i < hops.size(); i++) {
            Long targetId = hops.get(i).getTargetDeviceGroupId();
            if (targetId == null) {
                return R.err("第 " + (i + 1) + " 跳未选择出口设备组");
            }
            if (excludeGroupId != null && targetId.equals(excludeGroupId)) {
                return R.err("第 " + (i + 1) + " 跳不能选择自身");
            }
            DeviceGroup target = this.getById(targetId);
            if (target == null) {
                return R.err("第 " + (i + 1) + " 跳选择的设备组不存在");
            }
            if (!"outbound".equals(target.getDirection())) {
                return R.err("第 " + (i + 1) + " 跳「" + target.getName() + "」不是出口设备组，链式出口的每一跳都必须是出口设备组");
            }
        }
        return R.ok();
    }

    /**
     * 覆盖式保存链式出口的跳配置：先清空该设备组名下的旧配置，再按提交顺序写入新配置。
     */
    private void saveChainHops(Long deviceGroupId, List<DeviceGroupChainHopDto> hops) {
        chainHopMapper.delete(new QueryWrapper<DeviceGroupChainHop>().eq("device_group_id", deviceGroupId));
        if (hops == null || hops.isEmpty()) {
            return;
        }
        long now = System.currentTimeMillis();
        int order = 1;
        for (DeviceGroupChainHopDto hopDto : hops) {
            DeviceGroupChainHop hop = new DeviceGroupChainHop();
            hop.setDeviceGroupId(deviceGroupId);
            hop.setHopOrder(order++);
            hop.setTargetDeviceGroupId(hopDto.getTargetDeviceGroupId());
            hop.setMux(Boolean.TRUE.equals(hopDto.getMux()) ? 1 : 0);
            hop.setCreatedTime(now);
            chainHopMapper.insert(hop);
        }
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

            // 可见范围：管理员建立、按用户组规则对自己可见的设备组；或自己名下的单端隧道设备组；
            // 或他人名下、已设为公开共享的单端隧道设备组
            QueryWrapper<DeviceGroup> query = new QueryWrapper<DeviceGroup>().orderByAsc("sort");
            query.and(w -> {
                w.and(w2 -> {
                    w2.isNull("owner_user_id");
                    if (userGroupId != null) {
                        w2.and(w3 -> w3.isNull("user_group_id").or().eq("user_group_id", userGroupId));
                    } else {
                        w2.isNull("user_group_id");
                    }
                });
                w.or().eq("owner_user_id", userId);
                w.or(w2 -> w2.isNotNull("owner_user_id").eq("shared", 1));
            });
            // 普通用户不应看到对所有人隐藏的设备组
            query.ne("hide_in_probe", 2);
            groups = this.list(query);
        }

        Map<Long, Node> nodeMap = new HashMap<>();
        for (DeviceGroup group : groups) {
            if (group.getNodeId() != null && !nodeMap.containsKey(group.getNodeId())) {
                Node node = nodeService.getById(group.getNodeId());
                if (node != null) {
                    nodeMap.put(group.getNodeId(), node);
                }
            }
        }

        // 链式出口设备组没有自己的物理节点，改为展示每一跳目标设备组的名称/节点名，
        // 一次性查出所有设备组，避免在循环里逐条查询
        Map<Long, DeviceGroup> groupById = this.list().stream()
                .collect(Collectors.toMap(DeviceGroup::getId, g -> g, (a, b) -> a));

        // 单端组名称一次性批量解析，避免在循环里逐条查询
        Map<Long, String> singleTunnelGroupNameMap = new HashMap<>();
        for (SingleTunnelGroup g : singleTunnelGroupService.list()) {
            singleTunnelGroupNameMap.put(g.getId(), g.getName());
        }

        List<Map<String, Object>> result = groups.stream().map(group -> {
            Node node = nodeMap.get(group.getNodeId());
            Map<String, Object> item = new HashMap<>();
            item.put("id", group.getId());
            item.put("name", group.getName());
            item.put("nodeId", group.getNodeId());
            item.put("direction", group.getDirection() == null ? "inbound" : group.getDirection());
            item.put("protocol", group.getProtocol() == null ? "tls" : group.getProtocol());
            item.put("ownerUserId", group.getOwnerUserId());
            item.put("shared", group.getShared() != null && group.getShared() == 1);
            item.put("singleTunnelGroupId", group.getSingleTunnelGroupId());
            item.put("singleTunnelGroupName", group.getSingleTunnelGroupId() != null
                    ? singleTunnelGroupNameMap.getOrDefault(group.getSingleTunnelGroupId(), "未知分组")
                    : null);
            // 普通用户的节点列表按设备组权限过滤；同时在此返回已验证可见的节点摘要，
            // 供节点状态页与设备组保持同一份可见性数据，避免两个接口筛选不同步。
            if (node != null) {
                item.put("nodeName", node.getName());
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
            } else if (!"chain".equals(group.getDirection())) {
                item.put("nodeName", "未知节点");
            }
            item.put("userGroupId", group.getUserGroupId());
            item.put("ratio", group.getRatio());
            item.put("hideInProbe", group.getHideInProbe());
            item.put("sort", group.getSort());
            if (isAdmin) {
                item.put("remark", group.getRemark());
                item.put("offlineGraceEnabled", group.getOfflineGraceEnabled() != null && group.getOfflineGraceEnabled() == 1);
                item.put("offlineGraceSeconds", group.getOfflineGraceSeconds());
                item.put("offlineRetainEnabled", group.getOfflineRetainEnabled() != null && group.getOfflineRetainEnabled() == 1);
                item.put("offlineRetainSeconds", group.getOfflineRetainSeconds());
            }
            if ("chain".equals(group.getDirection())) {
                List<DeviceGroupChainHop> hops = chainHopMapper.selectList(new QueryWrapper<DeviceGroupChainHop>()
                        .eq("device_group_id", group.getId())
                        .orderByAsc("hop_order"));
                List<Map<String, Object>> hopList = hops.stream().map(hop -> {
                    Map<String, Object> hopItem = new HashMap<>();
                    hopItem.put("hopOrder", hop.getHopOrder());
                    hopItem.put("targetDeviceGroupId", hop.getTargetDeviceGroupId());
                    hopItem.put("mux", hop.getMux() != null && hop.getMux() == 1);
                    DeviceGroup targetGroup = groupById.get(hop.getTargetDeviceGroupId());
                    if (targetGroup != null) {
                        hopItem.put("targetName", targetGroup.getName());
                        Node targetNode = targetGroup.getNodeId() != null ? nodeService.getById(targetGroup.getNodeId()) : null;
                        hopItem.put("targetNodeName", targetNode != null ? targetNode.getName() : "未知节点");
                    }
                    return hopItem;
                }).collect(Collectors.toList());
                item.put("chainHops", hopList);
            }
            return item;
        }).collect(Collectors.toList());

        return R.ok(result);
    }

    @Override
    @Transactional
    public R updateDeviceGroup(DeviceGroupUpdateDto dto) {
        DeviceGroup group = this.getById(dto.getId());
        if (group == null) {
            return R.err(ERROR_GROUP_NOT_FOUND);
        }

        boolean isChain = "chain".equals(dto.getDirection());

        if (isChain) {
            R hopsCheck = validateChainHops(dto.getChainHops(), dto.getId());
            if (hopsCheck.getCode() != 0) {
                return hopsCheck;
            }
        } else {
            if (dto.getNodeId() == null) {
                return R.err("所属节点不能为空");
            }
            Node node = nodeService.getById(dto.getNodeId());
            if (node == null) {
                return R.err(ERROR_NODE_NOT_FOUND);
            }
        }

        Long oldNodeId = group.getNodeId();

        group.setName(dto.getName());
        group.setNodeId(isChain ? null : dto.getNodeId());
        group.setDirection(normalizeDirection(dto.getDirection()));
        group.setProtocol(dto.getProtocol() != null && !dto.getProtocol().isEmpty() ? dto.getProtocol() : "tls");
        group.setUserGroupId(dto.getUserGroupId());
        group.setRatio(dto.getRatio() != null ? dto.getRatio() : BigDecimal.ONE);
        group.setHideInProbe(dto.getHideInProbe() != null ? dto.getHideInProbe() : 0);
        group.setRemark(dto.getRemark());
        if (dto.getSort() != null) {
            group.setSort(dto.getSort());
        }
        group.setUpdatedTime(System.currentTimeMillis());

        boolean result = this.updateById(group);
        if (!result) {
            return R.err(ERROR_UPDATE_FAILED);
        }

        if (isChain) {
            saveChainHops(group.getId(), dto.getChainHops());
        } else {
            // 类型从链式出口切换为其他类型时，清掉遗留的跳配置
            chainHopMapper.delete(new QueryWrapper<DeviceGroupChainHop>().eq("device_group_id", group.getId()));
        }

        // 若原来绑定的节点因本次修改（切换为链式出口，或更换了所属节点）不再被任何设备组引用，
        // 一并清理，避免残留成孤儿节点
        if (oldNodeId != null && !oldNodeId.equals(group.getNodeId())) {
            long remainingGroupCount = this.count(new QueryWrapper<DeviceGroup>().eq("node_id", oldNodeId));
            if (remainingGroupCount == 0) {
                nodeService.deleteNode(oldNodeId);
            }
        }

        return R.ok(SUCCESS_UPDATE_MSG);
    }

    @Override
    @Transactional
    public R deleteDeviceGroup(Long id) {
        DeviceGroup group = this.getById(id);
        if (group == null) {
            return R.err(ERROR_GROUP_NOT_FOUND);
        }
        return doDeleteGroup(group);
    }

    /**
     * 实际执行删除（用量校验 + 删除 + 链路清理 + 孤儿节点清理），供管理员删除与用户删除自己名下设备组复用
     */
    private R doDeleteGroup(DeviceGroup group) {
        Long id = group.getId();

        long usageCount = forwardService.count(new QueryWrapper<Forward>()
                .eq("in_device_group_id", id)
                .or()
                .eq("out_device_group_id", id));
        if (usageCount > 0) {
            return R.err(ERROR_IN_USE);
        }

        long hopUsageCount = chainHopMapper.selectCount(new QueryWrapper<DeviceGroupChainHop>()
                .eq("target_device_group_id", id));
        if (hopUsageCount > 0) {
            return R.err(ERROR_IN_USE_AS_HOP);
        }

        boolean result = this.removeById(id);
        if (!result) {
            return R.err("设备组删除失败");
        }

        chainHopMapper.delete(new QueryWrapper<DeviceGroupChainHop>().eq("device_group_id", id));

        // 若该节点不再被其他设备组引用，则一并删除节点本身，避免残留成需要"补全配置"的孤儿节点
        // （链式出口设备组没有自己的物理节点，nodeId 为空时无需处理）
        if (group.getNodeId() != null) {
            long remainingGroupCount = this.count(new QueryWrapper<DeviceGroup>().eq("node_id", group.getNodeId()));
            if (remainingGroupCount == 0) {
                nodeService.deleteNode(group.getNodeId());
            }
        }

        return R.ok(SUCCESS_DELETE_MSG);
    }

    // ------------------------- 单端隧道：普通用户自建设备组 -------------------------

    private R checkUserDeviceGroupEnabled() {
        com.admin.entity.ViteConfig config = viteConfigService.getOne(new QueryWrapper<com.admin.entity.ViteConfig>().eq("name", "user_device_group_enabled"));
        boolean enabled = config != null && "true".equals(config.getValue());
        return enabled ? R.ok() : R.err("站点未开启单端隧道自托管设备功能");
    }

    @Override
    @Transactional
    public R createUserDeviceGroup(Integer userId, UserDeviceGroupDto dto) {
        R enabledCheck = checkUserDeviceGroupEnabled();
        if (enabledCheck.getCode() != 0) {
            return enabledCheck;
        }
        if (!"inbound".equals(dto.getDirection()) && !"outbound".equals(dto.getDirection())) {
            return R.err("单端隧道只能选择入口或出口");
        }
        if (dto.getSingleTunnelGroupId() != null && !singleTunnelGroupService.isOwnedByUser(dto.getSingleTunnelGroupId(), userId)) {
            return R.err("所选单端组不存在或无权限使用");
        }

        com.admin.common.dto.NodeDto nodeDto = new com.admin.common.dto.NodeDto();
        nodeDto.setName(dto.getName());
        nodeDto.setIp(dto.getEntryIp());
        nodeDto.setServerIp(dto.getServerIp());
        nodeDto.setPortSta(dto.getPortSta() != null ? dto.getPortSta() : 1000);
        nodeDto.setPortEnd(dto.getPortEnd() != null ? dto.getPortEnd() : 65535);
        R nodeResult = nodeService.createNode(nodeDto);
        if (nodeResult.getCode() != 0) {
            return nodeResult;
        }
        Node node = (Node) nodeResult.getData();

        DeviceGroup group = new DeviceGroup();
        group.setName(dto.getName());
        group.setNodeId(node.getId());
        group.setDirection(dto.getDirection());
        group.setProtocol(dto.getProtocol() != null && !dto.getProtocol().isEmpty() ? dto.getProtocol() : "tls");
        group.setOwnerUserId(userId.longValue());
        group.setSingleTunnelGroupId(dto.getSingleTunnelGroupId());
        group.setShared(dto.isShared() ? 1 : 0);
        group.setRatio(BigDecimal.ONE);
        group.setHideInProbe(0);
        group.setSort(0);
        long now = System.currentTimeMillis();
        group.setCreatedTime(now);
        group.setUpdatedTime(now);
        group.setStatus(1);

        boolean saved = this.save(group);
        if (!saved) {
            nodeService.deleteNode(node.getId());
            return R.err(ERROR_CREATE_FAILED);
        }
        return R.ok(group);
    }

    @Override
    public R listMyDeviceGroups(Integer userId) {
        List<DeviceGroup> groups = this.list(new QueryWrapper<DeviceGroup>()
                .eq("owner_user_id", userId).orderByDesc("created_time"));

        List<Map<String, Object>> result = groups.stream().map(group -> {
            Node node = group.getNodeId() != null ? nodeService.getById(group.getNodeId()) : null;
            Map<String, Object> item = new HashMap<>();
            item.put("id", group.getId());
            item.put("name", group.getName());
            item.put("direction", group.getDirection());
            item.put("protocol", group.getProtocol() == null ? "tls" : group.getProtocol());
            item.put("shared", group.getShared() != null && group.getShared() == 1);
            item.put("singleTunnelGroupId", group.getSingleTunnelGroupId());
            item.put("nodeId", group.getNodeId());
            if (node != null) {
                item.put("serverIp", node.getServerIp());
                item.put("entryIp", node.getIp());
                item.put("portSta", node.getPortSta());
                item.put("portEnd", node.getPortEnd());
                item.put("status", node.getStatus());
            }
            return item;
        }).collect(Collectors.toList());
        return R.ok(result);
    }

    /**
     * 校验设备组确实属于该用户，返回 null 表示校验通过
     */
    private DeviceGroup findOwnedGroupOrNull(Integer userId, Long groupId) {
        DeviceGroup group = this.getById(groupId);
        if (group == null || group.getOwnerUserId() == null || !group.getOwnerUserId().equals(userId.longValue())) {
            return null;
        }
        return group;
    }

    @Override
    @Transactional
    public R updateUserDeviceGroup(Integer userId, UserDeviceGroupUpdateDto dto) {
        DeviceGroup group = findOwnedGroupOrNull(userId, dto.getId());
        if (group == null) {
            return R.err("设备组不存在或无权限操作");
        }
        if (dto.getSingleTunnelGroupId() != null && !singleTunnelGroupService.isOwnedByUser(dto.getSingleTunnelGroupId(), userId)) {
            return R.err("所选单端组不存在或无权限使用");
        }

        if (group.getNodeId() != null) {
            com.admin.common.dto.NodeUpdateDto nodeUpdateDto = new com.admin.common.dto.NodeUpdateDto();
            nodeUpdateDto.setId(group.getNodeId());
            nodeUpdateDto.setName(dto.getName());
            nodeUpdateDto.setIp(dto.getEntryIp());
            nodeUpdateDto.setServerIp(dto.getServerIp());
            nodeUpdateDto.setPortSta(dto.getPortSta() != null ? dto.getPortSta() : 1000);
            nodeUpdateDto.setPortEnd(dto.getPortEnd() != null ? dto.getPortEnd() : 65535);
            R nodeResult = nodeService.updateNode(nodeUpdateDto);
            if (nodeResult.getCode() != 0) {
                return nodeResult;
            }
        }

        group.setName(dto.getName());
        if ("outbound".equals(group.getDirection())) {
            group.setProtocol(dto.getProtocol() != null && !dto.getProtocol().isEmpty() ? dto.getProtocol() : "tls");
        }
        group.setSingleTunnelGroupId(dto.getSingleTunnelGroupId());
        group.setShared(dto.isShared() ? 1 : 0);
        group.setUpdatedTime(System.currentTimeMillis());
        boolean result = this.updateById(group);
        if (result && dto.getSingleTunnelGroupId() == null) {
            // MyBatis-Plus 默认 UPDATE 会跳过 null 字段，updateById 无法清空 single_tunnel_group_id，需要显式 set
            this.update(new com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper<DeviceGroup>()
                    .eq("id", group.getId()).set("single_tunnel_group_id", null));
        }
        return result ? R.ok(SUCCESS_UPDATE_MSG) : R.err(ERROR_UPDATE_FAILED);
    }

    @Override
    @Transactional
    public R deleteUserDeviceGroup(Integer userId, Long id) {
        DeviceGroup group = findOwnedGroupOrNull(userId, id);
        if (group == null) {
            return R.err("设备组不存在或无权限操作");
        }
        return doDeleteGroup(group);
    }

    @Override
    public R getMyInstallCommand(Integer userId, Long groupId) {
        DeviceGroup group = findOwnedGroupOrNull(userId, groupId);
        if (group == null || group.getNodeId() == null) {
            return R.err("设备组不存在或无权限操作");
        }
        return nodeService.getInstallCommand(group.getNodeId());
    }

    @Override
    public R resetMySecret(Integer userId, Long groupId) {
        DeviceGroup group = findOwnedGroupOrNull(userId, groupId);
        if (group == null || group.getNodeId() == null) {
            return R.err("设备组不存在或无权限操作");
        }
        return nodeService.resetSecret(group.getNodeId());
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

        List<DeviceGroup> toUpdate = new ArrayList<>();
        for (Map<String, Object> item : groups) {
            DeviceGroup group = new DeviceGroup();
            group.setId(Long.valueOf(item.get("id").toString()));
            group.setSort(Integer.valueOf(item.get("sort").toString()));
            toUpdate.add(group);
        }

        boolean result = this.updateBatchById(toUpdate);
        return result ? R.ok("排序更新成功") : R.err("排序更新失败");
    }

    @Override
    public R updateOfflineConfig(List<Map<String, Object>> groups) {
        if (groups == null || groups.isEmpty()) {
            return R.ok("离线通知配置保存成功");
        }

        List<DeviceGroup> toUpdate = new ArrayList<>();
        for (Map<String, Object> item : groups) {
            DeviceGroup group = new DeviceGroup();
            group.setId(Long.valueOf(item.get("id").toString()));
            group.setOfflineGraceEnabled(Boolean.TRUE.equals(item.get("offlineGraceEnabled")) ? 1 : 0);
            group.setOfflineGraceSeconds(parseNullableInt(item.get("offlineGraceSeconds")));
            group.setOfflineRetainEnabled(Boolean.TRUE.equals(item.get("offlineRetainEnabled")) ? 1 : 0);
            group.setOfflineRetainSeconds(parseNullableInt(item.get("offlineRetainSeconds")));
            toUpdate.add(group);
        }

        boolean result = this.updateBatchById(toUpdate);
        return result ? R.ok("离线通知配置保存成功") : R.err("离线通知配置保存失败");
    }

    private Integer parseNullableInt(Object value) {
        if (value == null) return null;
        try {
            return Integer.valueOf(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String normalizeDirection(String direction) {
        if ("outbound".equals(direction) || "monitor".equals(direction) || "both".equals(direction) || "chain".equals(direction)) {
            return direction;
        }
        return "inbound";
    }
}
