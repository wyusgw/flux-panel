package com.admin.service.impl;

import com.admin.common.dto.UserGroupDto;
import com.admin.common.dto.UserGroupUpdateDto;
import com.admin.common.lang.R;
import com.admin.entity.User;
import com.admin.entity.UserGroup;
import com.admin.mapper.UserGroupMapper;
import com.admin.service.UserGroupService;
import com.admin.service.UserService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * <p>
 * 用户组服务实现类
 * </p>
 *
 * @author QAQ
 * @since 2026-09-21
 */
@Service
public class UserGroupServiceImpl extends ServiceImpl<UserGroupMapper, UserGroup> implements UserGroupService {

    private static final String ERROR_GROUP_NOT_FOUND = "用户组不存在";
    private static final String ERROR_CREATE_FAILED = "用户组创建失败";
    private static final String ERROR_UPDATE_FAILED = "用户组更新失败";
    private static final String SUCCESS_UPDATE_MSG = "用户组更新成功";
    private static final String SUCCESS_DELETE_MSG = "用户组删除成功";

    @Autowired
    @Lazy
    private UserService userService;

    @Override
    public R createUserGroup(UserGroupDto userGroupDto) {
        UserGroup userGroup = new UserGroup();
        BeanUtils.copyProperties(userGroupDto, userGroup);

        long currentTime = System.currentTimeMillis();
        userGroup.setCreatedTime(currentTime);
        userGroup.setUpdatedTime(currentTime);
        userGroup.setStatus(1);
        if (userGroup.getSort() == null) {
            userGroup.setSort(0);
        }

        boolean result = this.save(userGroup);
        return result ? R.ok() : R.err(ERROR_CREATE_FAILED);
    }

    @Override
    public R getAllUserGroups() {
        List<UserGroup> groups = this.list();

        // 统计每个用户组的用户数量
        Map<Long, Long> userCountMap = new HashMap<>();
        for (UserGroup group : groups) {
            long count = userService.count(new QueryWrapper<User>().eq("group_id", group.getId()));
            userCountMap.put(group.getId(), count);
        }

        List<Map<String, Object>> result = groups.stream().map(group -> {
            Map<String, Object> item = new HashMap<>();
            item.put("id", group.getId());
            item.put("name", group.getName());
            item.put("sort", group.getSort());
            item.put("userCount", userCountMap.getOrDefault(group.getId(), 0L));
            return item;
        }).collect(java.util.stream.Collectors.toList());

        return R.ok(result);
    }

    @Override
    public R listNames() {
        List<UserGroup> groups = this.list();
        List<Map<String, Object>> result = groups.stream().map(group -> {
            Map<String, Object> item = new HashMap<>();
            item.put("id", group.getId());
            item.put("name", group.getName());
            return item;
        }).collect(java.util.stream.Collectors.toList());
        return R.ok(result);
    }

    @Override
    public R updateUserGroup(UserGroupUpdateDto userGroupUpdateDto) {
        UserGroup userGroup = this.getById(userGroupUpdateDto.getId());
        if (userGroup == null) {
            return R.err(ERROR_GROUP_NOT_FOUND);
        }

        userGroup.setName(userGroupUpdateDto.getName());
        userGroup.setUpdatedTime(System.currentTimeMillis());

        boolean result = this.updateById(userGroup);
        return result ? R.ok(SUCCESS_UPDATE_MSG) : R.err(ERROR_UPDATE_FAILED);
    }

    @Override
    public R deleteUserGroup(Long id) {
        UserGroup userGroup = this.getById(id);
        if (userGroup == null) {
            return R.err(ERROR_GROUP_NOT_FOUND);
        }

        // 删除用户组不会对已分配的用户产生实际影响
        boolean result = this.removeById(id);
        return result ? R.ok(SUCCESS_DELETE_MSG) : R.err("用户组删除失败");
    }

    @Override
    public R batchDeleteUserGroup(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return R.err("请选择要删除的用户组");
        }

        boolean result = this.removeByIds(ids);
        return result ? R.ok(SUCCESS_DELETE_MSG) : R.err("用户组删除失败");
    }

    @Override
    public R reorderUserGroups(List<Map<String, Object>> groups) {
        if (groups == null || groups.isEmpty()) {
            return R.err("排序数据不能为空");
        }

        List<UserGroup> toUpdate = new java.util.ArrayList<>();
        for (Map<String, Object> item : groups) {
            UserGroup userGroup = new UserGroup();
            userGroup.setId(Long.valueOf(item.get("id").toString()));
            userGroup.setSort(Integer.valueOf(item.get("sort").toString()));
            toUpdate.add(userGroup);
        }

        boolean result = this.updateBatchById(toUpdate);
        return result ? R.ok("排序更新成功") : R.err("排序更新失败");
    }
}
