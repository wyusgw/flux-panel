package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.dto.SingleTunnelGroupDto;
import com.admin.common.dto.SingleTunnelGroupUpdateDto;
import com.admin.common.lang.R;
import com.admin.common.utils.JwtUtil;
import com.admin.service.SingleTunnelGroupService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * <p>
 * 单端组前端控制器：普通用户自己建立、用来给自己的单端隧道设备分组分类的功能，
 * 所有接口仅需登录（无需管理员权限），归属校验在服务层完成。
 * </p>
 *
 * @author QAQ
 * @since 2026-09-24
 */
@RestController
@RequestMapping("/api/v1/single-tunnel-group")
@CrossOrigin
public class SingleTunnelGroupController extends BaseController {

    @Autowired
    private SingleTunnelGroupService singleTunnelGroupService;

    @LogAnnotation
    @PostMapping("/create")
    public R create(@Validated @RequestBody SingleTunnelGroupDto dto) {
        Integer userId = JwtUtil.getUserIdFromToken();
        return singleTunnelGroupService.createMyGroup(userId, dto);
    }

    @LogAnnotation
    @PostMapping("/list")
    public R list() {
        Integer userId = JwtUtil.getUserIdFromToken();
        return singleTunnelGroupService.listMyGroups(userId);
    }

    @LogAnnotation
    @PostMapping("/update")
    public R update(@Validated @RequestBody SingleTunnelGroupUpdateDto dto) {
        Integer userId = JwtUtil.getUserIdFromToken();
        return singleTunnelGroupService.updateMyGroup(userId, dto);
    }

    @LogAnnotation
    @PostMapping("/delete")
    public R delete(@RequestBody Map<String, Object> params) {
        Integer userId = JwtUtil.getUserIdFromToken();
        Long id = Long.valueOf(params.get("id").toString());
        return singleTunnelGroupService.deleteMyGroup(userId, id);
    }
}
