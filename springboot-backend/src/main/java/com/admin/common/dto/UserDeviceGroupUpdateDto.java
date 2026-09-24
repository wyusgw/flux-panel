package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

/**
 * <p>
 * 单端隧道：普通用户编辑自己名下设备组的参数。归属校验（是否确实属于当前用户）由服务层完成。
 * </p>
 *
 * @author QAQ
 * @since 2026-09-24
 */
@Data
public class UserDeviceGroupUpdateDto {

    @NotNull(message = "设备组ID不能为空")
    private Long id;

    @NotBlank(message = "设备组名称不能为空")
    private String name;

    @NotBlank(message = "服务器 IP / 域名不能为空")
    private String serverIp;

    @NotBlank(message = "入口 IP / 域名不能为空")
    private String entryIp;

    private Integer portSta;

    private Integer portEnd;

    /**
     * 出口协议类型（TLS/WSS/TCP/MTLS/MWSS/MTCP），仅该设备组是出口时有意义
     */
    private String protocol;

    /**
     * 所属单端组ID（可为空，表示不分组）
     */
    private Long singleTunnelGroupId;

    private boolean shared;
}
