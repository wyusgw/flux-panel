package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.dto.UserDeviceGroupDto;
import com.admin.common.dto.UserDeviceGroupUpdateDto;
import com.admin.common.lang.R;
import com.admin.common.utils.JwtUtil;
import com.admin.service.DeviceGroupService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * <p>
 * 单端隧道：普通用户自建设备组（入口或出口）的前端控制器。所有接口仅需登录（无需管理员权限），
 * 归属校验在服务层完成——每个操作都先确认目标设备组确实属于当前登录用户。
 * </p>
 *
 * @author QAQ
 * @since 2026-09-24
 */
@RestController
@RequestMapping("/api/v1/user-device-group")
@CrossOrigin
public class UserDeviceGroupController extends BaseController {

    @Autowired
    private DeviceGroupService deviceGroupService;

    @LogAnnotation
    @PostMapping("/create")
    public R create(@Validated @RequestBody UserDeviceGroupDto dto) {
        Integer userId = JwtUtil.getUserIdFromToken();
        return deviceGroupService.createUserDeviceGroup(userId, dto);
    }

    @LogAnnotation
    @PostMapping("/list")
    public R list() {
        Integer userId = JwtUtil.getUserIdFromToken();
        return deviceGroupService.listMyDeviceGroups(userId);
    }

    @LogAnnotation
    @PostMapping("/update")
    public R update(@Validated @RequestBody UserDeviceGroupUpdateDto dto) {
        Integer userId = JwtUtil.getUserIdFromToken();
        return deviceGroupService.updateUserDeviceGroup(userId, dto);
    }

    @LogAnnotation
    @PostMapping("/delete")
    public R delete(@RequestBody Map<String, Object> params) {
        Integer userId = JwtUtil.getUserIdFromToken();
        Long id = Long.valueOf(params.get("id").toString());
        return deviceGroupService.deleteUserDeviceGroup(userId, id);
    }

    @LogAnnotation
    @PostMapping("/install")
    public R install(@RequestBody Map<String, Object> params) {
        Integer userId = JwtUtil.getUserIdFromToken();
        Long id = Long.valueOf(params.get("id").toString());
        return deviceGroupService.getMyInstallCommand(userId, id);
    }

    @LogAnnotation
    @PostMapping("/reset-secret")
    public R resetSecret(@RequestBody Map<String, Object> params) {
        Integer userId = JwtUtil.getUserIdFromToken();
        Long id = Long.valueOf(params.get("id").toString());
        return deviceGroupService.resetMySecret(userId, id);
    }
}
