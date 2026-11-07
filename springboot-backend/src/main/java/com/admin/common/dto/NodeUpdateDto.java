package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Max;
import javax.validation.constraints.Min;
import java.util.List;

@Data
public class NodeUpdateDto {

    @NotNull(message = "节点ID不能为空")
    private Long id;

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

    private Integer http;
    private Integer tls;
    private Integer socks;
    private Integer ss;

    /** 该节点所属的节点组ID列表；不传（null）表示不修改现有归属，传空数组表示清空归属 */
    private List<Long> nodeGroupIds;
} 