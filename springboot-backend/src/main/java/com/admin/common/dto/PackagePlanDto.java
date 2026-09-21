package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

import java.math.BigDecimal;

@Data
public class PackagePlanDto {

    @NotBlank(message = "套餐名称不能为空")
    private String name;

    private String type;

    @NotNull(message = "分配用户组不能为空")
    private Long groupId;

    @NotNull(message = "可用流量不能为空")
    private Long traffic;

    /**
     * 有效天数（0 或空为永久有效）
     */
    private Integer durationDays;

    @NotNull(message = "规则数不能为空")
    private Integer maxRules;

    @NotNull(message = "价格不能为空")
    private BigDecimal price;

    private Integer hidden;

    private Integer sort;

    /**
     * 套餐用户限速（Mbps，0 为不限速）
     */
    private Integer userSpeedLimit;
}
