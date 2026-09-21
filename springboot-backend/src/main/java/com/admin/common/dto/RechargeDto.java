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
}
