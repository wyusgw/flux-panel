package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

import java.math.BigDecimal;

@Data
public class DeviceGroupDto {

    @NotBlank(message = "设备组名称不能为空")
    private String name;

    @NotNull(message = "所属节点不能为空")
    private Long nodeId;

    private String direction;

    /**
     * 可见用户组ID（为空表示所有用户可见）
     */
    private Long userGroupId;

    private BigDecimal ratio;

    private Integer hideInProbe;

    private String remark;

    private Integer sort;
}
