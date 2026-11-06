package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.Min;
import java.math.BigDecimal;

@Data
public class UserUpdateDto {

    @NotNull(message = "用户ID不能为空")
    private Long id;

    @NotBlank(message = "用户名不能为空")
    private String user;

    private String pwd; // 更新时密码可选

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

    /**
     * 流量重置时刻（HH:mm），留空按 00:00 处理
     */
    @Pattern(regexp = "^$|^([01]\\d|2[0-3]):[0-5]\\d$", message = "流量重置时刻格式应为 HH:mm")
    private String flowResetClock;

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

    /**
     * 演示模式（0-关闭，1-开启）：只有管理员才能开启，开启后是演示管理员，只读且敏感数据打码
     */
    private Integer demoMode;

    /**
     * 是否管理员。不传时编辑用户不改变角色；取消管理员时演示模式一起关闭
     */
    private Boolean admin;

    /**
     * 备注
     */
    @javax.validation.constraints.Size(max = 500, message = "备注不能超过500个字符")
    private String remark;
} 