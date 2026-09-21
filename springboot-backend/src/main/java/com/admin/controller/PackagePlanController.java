package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.annotation.RequireRole;
import com.admin.common.dto.PackagePlanDto;
import com.admin.common.dto.PackagePlanUpdateDto;
import com.admin.common.lang.R;
import com.admin.service.PackagePlanService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * <p>
 * 套餐前端控制器
 * </p>
 *
 * @author QAQ
 * @since 2026-09-21
 */
@RestController
@RequestMapping("/api/v1/package")
@CrossOrigin
public class PackagePlanController extends BaseController {

    @Autowired
    private PackagePlanService packagePlanService;

    @LogAnnotation
    @RequireRole
    @PostMapping("/create")
    public R create(@Validated @RequestBody PackagePlanDto packagePlanDto) {
        return packagePlanService.createPackagePlan(packagePlanDto);
    }

    @LogAnnotation
    @PostMapping("/list")
    public R list() {
        // 未加 @RequireRole：套餐列表需要向所有登录用户开放（商城购买页面依赖此接口），
        // 权限差异由 getAllPackagePlans() 内部按角色过滤（管理员看全部，普通用户仅看未隐藏的）
        return packagePlanService.getAllPackagePlans();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/update")
    public R update(@Validated @RequestBody PackagePlanUpdateDto packagePlanUpdateDto) {
        return packagePlanService.updatePackagePlan(packagePlanUpdateDto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/delete")
    public R delete(@RequestBody Map<String, Object> params) {
        Long id = Long.valueOf(params.get("id").toString());
        return packagePlanService.deletePackagePlan(id);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/batch-delete")
    public R batchDelete(@RequestBody Map<String, Object> params) {
        @SuppressWarnings("unchecked")
        List<Object> rawIds = (List<Object>) params.get("ids");
        List<Long> ids = rawIds == null ? null : rawIds.stream().map(id -> Long.valueOf(id.toString())).collect(java.util.stream.Collectors.toList());
        return packagePlanService.batchDeletePackagePlans(ids);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/reorder")
    public R reorder(@RequestBody Map<String, Object> params) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> plans = (List<Map<String, Object>>) params.get("plans");
        return packagePlanService.reorderPackagePlans(plans);
    }
}
