package com.admin.service.impl;

import com.admin.common.dto.SingleTunnelGroupDto;
import com.admin.common.dto.SingleTunnelGroupUpdateDto;
import com.admin.common.lang.R;
import com.admin.entity.DeviceGroup;
import com.admin.entity.SingleTunnelGroup;
import com.admin.mapper.SingleTunnelGroupMapper;
import com.admin.service.DeviceGroupService;
import com.admin.service.SingleTunnelGroupService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * <p>
 * 单端组服务实现类
 * </p>
 *
 * @author QAQ
 * @since 2026-09-24
 */
@Service
public class SingleTunnelGroupServiceImpl extends ServiceImpl<SingleTunnelGroupMapper, SingleTunnelGroup> implements SingleTunnelGroupService {

    private static final String ERROR_GROUP_NOT_FOUND = "单端组不存在或无权限操作";
    private static final String ERROR_CREATE_FAILED = "单端组创建失败";
    private static final String ERROR_UPDATE_FAILED = "单端组更新失败";
    private static final String SUCCESS_UPDATE_MSG = "单端组更新成功";
    private static final String SUCCESS_DELETE_MSG = "单端组删除成功";

    @Autowired
    @Lazy
    private DeviceGroupService deviceGroupService;

    private SingleTunnelGroup findOwnedGroupOrNull(Integer userId, Long groupId) {
        SingleTunnelGroup group = this.getById(groupId);
        if (group == null || group.getOwnerUserId() == null || !group.getOwnerUserId().equals(userId.longValue())) {
            return null;
        }
        return group;
    }

    @Override
    public R createMyGroup(Integer userId, SingleTunnelGroupDto dto) {
        SingleTunnelGroup group = new SingleTunnelGroup();
        group.setName(dto.getName());
        group.setOwnerUserId(userId.longValue());
        group.setSort(0);

        long currentTime = System.currentTimeMillis();
        group.setCreatedTime(currentTime);
        group.setUpdatedTime(currentTime);
        group.setStatus(1);

        boolean result = this.save(group);
        return result ? R.ok() : R.err(ERROR_CREATE_FAILED);
    }

    @Override
    public R listMyGroups(Integer userId) {
        List<SingleTunnelGroup> groups = this.list(new QueryWrapper<SingleTunnelGroup>()
                .eq("owner_user_id", userId).orderByDesc("created_time"));

        Map<Long, Long> deviceCountMap = new HashMap<>();
        for (SingleTunnelGroup group : groups) {
            long count = deviceGroupService.count(new QueryWrapper<DeviceGroup>()
                    .eq("single_tunnel_group_id", group.getId()).eq("owner_user_id", userId));
            deviceCountMap.put(group.getId(), count);
        }

        List<Map<String, Object>> result = groups.stream().map(group -> {
            Map<String, Object> item = new HashMap<>();
            item.put("id", group.getId());
            item.put("name", group.getName());
            item.put("deviceCount", deviceCountMap.getOrDefault(group.getId(), 0L));
            return item;
        }).collect(Collectors.toList());

        return R.ok(result);
    }

    @Override
    public R updateMyGroup(Integer userId, SingleTunnelGroupUpdateDto dto) {
        SingleTunnelGroup group = findOwnedGroupOrNull(userId, dto.getId());
        if (group == null) {
            return R.err(ERROR_GROUP_NOT_FOUND);
        }

        group.setName(dto.getName());
        group.setUpdatedTime(System.currentTimeMillis());

        boolean result = this.updateById(group);
        return result ? R.ok(SUCCESS_UPDATE_MSG) : R.err(ERROR_UPDATE_FAILED);
    }

    @Override
    public R deleteMyGroup(Integer userId, Long id) {
        SingleTunnelGroup group = findOwnedGroupOrNull(userId, id);
        if (group == null) {
            return R.err(ERROR_GROUP_NOT_FOUND);
        }

        // 删除单端组不会对已归类的单端隧道设备产生实际影响，只是不再显示分组名称
        boolean result = this.removeById(id);
        return result ? R.ok(SUCCESS_DELETE_MSG) : R.err("单端组删除失败");
    }

    @Override
    public boolean isOwnedByUser(Long groupId, Integer userId) {
        if (groupId == null || userId == null) {
            return false;
        }
        SingleTunnelGroup group = this.getById(groupId);
        return group != null && group.getOwnerUserId() != null && group.getOwnerUserId().equals(userId.longValue());
    }
}
