package com.admin.common.dto;

import lombok.Data;

import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;

@Data
public class DeviceGroupUpdateDto {

    @NotNull(message = "设备组ID不能为空")
    private Long id;

    @NotBlank(message = "设备组名称不能为空")
    private String name;

    /**
     * 所属节点：链式出口设备组（direction = "chain"）没有自己的物理节点，可为空；
     * 其余类型必须指定，由服务层校验。
     */
    private Long nodeId;

    private String direction;

    /**
     * 出口协议类型（TLS/WSS/TCP/MTLS/MWSS/MTCP），仅 direction 为 outbound/both 时有意义，
     * 为空时服务层默认按 "tls" 处理
     */
    private String protocol;

    /**
     * 可见用户组ID列表（为空表示所有用户可见）
     */
    private List<Long> userGroupIds;

    private BigDecimal ratio;

    private Integer hideInProbe;

    private String remark;

    private Integer sort;

    /**
     * 限制出口：允许使用的出口设备组 ID（英文逗号分隔），为空表示不限制；仅入口类设备组有效
     */
    private String allowedOutGroupIds;

    /**
     * 限制入口：允许使用的入口设备组 ID（英文逗号分隔），为空表示不限制；仅出口类设备组有效
     */
    private String allowedInGroupIds;

    /**
     * 故障转移组：备用出口设备组 ID，为空或 0 表示无；仅出口类设备组有效
     */
    private Long failoverGroupId;

    /**
     * UDP 源进源出：开启后入口的 UDP 服务监听每个网卡的 IP 地址；仅入口类设备组有效
     */
    private Boolean udpSourceInOut;

    /**
     * 直接转发 / 入口直出策略：0-禁止，1-可选（默认），2-强制；仅入口类设备组有效
     */
    private Integer directForwardMode;

    /**
     * 链式出口配置：direction = "chain" 时必填，最多 3 跳，列表顺序即为跳序号
     */
    @Valid
    private List<DeviceGroupChainHopDto> chainHops;
}
