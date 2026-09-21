package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.annotation.RequireRole;
import com.admin.common.dto.UserGroupDto;
import com.admin.common.dto.UserGroupUpdateDto;
import com.admin.common.lang.R;
import com.admin.service.UserGroupService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * <p>
 * 用户组前端控制器
 * </p>
 *
 * @author QAQ
 * @since 2026-09-21
 */
@RestController
@RequestMapping("/api/v1/user-group")
@CrossOrigin
public class UserGroupController extends BaseController {

    @Autowired
    private UserGroupService userGroupService;

    @LogAnnotation
    @RequireRole
    @PostMapping("/create")
    public R create(@Validated @RequestBody UserGroupDto userGroupDto) {
        return userGroupService.createUserGroup(userGroupDto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/list")
    public R list() {
        return userGroupService.getAllUserGroups();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/update")
    public R update(@Validated @RequestBody UserGroupUpdateDto userGroupUpdateDto) {
        return userGroupService.updateUserGroup(userGroupUpdateDto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/delete")
    public R delete(@RequestBody Map<String, Object> params) {
        Long id = Long.valueOf(params.get("id").toString());
        return userGroupService.deleteUserGroup(id);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/batch-delete")
    public R batchDelete(@RequestBody Map<String, Object> params) {
        @SuppressWarnings("unchecked")
        List<Object> rawIds = (List<Object>) params.get("ids");
        List<Long> ids = rawIds == null ? null : rawIds.stream().map(id -> Long.valueOf(id.toString())).collect(java.util.stream.Collectors.toList());
        return userGroupService.batchDeleteUserGroup(ids);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/reorder")
    public R reorder(@RequestBody Map<String, Object> params) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> groups = (List<Map<String, Object>>) params.get("groups");
        return userGroupService.reorderUserGroups(groups);
    }
}
