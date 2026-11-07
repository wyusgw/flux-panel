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

    /** 未停用 */
    public static final int DISABLE_REASON_NONE = 0;
    /** 管理员禁用：只能由管理员解除 */
    public static final int DISABLE_REASON_MANUAL = 1;
    /** 账号到期：续费或购买套餐后自动恢复，也允许登录以便续费 */
    public static final int DISABLE_REASON_EXPIRED = 2;

    /** 停用原因，见 DISABLE_REASON_* */
    private Integer disableReason;

    /** 是否因账号到期被停用；管理员禁用或没有原因的旧数据都返回 false，不会被自动解除 */
    public static boolean disabledByExpiry(User user) {
        return user != null && Integer.valueOf(0).equals(user.getStatus())
                && Integer.valueOf(DISABLE_REASON_EXPIRED).equals(user.getDisableReason());
    }

    /** 是否被管理员禁用；没有原因的旧数据也按此处理，避免误解封 */
    public static boolean disabledByAdmin(User user) {
        return user != null && Integer.valueOf(0).equals(user.getStatus()) && !disabledByExpiry(user);
    }

    /** 管理员保存用户时的停用原因：解除停用时清空，新禁用记为管理员禁用，状态没变则保留原因 */
    public static int resolveDisableReason(Integer oldStatus, Integer oldReason, int newStatus) {
        if (newStatus != 0) {
            return DISABLE_REASON_NONE;
        }
        if (!Integer.valueOf(0).equals(oldStatus) || oldReason == null || oldReason == DISABLE_REASON_NONE) {
            return DISABLE_REASON_MANUAL;
        }
        return oldReason;
    }

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
     * 流量重置时刻（HH:mm，默认 00:00），与 flowResetTime（每月第几日）配合使用
     */
    private String flowResetClock;

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
     * 演示模式（0-关闭，1-开启）：只有管理员才能开启，开启后是演示管理员，只读且敏感数据打码
     */
    private Integer demoMode;

    /**
     * 演示账号可编辑的区域（逗号分隔，见 DemoArea）
     */
    private String demoAreas;

    /**
     * 演示账号每天恢复的时刻（HH:mm，服务器时区），null 表示不自动恢复
     */
    private String demoRestoreTime;

    /**
     * 账号能使用的页面（逗号分隔，见 MenuPermission），null 表示该角色的全部页面
     */
    private String menuPermissions;

    /**
     * 管理员给用户写的备注
     */
    private String remark;

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
     * 设备离线与恢复推送模式（0-不接收，1-白名单，2-黑名单，3-全部接收）
     */
    private Integer notifyDeviceMode;

    /**
     * 设备离线推送范围（设备组ID的JSON数组，仅在白名单/黑名单模式下生效）
     */
    private String notifyDeviceGroups;

    /**
     * 自动续费成功/失败推送模式（0-不接收，1-接收）
     */
    private Integer notifyRenewMode;

    /**
     * 套餐到期提醒推送模式（0-不接收，1-接收）
     */
    private Integer notifyExpiryMode;

    /**
     * 流量即将用尽提醒推送模式（0-不接收，1-接收）
     */
    private Integer notifyFlowMode;

    /**
     * 上次收到到期提醒推送的日期（yyyy-MM-dd），用于每日去重
     */
    private String telegramLastExpiryReminderDate;

    /**
     * 上次收到流量提醒推送的日期（yyyy-MM-dd），用于每日去重
     */
    private String telegramLastFlowReminderDate;

}
