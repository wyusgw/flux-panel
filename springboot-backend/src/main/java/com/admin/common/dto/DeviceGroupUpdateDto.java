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

    private Long userGroupId;

    private BigDecimal ratio;

    private Integer hideInProbe;

    private String remark;

    private Integer sort;

    /**
     * 链式出口配置：direction = "chain" 时必填，最多 3 跳，列表顺序即为跳序号
     */
    @Valid
    private List<DeviceGroupChainHopDto> chainHops;
}
