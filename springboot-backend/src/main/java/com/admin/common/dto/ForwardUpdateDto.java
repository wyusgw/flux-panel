package com.admin.common.dto;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import lombok.Data;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Min;
import javax.validation.constraints.Max;

@Data
public class ForwardUpdateDto {
    
    @NotNull(message = "ID不能为空")
    private Long id;
    
    @NotNull(message = "用户ID不能为空")
    private Integer userId;
    
    @NotBlank(message = "转发名称不能为空")
    private String name;
    
    // 隧道ID：与 inDeviceGroupId 二选一
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

    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private String interfaceName;

    /**
     * 分组ID（未分组为空）
     */
    @TableField(updateStrategy = FieldStrategy.IGNORED)
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
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private Long inDeviceGroupId;

    /**
     * 出口设备组ID（可为空）
     */
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private Long outDeviceGroupId;

    /**
     * 规则限速（Mbps，0 为不限速）
     */
    private Integer speedLimit;
}
