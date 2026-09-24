package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * <p>
 * 链式出口设备组（{@link DeviceGroup#getDirection()} = "chain"）的一跳。
 * 每一跳复用一个已存在的、direction = "outbound" 的设备组作为中继节点，
 * 按 hopOrder 从 1 开始依次连接，最后一跳的中继节点负责把流量转发到转发规则的真实目标地址。
 * </p>
 *
 * @author QAQ
 * @since 2026-09-23
 */
@Data
@TableName("device_group_chain_hop")
public class DeviceGroupChainHop implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /** 所属的链式出口设备组ID */
    private Long deviceGroupId;

    /** 跳序号，从 1 开始 */
    private Integer hopOrder;

    /** 该跳使用的出口设备组ID（必须是 direction = "outbound" 的设备组） */
    private Long targetDeviceGroupId;

    /** 该跳的连接是否启用 Mux 复用（0-关闭，1-开启） */
    private Integer mux;

    private Long createdTime;
}
