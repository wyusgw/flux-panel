package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

/**
 * <p>
 * Looking Glass 网络诊断请求参数：从指定节点对目标地址发起 ping（TCP 连通性）或 traceroute
 * </p>
 *
 * @author QAQ
 * @since 2026-09-27
 */
@Data
public class LookingGlassRequestDto {

    @NotNull(message = "请选择节点")
    private Long nodeId;

    /** ping 或 traceroute */
    @NotBlank(message = "请选择诊断类型")
    private String type;

    /** ping 支持 host:port（不带端口默认 80）；traceroute 只需要主机名/IP */
    @NotBlank(message = "请输入目标地址")
    private String target;
}
