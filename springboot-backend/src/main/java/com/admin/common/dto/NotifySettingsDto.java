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

    /** 设备离线与恢复推送模式（0-不接收，1-白名单，2-黑名单） */
    private Integer deviceMode;

    /** 设备离线推送范围（设备组ID，仅白名单/黑名单模式下生效） */
    private List<Long> deviceGroupIds;
}
