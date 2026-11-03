package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;

/**
 * <p>
 * 套餐
 * </p>
 *
 * @author QAQ
 * @since 2026-09-21
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("package_plan")
public class PackagePlan extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private String name;

    /**
     * 套餐类型（normal-普通套餐）
     */
    private String type;

    /**
     * 购买后分配的用户组ID
     */
    private Long groupId;

    /**
     * 可用流量（GiB，0 为不限流量）
     */
    private Long traffic;

    /**
     * 有效天数（0 或空为永久有效）
     */
    private Integer durationDays;

    /**
     * 规则数（0 为不限规则数）
     */
    private Integer maxRules;

    /**
     * 价格（元，0 为免费）
     */
    private BigDecimal price;

    /**
     * 是否在商城隐藏（0-显示，1-隐藏）
     */
    private Integer hidden;

    private Integer sort;

    /**
     * 套餐用户限速（Mbps，0 为不限速；与转发规则限速、管理员指派的限速取较严格值）
     */
    private Integer userSpeedLimit;

    /**
     * 套餐流量重置日（-1 沿用用户当前的重置设置，0 不重置，1-31 每月第几日重置）；
     * 用户购买/续费该套餐时，非 -1 的值会写入用户的流量重置日
     */
    private Long flowResetTime;

    /**
     * 套餐流量重置时刻（HH:mm，默认 00:00），与 flowResetTime 配合使用
     */
    private String flowResetClock;
}
