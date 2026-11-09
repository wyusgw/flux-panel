package com.admin.entity;

import java.io.Serializable;
import java.math.BigDecimal;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * <p>
 * 隧道实体类
 * </p>
 *
 * @author QAQ
 * @since 2025-06-03
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class Tunnel extends BaseEntity {

    private static final long serialVersionUID = 1L;

    /**
     * 隧道名称
     */
    private String name;

    /**
     * 入口节点ID
     */
    private Long inNodeId;

    /**
     * 入口IP (兼容字段)
     */
    private String inIp;

    /**
     * 出口节点ID
     */
    private Long outNodeId;

    /**
     * 出口IP (兼容字段)
     */
    private String outIp;

    /**
     * 隧道类型（1-端口转发，2-隧道转发）
     */
    private Integer type;

    /**
     * 流量计算类型（1 单向计算上传。2 双向）
     */
    private int flow;

    /**
     * 协议类型
     */
    private String protocol;

    /**
     * 流量倍率
     */
    private BigDecimal trafficRatio;


    private String tcpListenAddr;

    private String udpListenAddr;

    /**
     * UDP 源进源出（非持久化）：由入口设备组的设置带入，下发 UDP 服务时写入监听器元数据
     */
    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private Boolean udpSourceInOut;

    /**
     * 故障转移（非持久化）：备用出口节点 ID 及其连接地址（serverIp），按优先级排列，两个列表等长。
     * 只有设备组模式的转发才会有；为空表示没有备用出口
     */
    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private java.util.List<Long> backupOutNodeIds;

    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private java.util.List<String> backupOutIps;

    private String interfaceName;

    /**
     * 是否为转发规则（入口/出口设备组模式）自动创建的隧道（0-否，1-是）。
     * 自动创建的隧道仅供内部复用，不在"隧道管理"列表中展示。
     */
    private Integer isAuto;
}
