package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;

/**
 * <p>
 * 设备组：转发规则的入口/出口，绑定到具体节点，并通过用户组控制可见范围
 * </p>
 *
 * @author QAQ
 * @since 2026-09-21
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("device_group")
public class DeviceGroup extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private String name;

    /**
     * 所属节点（实际承载连接的物理节点）
     */
    private Long nodeId;

    /** 设备角色：inbound-入口，outbound-出口 */
    private String direction;

    /**
     * 出口协议类型（TLS/WSS/TCP/MTLS/MWSS/MTCP），仅 direction 为 outbound/both 时有意义
     */
    private String protocol;

    /**
     * 可见用户组ID（为空表示所有用户可见）
     */
    private Long userGroupId;

    /**
     * 单端隧道：用户自建设备组的拥有者用户ID；管理员建立的设备组此字段为空
     */
    private Long ownerUserId;

    /**
     * 单端隧道：该设备所属的单端组（用户自建设备时选择），管理员建立的设备组此字段为空
     */
    private Long singleTunnelGroupId;

    /**
     * 仅 ownerUserId 非空时有意义：0-仅拥有者自己可用，1-开放给所有用户在添加转发规则时选用
     */
    private Integer shared;

    /**
     * 流量倍率
     */
    private BigDecimal ratio;

    /**
     * 在探针中隐藏（0-不隐藏，1-对非管理员用户隐藏，2-对所有用户隐藏）
     */
    private Integer hideInProbe;

    /**
     * 备注（仅管理员可见）
     */
    private String remark;

    private Integer sort;

    /**
     * 是否启用自定义设备离线宽限期（0-关闭，1-开启；关闭时继承全局默认设置）
     */
    private Integer offlineGraceEnabled;

    /** 自定义设备离线宽限期（秒） */
    private Integer offlineGraceSeconds;

    /**
     * 是否启用自定义设备离线保留期（0-关闭，1-开启；关闭时继承全局默认设置）
     */
    private Integer offlineRetainEnabled;

    /** 自定义设备离线保留期（秒） */
    private Integer offlineRetainSeconds;
}
