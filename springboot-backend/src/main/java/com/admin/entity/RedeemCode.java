package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * <p>
 * 兑换码：购买指定套餐时使用，享受折扣比例
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

    private Long packageId;

    /**
     * 折扣比例（1-100，购买时按此比例支付，如 80 表示支付原价的 80%）
     */
    private Integer discountRatio;

    /**
     * 剩余可用次数
     */
    private Integer usesRemaining;
}
