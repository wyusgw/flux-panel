package com.admin.common.dto;

import lombok.Data;

import java.util.List;

/**
 * 个人中心「推送设置」请求
 */
@Data
public class NotifySettingsDto {

    /** 收款信息推送模式（0-不接收，1-接收） */
    private Integer paymentMode;

    /** 设备离线与恢复推送模式（0-不接收，1-白名单，2-黑名单，3-全部接收） */
    private Integer deviceMode;

    /** 设备离线推送范围（设备组ID，仅白名单/黑名单模式下生效） */
    private List<Long> deviceGroupIds;

    /** 自动续费成功/失败推送模式（0-不接收，1-接收） */
    private Integer renewMode;

    /** 套餐到期提醒推送模式（0-不接收，1-接收） */
    private Integer expiryMode;

    /** 流量即将用尽提醒推送模式（0-不接收，1-接收） */
    private Integer flowMode;
}
