package com.admin.common.dto;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import lombok.Data;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Min;
import javax.validation.constraints.Max;

@Data
public class ForwardDto {

    @NotBlank(message = "转发名称不能为空")
    private String name;
    
    // 隧道ID：与 inDeviceGroupId 二选一（提供入口/出口设备组时，由后台自动解析/创建隧道）
    private Integer tunnelId;

    @NotBlank(message = "远程地址不能为空")
    private String remoteAddr;

    private String strategy;
    
    /**
     * 入口端口（可选，为空时自动分配）
     */
    @Min(value = 1, message = "端口号不能小于1")
    @Max(value = 65535, message = "端口号不能大于65535")
    private Integer inPort;

    private String interfaceName;

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
     * 入口设备组ID（与 tunnelId 二选一）
     */
    private Long inDeviceGroupId;

    /**
     * 出口设备组ID（可为空，表示直接端口转发）
     */
    private Long outDeviceGroupId;

    /**
     * 规则限速（Mbps，0 为不限速）
     */
    private Integer speedLimit;

}
