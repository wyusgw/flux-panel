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
}
