package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotEmpty;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Max;
import javax.validation.constraints.Min;

import java.util.List;

@Data
public class RedeemCodeBatchDto {

    @NotNull(message = "套餐不能为空")
    private Long packageId;

    @NotNull(message = "折扣比例不能为空")
    @Min(value = 1, message = "折扣比例需在1-100之间")
    @Max(value = 100, message = "折扣比例需在1-100之间")
    private Integer discountRatio;

    @NotNull(message = "可用次数不能为空")
    @Min(value = 1, message = "可用次数至少为1")
    private Integer usesRemaining;

    @NotEmpty(message = "兑换代码不能为空")
    private List<String> codes;
}
