package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

/**
 * <p>
 * 单端隧道：普通用户自建设备组（入口或出口）的创建参数。相比管理员的 DeviceGroupDto 做了大幅裁剪——
 * 不允许指定 userGroupId/ratio/hideInProbe/链式出口 等管理专属字段，direction 也只允许 inbound/outbound。
 * </p>
 *
 * @author QAQ
 * @since 2026-09-24
 */
@Data
public class UserDeviceGroupDto {

    @NotBlank(message = "设备组名称不能为空")
    private String name;

    /**
     * 仅允许 inbound（入口）或 outbound（出口）
     */
    @NotBlank(message = "请选择入口或出口")
    private String direction;

    @NotBlank(message = "服务器 IP / 域名不能为空")
    private String serverIp;

    @NotBlank(message = "入口 IP / 域名不能为空")
    private String entryIp;

    private Integer portSta;

    private Integer portEnd;

    /**
     * 出口协议类型（TLS/WSS/TCP/MTLS/MWSS/MTCP），仅 direction=outbound 时有意义，为空时默认 tls
     */
    private String protocol;

    /**
     * 是否开放给其他用户在添加转发规则时选用（false-仅自己可用，true-所有用户可用）
     */
    private boolean shared;
}
