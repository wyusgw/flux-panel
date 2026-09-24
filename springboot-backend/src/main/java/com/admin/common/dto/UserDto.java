package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Min;
import java.math.BigDecimal;

@Data
public class UserDto {

    @NotBlank(message = "用户名不能为空")
    private String user;

    @NotBlank(message = "密码不能为空")
    private String pwd;

    @NotNull(message = "流量不能为空")
    @Min(value = 0, message = "流量不能小于0")
    private Long flow;

    @NotNull(message = "转发数量不能为空")
    @Min(value = 0, message = "转发数量不能小于0")
    private Integer num;

    /**
     * 到期时间（时间戳）。留空表示永不过期
     */
    private Long expTime;

    @NotNull(message = "流量重置时间不能为空")
    private Long flowResetTime;

    private Integer status;

    /**
     * 用户组ID
     */
    private Long groupId;

    /**
     * 套餐ID
     */
    private Long packageId;

    /**
     * 钱包余额（元）
     */
    private BigDecimal walletBalance;

    /**
     * 自动续费（0-关闭，1-开启）
     */
    private Integer autoRenew;
} 