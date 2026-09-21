package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;

/**
 * <p>
 * 订单（套餐购买 / 钱包变动记录）
 * </p>
 *
 * @author QAQ
 * @since 2026-09-21
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("orders")
public class Order extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private String orderNo;

    private Long userId;

    private String userName;

    /**
     * 订单类型（package-购买套餐，recharge-钱包充值）
     */
    private String type;

    private Long packageId;

    /**
     * 使用的兑换码（未使用为空）
     */
    private String redeemCode;

    /**
     * 充值使用的支付渠道ID（对应 payment_config_json 中的渠道 id，非充值订单为空）
     */
    private String channelId;

    /**
     * 支付网关返回的交易号（充值订单专用）
     */
    private String tradeNo;

    private String info;

    /**
     * 金额（元，正数为消费/负数为退款等）
     */
    private BigDecimal amount;

    /**
     * 订单状态（0-待支付，1-已完成，2-已失败/已取消）
     */
    private Integer orderStatus;

    private Long paidTime;
}
