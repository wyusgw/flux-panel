package com.admin.service;

import com.admin.common.dto.PackagePlanDto;
import com.admin.common.dto.PackagePlanUpdateDto;
import com.admin.common.lang.R;
import com.admin.entity.PackagePlan;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.List;
import java.util.Map;

/**
 * <p>
 *  套餐服务类
 * </p>
 *
 * @author QAQ
 * @since 2026-09-21
 */
public interface PackagePlanService extends IService<PackagePlan> {

    R createPackagePlan(PackagePlanDto packagePlanDto);

    R getAllPackagePlans();

    R updatePackagePlan(PackagePlanUpdateDto packagePlanUpdateDto);

    R deletePackagePlan(Long id);

    /**
     * 批量删除套餐
     * @param ids 套餐ID列表
     */
    R batchDeletePackagePlans(List<Long> ids);

    /**
     * 更新套餐排序
     * @param plans 排序数据，每项包含 id 与 sort
     */
    R reorderPackagePlans(List<Map<String, Object>> plans);

    /**
     * 把套餐的属性推送给持有此套餐的用户
     *
     * @param flow   更新可用流量（只改额度，不清零已用流量）
     * @param group  更新用户组
     * @param rules  更新最大规则数
     * @param limits 把套餐限速重新下发到这些用户运行中的规则
     */
    R pushPackagePlanToUsers(Long id, boolean flow, boolean group, boolean rules, boolean limits);
}
