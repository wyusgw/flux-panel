package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

import java.math.BigDecimal;

@Data
public class DeviceGroupUpdateDto {

    @NotNull(message = "设备组ID不能为空")
    private Long id;

    @NotBlank(message = "设备组名称不能为空")
    private String name;

    @NotNull(message = "所属节点不能为空")
    private Long nodeId;

    private String direction;

    private Long userGroupId;

    private BigDecimal ratio;

    private Integer hideInProbe;

    private String remark;

    private Integer sort;
}
