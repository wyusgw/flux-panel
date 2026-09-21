package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.annotation.RequireRole;
import com.admin.common.dto.DeviceGroupDto;
import com.admin.common.dto.DeviceGroupUpdateDto;
import com.admin.common.lang.R;
import com.admin.service.DeviceGroupService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * <p>
 * 设备组前端控制器
 * </p>
 *
 * @author QAQ
 * @since 2026-09-21
 */
@RestController
@RequestMapping("/api/v1/device-group")
@CrossOrigin
public class DeviceGroupController extends BaseController {

    @Autowired
    private DeviceGroupService deviceGroupService;

    @LogAnnotation
    @RequireRole
    @PostMapping("/create")
    public R create(@Validated @RequestBody DeviceGroupDto deviceGroupDto) {
        return deviceGroupService.createDeviceGroup(deviceGroupDto);
    }

    @LogAnnotation
    @PostMapping("/list")
    public R list() {
        // 管理员与普通用户均可访问，返回内容按角色区分（用于转发规则的入口/出口选择）
        return deviceGroupService.getAllDeviceGroups();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/update")
    public R update(@Validated @RequestBody DeviceGroupUpdateDto deviceGroupUpdateDto) {
        return deviceGroupService.updateDeviceGroup(deviceGroupUpdateDto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/delete")
    public R delete(@RequestBody Map<String, Object> params) {
        Long id = Long.valueOf(params.get("id").toString());
        return deviceGroupService.deleteDeviceGroup(id);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/batch-delete")
    public R batchDelete(@RequestBody Map<String, Object> params) {
        @SuppressWarnings("unchecked")
        List<Object> rawIds = (List<Object>) params.get("ids");
        List<Long> ids = rawIds == null ? null : rawIds.stream().map(id -> Long.valueOf(id.toString())).collect(java.util.stream.Collectors.toList());
        return deviceGroupService.batchDeleteDeviceGroup(ids);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/reorder")
    public R reorder(@RequestBody Map<String, Object> params) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> groups = (List<Map<String, Object>>) params.get("groups");
        return deviceGroupService.reorderDeviceGroups(groups);
    }
}
