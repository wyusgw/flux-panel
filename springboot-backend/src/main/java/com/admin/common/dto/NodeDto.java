package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Max;
import javax.validation.constraints.Min;
import java.util.List;

@Data
public class NodeDto {

    @NotBlank(message = "节点名称不能为空")
    private String name;

    /** 连接地址，留空时默认使用 serverIp */
    private String ip;

    /** 仅监控设备可以留空，其他类型在 NodeServiceImpl、DeviceGroupServiceImpl 中按设备组类型校验 */
    private String serverIp;

    @NotNull(message = "起始端口不能为空")
    @Min(value = 1, message = "起始端口必须大于0")
    @Max(value = 65535, message = "起始端口不能超过65535")
    private Integer portSta;

    @NotNull(message = "结束端口不能为空")
    @Min(value = 1, message = "结束端口必须大于0")
    @Max(value = 65535, message = "结束端口不能超过65535")
    private Integer portEnd;

    /** 该节点所属的节点组ID列表，为空表示不属于任何节点组 */
    private List<Long> nodeGroupIds;
} 