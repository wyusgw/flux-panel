package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;

/**
 * <p>
 * 兑换码：折扣购买套餐 / 免费兑换套餐 / 兑换钱包余额
 * </p>
 *
 * @author QAQ
 * @since 2026-09-21
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("redeem_code")
public class RedeemCode extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private String code;

    /**
     * 兑换类型：discount-折扣购买套餐，package-免费兑换套餐，balance-兑换钱包余额
     */
    private String type;

    /**
     * 关联套餐（discount / package 类型必填，balance 类型为空）
     */
    private Long packageId;

    /**
     * 折扣比例（1-100，购买时按此比例支付，如 80 表示支付原价的 80%；package 类型固定为 0，即免费）
     */
    private Integer discountRatio;

    /**
     * 兑换到账金额（元，仅 balance 类型使用）
     */
    private BigDecimal amount;

    /**
     * 剩余可用次数
     */
    private Integer usesRemaining;
}
