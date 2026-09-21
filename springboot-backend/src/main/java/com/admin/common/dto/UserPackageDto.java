package com.admin.common.dto;

import com.admin.entity.StatisticsFlow;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 用户套餐信息DTO
 */
@Data
public class UserPackageDto {
    
    /**
     * 用户基本信息
     */
    private UserInfoDto userInfo;
    
    /**
     * 用户隧道权限列表
     */
    private List<UserTunnelDetailDto> tunnelPermissions;
    
    /**
     * 用户转发列表
     */
    private List<UserForwardDetailDto> forwards;

    /**
     * 用户转发列表
     */
    private List<StatisticsFlow> statisticsFlows;
    
    /**
     * 用户基本信息
     */
    @Data
    public static class UserInfoDto {
        private Long id;
        private String name;
        private String user;
        private Integer status;
        private Long flow;           // 总流量配额(GB)
        private Long inFlow;         // 已用入站流量(字节)
        private Long outFlow;        // 已用出站流量(字节)
        private Integer num;         // 转发数量配额
        private Long expTime;        // 过期时间
        private Long flowResetTime;  // 流量重置时间
        private Long createdTime;
        private Long updatedTime;
        private Long groupId;        // 用户组ID
        private String groupName;    // 用户组名称
        private Long packageId;      // 套餐ID
        private String packageName;  // 套餐名称
        private BigDecimal walletBalance; // 钱包余额
        private Integer autoRenew;   // 自动续费
        private Boolean telegramBound;      // 是否已绑定Telegram
        private Integer notifyPaymentMode;  // 收款信息推送模式（0-不接收，1-接收）
        private Integer notifyDeviceMode;   // 设备离线与恢复推送模式（0-不接收，1-白名单，2-黑名单）
        private List<Long> notifyDeviceGroupIds; // 设备离线推送范围（设备组ID）
    }
    
    /**
     * 用户隧道权限详情
     */
    @Data
    public static class UserTunnelDetailDto {
        private Integer id;
        private Integer userId;
        private Integer tunnelId;
        private String tunnelName;
        private Integer tunnelFlow;  // 隧道流量计算类型（1-单向，2-双向）
        private Long flow;           // 隧道流量配额(GB)
        private Long inFlow;         // 隧道已用入站流量(字节)
        private Long outFlow;        // 隧道已用出站流量(字节)
        private Integer num;         // 隧道转发数量配额
        private Long flowResetTime;  // 流量重置时间
        private Long expTime;        // 隧道权限过期时间
        private Integer speedId;
        private String speedLimitName;
        private Integer speed;
    }
    
    /**
     * 用户转发详情
     */
    @Data
    public static class UserForwardDetailDto {
        private Long id;
        private String name;
        private Integer tunnelId;
        private String tunnelName;
        private String inIp;
        private Integer inPort;
        private String remoteAddr;
        private Long inFlow;         // 转发入站流量(字节)
        private Long outFlow;        // 转发出站流量(字节)
        private Integer status;
        private Long createdTime;
    }
} 