package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import java.math.BigDecimal;

@Data
public class RechargeDto {

    @NotNull(message = "充值金额不能为空")
    private BigDecimal amount;

    @NotBlank(message = "请选择支付渠道")
    private String channelId;

    /** 付款方式（alipay-支付宝，wxpay-微信支付，qqpay-QQ钱包），留空使用渠道允许的第一种 */
    private String payType;
}
