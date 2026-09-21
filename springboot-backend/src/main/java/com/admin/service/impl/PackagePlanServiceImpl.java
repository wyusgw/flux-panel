package com.admin.service.impl;

import com.admin.common.dto.PackagePlanDto;
import com.admin.common.dto.PackagePlanUpdateDto;
import com.admin.common.lang.R;
import com.admin.common.utils.JwtUtil;
import com.admin.entity.PackagePlan;
import com.admin.entity.UserGroup;
import com.admin.mapper.PackagePlanMapper;
import com.admin.service.PackagePlanService;
import com.admin.service.UserGroupService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * <p>
 * 套餐服务实现类
 * </p>
 *
 * @author QAQ
 * @since 2026-09-21
 */
@Service
public class PackagePlanServiceImpl extends ServiceImpl<PackagePlanMapper, PackagePlan> implements PackagePlanService {

    private static final String ERROR_PACKAGE_NOT_FOUND = "套餐不存在";
    private static final String ERROR_GROUP_NOT_FOUND = "分配的用户组不存在";
    private static final String ERROR_CREATE_FAILED = "套餐创建失败";
    private static final String ERROR_UPDATE_FAILED = "套餐更新失败";
    private static final String SUCCESS_UPDATE_MSG = "套餐更新成功";
    private static final String SUCCESS_DELETE_MSG = "套餐删除成功";

    @Autowired
    @Lazy
    private UserGroupService userGroupService;

    @Override
    public R createPackagePlan(PackagePlanDto packagePlanDto) {
        UserGroup group = userGroupService.getById(packagePlanDto.getGroupId());
        if (group == null) {
            return R.err(ERROR_GROUP_NOT_FOUND);
        }

        PackagePlan packagePlan = new PackagePlan();
        BeanUtils.copyProperties(packagePlanDto, packagePlan);

        long currentTime = System.currentTimeMillis();
        packagePlan.setCreatedTime(currentTime);
        packagePlan.setUpdatedTime(currentTime);
        packagePlan.setStatus(1);
        if (packagePlan.getType() == null) {
            packagePlan.setType("normal");
        }
        if (packagePlan.getHidden() == null) {
            packagePlan.setHidden(0);
        }
        if (packagePlan.getSort() == null) {
            packagePlan.setSort(0);
        }

        boolean result = this.save(packagePlan);
        return result ? R.ok() : R.err(ERROR_CREATE_FAILED);
    }

    @Override
    public R getAllPackagePlans() {
        Integer roleId = JwtUtil.getRoleIdFromToken();
        if (roleId != null && roleId == 0) {
            return R.ok(this.list(new QueryWrapper<PackagePlan>().orderByAsc("sort")));
        }

        // 普通用户（含商城页面）只能看到未隐藏的套餐
        List<PackagePlan> plans = this.list(new QueryWrapper<PackagePlan>().eq("hidden", 0).orderByAsc("sort"));
        return R.ok(plans);
    }

    @Override
    public R updatePackagePlan(PackagePlanUpdateDto packagePlanUpdateDto) {
        PackagePlan packagePlan = this.getById(packagePlanUpdateDto.getId());
        if (packagePlan == null) {
            return R.err(ERROR_PACKAGE_NOT_FOUND);
        }

        UserGroup group = userGroupService.getById(packagePlanUpdateDto.getGroupId());
        if (group == null) {
            return R.err(ERROR_GROUP_NOT_FOUND);
        }

        BeanUtils.copyProperties(packagePlanUpdateDto, packagePlan);
        packagePlan.setUpdatedTime(System.currentTimeMillis());

        boolean result = this.updateById(packagePlan);
        return result ? R.ok(SUCCESS_UPDATE_MSG) : R.err(ERROR_UPDATE_FAILED);
    }

    @Override
    public R deletePackagePlan(Long id) {
        PackagePlan packagePlan = this.getById(id);
        if (packagePlan == null) {
            return R.err(ERROR_PACKAGE_NOT_FOUND);
        }

        boolean result = this.removeById(id);
        return result ? R.ok(SUCCESS_DELETE_MSG) : R.err("套餐删除失败");
    }

    @Override
    public R batchDeletePackagePlans(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return R.err("请选择要删除的套餐");
        }

        boolean result = this.removeByIds(ids);
        return result ? R.ok(SUCCESS_DELETE_MSG) : R.err("套餐删除失败");
    }

    @Override
    public R reorderPackagePlans(List<Map<String, Object>> plans) {
        if (plans == null || plans.isEmpty()) {
            return R.err("排序数据不能为空");
        }

        List<PackagePlan> toUpdate = new java.util.ArrayList<>();
        for (Map<String, Object> item : plans) {
            PackagePlan plan = new PackagePlan();
            plan.setId(Long.valueOf(item.get("id").toString()));
            plan.setSort(Integer.valueOf(item.get("sort").toString()));
            toUpdate.add(plan);
        }

        boolean result = this.updateBatchById(toUpdate);
        return result ? R.ok("排序更新成功") : R.err("排序更新失败");
    }
}
