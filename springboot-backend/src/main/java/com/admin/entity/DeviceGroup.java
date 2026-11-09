package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.util.List;

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

    /** 设备角色：inbound-入口，outbound-出口，monitor-仅监控，both-入口＋出口，chain-链式出口 */
    private String direction;

    /**
     * 出口协议类型（TLS/WSS/TCP/MTLS/MWSS/MTCP），仅 direction 为 outbound/both 时有意义
     */
    private String protocol;

    /**
     * 可见用户组ID列表（多对多，非持久化字段，通过 device_group_user_group_relation 表维护；
     * 为空表示所有用户可见）
     */
    @TableField(exist = false)
    private List<Long> userGroupIds;

    /**
     * 限制出口：允许搭配本入口使用的出口设备组 ID，英文逗号分隔；为空表示不限制。
     * 仅 direction 为 inbound/both 时有意义
     */
    private String allowedOutGroupIds;

    /**
     * 限制入口：允许搭配本出口使用的入口设备组 ID，英文逗号分隔；为空表示不限制。
     * 仅 direction 为 outbound/both 时有意义
     */
    private String allowedInGroupIds;

    /**
     * 故障转移组：本出口故障时切换到的备用出口设备组 ID；为空（或 0）表示无。
     * 仅 direction 为 outbound/both 时有意义。设备组模式的转发规则创建/更新时，沿着它依次解析出备用出口（最多 3 个），
     * 入口节点的链里放多个出口节点，按 fifo 优先主出口，连接失败后自动切到备用出口
     */
    private Long failoverGroupId;

    /**
     * UDP 源进源出（0-关闭，1-开启）：开启后入口的 UDP 服务改为监听每个网卡的 IP 地址，
     * 回包从收到请求的同一个 IP 发出；仅 direction 为 inbound/both 时有意义
     */
    private Integer udpSourceInOut;

    /**
     * 直接转发 / 入口直出策略（仅入口类设备组有意义）：0-禁止直接转发（必须选择出口），
     * 1-可选直接转发（出口可选，默认，与旧版行为一致），2-强制直接转发（不能选择出口）
     */
    private Integer directForwardMode;

    /**
     * 单端隧道：用户自建设备组的拥有者用户ID；管理员建立的设备组此字段为空
     */
    private Long ownerUserId;

    /**
     * 单端隧道：该设备所属的单端组（用户自建设备时选择），管理员建立的设备组此字段为空
     */
    private Long singleTunnelGroupId;

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

    /**
     * 高级编辑保存的 JSON 配置；目前只做保存和展示，节点和转发都不读取
     */
    private String config;

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
