package com.admin.service;

import com.admin.common.dto.RedeemCodeBatchDto;
import com.admin.common.lang.R;
import com.admin.entity.RedeemCode;
import com.baomidou.mybatisplus.extension.service.IService;

public interface RedeemCodeService extends IService<RedeemCode> {

    R batchCreate(RedeemCodeBatchDto dto);

    R getAllRedeemCodes();

    R deleteRedeemCode(Long id);

    /**
     * 校验兑换码是否可用于指定套餐（不消耗次数），可用返回该兑换码，否则返回 null
     * @param code 兑换代码
     * @param packageId 目标套餐ID
     */
    RedeemCode validateRedeemCode(String code, Long packageId);

    /**
     * 仅根据兑换码本身查找（不校验套餐、不校验剩余次数），找不到返回 null
     * @param code 兑换代码
     */
    RedeemCode findByCode(String code);

    /**
     * 原子占用一次兑换码（用于购买套餐结算时），成功返回 true
     * @param id 兑换码ID
     */
    boolean consumeRedeemCode(Long id);
}
