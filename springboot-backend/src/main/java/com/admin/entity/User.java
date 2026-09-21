package com.admin.entity;


import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;

/**
 * <p>
 * 
 * </p>
 *
 * @author QAQ
 * @since 2025-06-03
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class User extends BaseEntity {

    private static final long serialVersionUID = 1L;

    /**
     * 主键ID
     */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 创建时间（时间戳）
     */
    private Long createdTime;

    /**
     * 更新时间（时间戳）
     */
    private Long updatedTime;

    /**
     * 状态（0：正常，1：删除）
     */
    private Integer status;

    private String user;

    private String pwd;

    private Integer roleId;

    private Long expTime;

    private Long flow;

    private Long inFlow;

    private Long outFlow;

    private Integer num;

    private Long flowResetTime;

    /**
     * 用户组ID（#0 为默认未分组）
     */
    private Long groupId;

    /**
     * 当前套餐ID（未购买套餐时为空）
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
     * 已绑定的 Telegram chat id（未绑定为空）
     */
    private String telegramChatId;

    /**
     * 待验证的 Telegram 绑定码（绑定成功后清空）
     */
    private String telegramBindCode;

    /**
     * 绑定码生成时间（时间戳，超过有效期后失效）
     */
    private Long telegramBindTime;

    /**
     * 收款信息推送模式（0-不接收，1-接收）
     */
    private Integer notifyPaymentMode;

    /**
     * 设备离线与恢复推送模式（0-不接收，1-白名单，2-黑名单）
     */
    private Integer notifyDeviceMode;

    /**
     * 设备离线推送范围（设备组ID的JSON数组，仅在白名单/黑名单模式下生效）
     */
    private String notifyDeviceGroups;

    /**
     * 上次收到到期/流量提醒推送的日期（yyyy-MM-dd），用于每日去重
     */
    private String telegramLastReminderDate;

}
