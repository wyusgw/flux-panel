package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotNull;

/**
 * 链式出口设备组的一跳（提交顺序即为跳序号，从 1 开始）
 */
@Data
public class DeviceGroupChainHopDto {

    @NotNull(message = "每一跳都必须选择出口设备组")
    private Long targetDeviceGroupId;

    /** 该跳是否启用 Mux 复用 */
    private Boolean mux;
}
