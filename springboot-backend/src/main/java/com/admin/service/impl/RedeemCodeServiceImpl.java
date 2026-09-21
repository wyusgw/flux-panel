package com.admin.service.impl;

import com.admin.common.dto.RedeemCodeBatchDto;
import com.admin.common.lang.R;
import com.admin.entity.PackagePlan;
import com.admin.entity.RedeemCode;
import com.admin.mapper.RedeemCodeMapper;
import com.admin.service.PackagePlanService;
import com.admin.service.RedeemCodeService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class RedeemCodeServiceImpl extends ServiceImpl<RedeemCodeMapper, RedeemCode> implements RedeemCodeService {

    private static final String ERROR_PACKAGE_NOT_FOUND = "套餐不存在";
    private static final String ERROR_CREATE_FAILED = "兑换码创建失败";
    private static final String ERROR_NOT_FOUND = "兑换码不存在";

    @Autowired
    @Lazy
    private PackagePlanService packagePlanService;

    @Override
    public R batchCreate(RedeemCodeBatchDto dto) {
        PackagePlan packagePlan = packagePlanService.getById(dto.getPackageId());
        if (packagePlan == null) {
            return R.err(ERROR_PACKAGE_NOT_FOUND);
        }

        // 去重、去空白
        Set<String> uniqueCodes = new HashSet<>();
        for (String raw : dto.getCodes()) {
            String code = raw.trim();
            if (StringUtils.isNotBlank(code)) {
                uniqueCodes.add(code);
            }
        }
        if (uniqueCodes.isEmpty()) {
            return R.err("兑换代码不能为空");
        }

        // 检查是否与已存在的代码冲突
        long existCount = this.count(new QueryWrapper<RedeemCode>().in("code", uniqueCodes));
        if (existCount > 0) {
            return R.err("存在重复的兑换代码，请检查后重试");
        }

        long currentTime = System.currentTimeMillis();
        List<RedeemCode> toCreate = new ArrayList<>();
        for (String code : uniqueCodes) {
            RedeemCode redeemCode = new RedeemCode();
            redeemCode.setCode(code);
            redeemCode.setPackageId(dto.getPackageId());
            redeemCode.setDiscountRatio(dto.getDiscountRatio());
            redeemCode.setUsesRemaining(dto.getUsesRemaining());
            redeemCode.setCreatedTime(currentTime);
            redeemCode.setUpdatedTime(currentTime);
            redeemCode.setStatus(1);
            toCreate.add(redeemCode);
        }

        boolean result = this.saveBatch(toCreate);
        return result ? R.ok() : R.err(ERROR_CREATE_FAILED);
    }

    @Override
    public R getAllRedeemCodes() {
        List<RedeemCode> codes = this.list(new QueryWrapper<RedeemCode>().orderByDesc("created_time"));

        Set<Long> packageIds = codes.stream().map(RedeemCode::getPackageId).collect(Collectors.toSet());
        Map<Long, String> packageNameMap = new HashMap<>();
        for (Long packageId : packageIds) {
            PackagePlan packagePlan = packagePlanService.getById(packageId);
            if (packagePlan != null) {
                packageNameMap.put(packageId, packagePlan.getName());
            }
        }

        List<Map<String, Object>> result = codes.stream().map(redeemCode -> {
            Map<String, Object> item = new HashMap<>();
            item.put("id", redeemCode.getId());
            item.put("code", redeemCode.getCode());
            item.put("packageId", redeemCode.getPackageId());
            item.put("packageName", packageNameMap.getOrDefault(redeemCode.getPackageId(), "未知套餐"));
            item.put("discountRatio", redeemCode.getDiscountRatio());
            item.put("usesRemaining", redeemCode.getUsesRemaining());
            return item;
        }).collect(Collectors.toList());

        return R.ok(result);
    }

    @Override
    public R deleteRedeemCode(Long id) {
        RedeemCode redeemCode = this.getById(id);
        if (redeemCode == null) {
            return R.err(ERROR_NOT_FOUND);
        }
        boolean result = this.removeById(id);
        return result ? R.ok("删除成功") : R.err("删除失败");
    }

    @Override
    public RedeemCode validateRedeemCode(String code, Long packageId) {
        RedeemCode redeemCode = this.getOne(new QueryWrapper<RedeemCode>().eq("code", code.trim()));
        if (redeemCode == null) {
            return null;
        }
        if (!redeemCode.getPackageId().equals(packageId)) {
            return null;
        }
        if (redeemCode.getUsesRemaining() == null || redeemCode.getUsesRemaining() <= 0) {
            return null;
        }
        return redeemCode;
    }

    @Override
    public RedeemCode findByCode(String code) {
        if (StringUtils.isBlank(code)) {
            return null;
        }
        return this.getOne(new QueryWrapper<RedeemCode>().eq("code", code.trim()));
    }

    @Override
    public boolean consumeRedeemCode(Long id) {
        // 原子扣减剩余次数，避免并发重复使用
        return this.update(new UpdateWrapper<RedeemCode>()
                .eq("id", id)
                .gt("uses_remaining", 0)
                .setSql("uses_remaining = uses_remaining - 1"));
    }
}
