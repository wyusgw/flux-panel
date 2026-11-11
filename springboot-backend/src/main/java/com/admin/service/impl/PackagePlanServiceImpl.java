package com.admin.service.impl;

import com.admin.common.dto.PackagePlanDto;
import com.admin.common.dto.PackagePlanUpdateDto;
import com.admin.common.lang.R;
import com.admin.common.utils.JwtUtil;
import com.admin.entity.PackagePlan;
import com.admin.entity.User;
import com.admin.entity.UserGroup;
import com.admin.mapper.PackagePlanMapper;
import com.admin.service.ForwardService;
import com.admin.service.PackagePlanService;
import com.admin.service.UserGroupService;
import com.admin.service.UserService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;
import java.util.Map;
import java.util.stream.Collectors;

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

    @Autowired
    @Lazy
    private ForwardService forwardService;

    @Autowired
    @Lazy
    private UserService userService;

    @Override
    public R createPackagePlan(PackagePlanDto packagePlanDto) {
        UserGroup group = userGroupService.getById(packagePlanDto.getGroupId());
        if (group == null) {
            return R.err(ERROR_GROUP_NOT_FOUND);
        }

        PackagePlan packagePlan = new PackagePlan();
        BeanUtils.copyProperties(packagePlanDto, packagePlan);
        String typeError = normalizeType(packagePlan);
        if (typeError != null) {
            return R.err(typeError);
        }

        long currentTime = System.currentTimeMillis();
        packagePlan.setCreatedTime(currentTime);
        packagePlan.setUpdatedTime(currentTime);
        packagePlan.setStatus(1);
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

        Integer oldSpeedLimit = packagePlan.getUserSpeedLimit();
        BeanUtils.copyProperties(packagePlanUpdateDto, packagePlan);
        String typeError = normalizeType(packagePlan);
        if (typeError != null) {
            return R.err(typeError);
        }
        packagePlan.setUpdatedTime(System.currentTimeMillis());

        boolean result = this.updateById(packagePlan);
        if (result && !Objects.equals(oldSpeedLimit == null ? 0 : oldSpeedLimit,
                packagePlan.getUserSpeedLimit() == null ? 0 : packagePlan.getUserSpeedLimit())) {
            // 套餐限速改了：绑定该套餐的用户名下运行中规则的限速需要跟着刷新
            List<Integer> userIds = userService.list(new QueryWrapper<User>().eq("package_id", packagePlan.getId()))
                    .stream().map(u -> u.getId().intValue()).collect(Collectors.toList());
            forwardService.refreshLimitsAfterCommit(userIds);
        }
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

    /** 与购买套餐一致：流量或规则数为 0 表示不限，写成 99999 */
    private static final long UNLIMITED_QUOTA = 99999L;

    @Override
    public R pushPackagePlanToUsers(Long id, boolean flow, boolean group, boolean rules, boolean limits) {
        PackagePlan plan = id == null ? null : this.getById(id);
        if (plan == null) {
            return R.err(ERROR_PACKAGE_NOT_FOUND);
        }
        if (!flow && !group && !rules && !limits) {
            return R.err("请选择要推送的内容");
        }
        if (PackagePlan.TYPE_TRAFFIC_STACK.equals(plan.effectiveType())) {
            return R.err("可叠加流量包不作为用户的套餐，没有可推送的用户");
        }
        if (group && userGroupService.getById(plan.getGroupId()) == null) {
            return R.err(ERROR_GROUP_NOT_FOUND);
        }

        List<Integer> userIds = userService.list(new QueryWrapper<User>().select("id").eq("package_id", plan.getId()))
                .stream().map(u -> u.getId().intValue()).collect(Collectors.toList());
        if (userIds.isEmpty()) {
            return R.ok(0);
        }

        if (flow || group || rules) {
            UpdateWrapper<User> wrapper = new UpdateWrapper<User>().eq("package_id", plan.getId());
            if (flow) {
                wrapper.set("flow", plan.getTraffic() == null || plan.getTraffic() <= 0 ? UNLIMITED_QUOTA : plan.getTraffic());
            }
            if (group) {
                wrapper.set("group_id", plan.getGroupId());
            }
            if (rules) {
                wrapper.set("num", plan.getMaxRules() == null || plan.getMaxRules() <= 0 ? UNLIMITED_QUOTA : plan.getMaxRules());
            }
            wrapper.set("updated_time", System.currentTimeMillis());
            userService.update(null, wrapper);
        }
        if (limits) {
            forwardService.refreshLimitsAfterCommit(userIds);
        }
        // 返回推送到的用户数，前端据此提示
        return R.ok(userIds.size());
    }

    /**
     * 校验并规范套餐类型和时长倍数：未传类型时按旧规则推断（有效天数大于 0 为日付，否则为不限时流量包）；
     * 月付 / 日付的时长倍数至少为 1；不限时流量包不使用时长倍数，统一存 0；可叠加流量包必须有流量
     *
     * @return 校验失败的提示，通过时返回 null
     */
    private String normalizeType(PackagePlan plan) {
        if (plan.getType() == null || plan.getType().trim().isEmpty() || "normal".equals(plan.getType())) {
            plan.setType(plan.effectiveType());
        }
        String type = plan.getType().trim();
        if (!PackagePlan.TYPES.contains(type)) {
            return "套餐类型不合法";
        }
        plan.setType(type);
        if (PackagePlan.TYPE_MONTHLY.equals(type) || PackagePlan.TYPE_DAILY.equals(type)) {
            if (plan.getDurationDays() == null || plan.getDurationDays() < 1) {
                return "时长倍数至少为 1";
            }
        } else {
            plan.setDurationDays(0);
        }
        if (PackagePlan.TYPE_TRAFFIC_STACK.equals(type) && (plan.getTraffic() == null || plan.getTraffic() <= 0)) {
            return "可叠加流量包的流量必须大于 0";
        }
        return null;
    }
}
