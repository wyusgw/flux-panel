package com.admin.service.impl;

import com.admin.common.dto.ForwardGroupDto;
import com.admin.common.dto.ForwardGroupUpdateDto;
import com.admin.common.lang.R;
import com.admin.common.utils.JwtUtil;
import com.admin.entity.Forward;
import com.admin.entity.ForwardGroup;
import com.admin.mapper.ForwardGroupMapper;
import com.admin.service.ForwardGroupService;
import com.admin.service.ForwardService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class ForwardGroupServiceImpl extends ServiceImpl<ForwardGroupMapper, ForwardGroup> implements ForwardGroupService {

    private static final String ERROR_GROUP_NOT_FOUND = "分组不存在";
    private static final String ERROR_NO_PERMISSION = "无权操作该分组";
    private static final String ERROR_CREATE_FAILED = "分组创建失败";
    private static final String ERROR_UPDATE_FAILED = "分组更新失败";
    private static final String SUCCESS_UPDATE_MSG = "分组更新成功";
    private static final String SUCCESS_DELETE_MSG = "分组删除成功";

    @Autowired
    @Lazy
    private ForwardService forwardService;

    @Override
    public R createForwardGroup(ForwardGroupDto forwardGroupDto) {
        Integer userId = JwtUtil.getUserIdFromToken();

        ForwardGroup group = new ForwardGroup();
        group.setName(forwardGroupDto.getName());
        group.setUserId(userId);

        long currentTime = System.currentTimeMillis();
        group.setCreatedTime(currentTime);
        group.setUpdatedTime(currentTime);
        group.setStatus(1);
        group.setSort(0);

        boolean result = this.save(group);
        return result ? R.ok() : R.err(ERROR_CREATE_FAILED);
    }

    @Override
    public R getAllForwardGroups() {
        Integer userId = JwtUtil.getUserIdFromToken();
        Integer roleId = JwtUtil.getRoleIdFromToken();

        List<ForwardGroup> groups = (roleId != null && roleId == 0)
                ? this.list()
                : this.list(new QueryWrapper<ForwardGroup>().eq("user_id", userId));

        Map<Long, Long> countMap = new HashMap<>();
        for (ForwardGroup group : groups) {
            long count = forwardService.count(new QueryWrapper<Forward>().eq("group_id", group.getId()));
            countMap.put(group.getId(), count);
        }

        List<Map<String, Object>> result = groups.stream().map(group -> {
            Map<String, Object> item = new HashMap<>();
            item.put("id", group.getId());
            item.put("name", group.getName());
            item.put("sort", group.getSort());
            item.put("ruleCount", countMap.getOrDefault(group.getId(), 0L));
            return item;
        }).collect(Collectors.toList());

        return R.ok(result);
    }

    @Override
    public R updateForwardGroup(ForwardGroupUpdateDto forwardGroupUpdateDto) {
        ForwardGroup group = this.getById(forwardGroupUpdateDto.getId());
        if (group == null) {
            return R.err(ERROR_GROUP_NOT_FOUND);
        }
        if (!hasPermission(group)) {
            return R.err(ERROR_NO_PERMISSION);
        }

        group.setName(forwardGroupUpdateDto.getName());
        group.setUpdatedTime(System.currentTimeMillis());

        boolean result = this.updateById(group);
        return result ? R.ok(SUCCESS_UPDATE_MSG) : R.err(ERROR_UPDATE_FAILED);
    }

    @Override
    public R deleteForwardGroup(Long id) {
        ForwardGroup group = this.getById(id);
        if (group == null) {
            return R.err(ERROR_GROUP_NOT_FOUND);
        }
        if (!hasPermission(group)) {
            return R.err(ERROR_NO_PERMISSION);
        }

        // 将该分组下的规则移动为未分组
        forwardService.update(new UpdateWrapper<Forward>()
                .eq("group_id", id)
                .set("group_id", null));

        boolean result = this.removeById(id);
        return result ? R.ok(SUCCESS_DELETE_MSG) : R.err("分组删除失败");
    }

    private boolean hasPermission(ForwardGroup group) {
        Integer roleId = JwtUtil.getRoleIdFromToken();
        if (roleId != null && roleId == 0) {
            return true;
        }
        Integer userId = JwtUtil.getUserIdFromToken();
        return group.getUserId() != null && group.getUserId().equals(userId);
    }
}
