package com.admin.entity;

import java.io.Serializable;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * <p>
 * 
 * </p>
 *
 * @author QAQ
 * @since 2025-06-03
 */
@Data
@EqualsAndHashCode(callSuper = false)
public class Forward extends BaseEntity{

    private static final long serialVersionUID = 1L;

    private Integer userId;

    private String userName;

    private String name;

    private Integer tunnelId;

    private Integer inPort;

    private Integer outPort;

    private String remoteAddr;

    private String interfaceName;

    private String strategy;

    private Long inFlow;

    private Long outFlow;

    private Integer inx;

    /**
     * 分组ID（未分组为空）
     */
    private Long groupId;

    /**
     * 接受 Proxy Protocol（0-关闭，1-开启 TCP）
     */
    private Integer acceptProxyProtocol;

    /**
     * 发送 Proxy Protocol（0-关闭，1-v1 TCP，2-v2 TCP，3-v2 TCP+UDP）
     */
    private Integer sendProxyProtocol;

    /**
     * 单 IP 连接数限制（0 为不限制）
     */
    private Integer ipLimit;

    /**
     * 总连接数限制（0 为不限制）
     */
    private Integer connLimit;

    /**
     * 入口设备组ID（与 tunnelId 二选一：指定后台自动解析/创建对应隧道）
     */
    private Long inDeviceGroupId;

    /**
     * 出口设备组ID（可为空，表示直接端口转发，不经过出口设备）
     */
    private Long outDeviceGroupId;

    /**
     * 规则限速（Mbps，0 为不限速；与套餐用户限速、管理员指派的限速取较严格值）
     */
    private Integer speedLimit;

}
