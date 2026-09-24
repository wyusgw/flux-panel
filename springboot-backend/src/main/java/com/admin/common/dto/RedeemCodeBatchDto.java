package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotEmpty;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Max;
import javax.validation.constraints.Min;

import java.math.BigDecimal;
import java.util.List;

/**
 * 批量创建兑换码。packageId/discountRatio/amount 是否必填取决于 type：
 * discount 需要 packageId+discountRatio；package 只需要 packageId；balance 只需要 amount。
 * 具体按类型的校验在 Service 层完成，此处不加 @NotNull，避免不同类型互相挡校验。
 */
@Data
public class RedeemCodeBatchDto {

    /**
     * 兑换类型：discount-折扣购买套餐，package-免费兑换套餐，balance-兑换钱包余额。为空时按 discount 处理（兼容旧调用）
     */
    private String type;

    private Long packageId;

    @Min(value = 1, message = "折扣比例需在1-100之间")
    @Max(value = 100, message = "折扣比例需在1-100之间")
    private Integer discountRatio;

    private BigDecimal amount;

    @NotNull(message = "可用次数不能为空")
    @Min(value = 1, message = "可用次数至少为1")
    private Integer usesRemaining;

    @NotEmpty(message = "兑换代码不能为空")
    private List<String> codes;
}
