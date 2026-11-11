package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Max;
import javax.validation.constraints.Min;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Pattern;

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
     * 时长倍数：月付为月数，日付为天数；不限时流量包不使用
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

    /**
     * 套餐流量重置日（-1 沿用用户当前设置，0 不重置，1-31 每月第几日）
     */
    @Min(value = -1, message = "流量重置日不合法")
    @Max(value = 31, message = "流量重置日不合法")
    private Long flowResetTime;

    /**
     * 套餐流量重置时刻（HH:mm），留空按 00:00 处理
     */
    @Pattern(regexp = "^$|^([01]\\d|2[0-3]):[0-5]\\d$", message = "流量重置时刻格式应为 HH:mm")
    private String flowResetClock;
}
