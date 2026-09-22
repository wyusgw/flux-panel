package com.admin.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

/**
 * 系统信息DTO
 * 对应Go客户端上报的系统信息结构
 */
@Data
public class SystemInfoDto {
    
    /**
     * 主机IP地址
     */
    @JsonProperty("host_ip")
    private String hostIp;
    
    /**
     * 开机时间（秒）
     */
    @JsonProperty("uptime")
    private Long uptime;
    
    /**
     * 接收字节数
     */
    @JsonProperty("bytes_received")
    private Long bytesReceived;
    
    /**
     * 发送字节数
     */
    @JsonProperty("bytes_transmitted")
    private Long bytesTransmitted;
    
    /**
     * CPU使用率（百分比）
     */
    @JsonProperty("cpu_usage")
    private Double cpuUsage;

    @JsonProperty("cpu_model")
    private String cpuModel;
    
    /**
     * 内存使用率（百分比）
     */
    @JsonProperty("memory_usage")
    private Double memoryUsage;

    @JsonProperty("memory_total")
    private Long memoryTotal;

    @JsonProperty("memory_used")
    private Long memoryUsed;

    @JsonProperty("memory_available")
    private Long memoryAvailable;

    /**
     * 根文件系统使用率（百分比）
     */
    @JsonProperty("storage_usage")
    private Double storageUsage;

    @JsonProperty("storage_total")
    private Long storageTotal;

    @JsonProperty("storage_used")
    private Long storageUsed;

    @JsonProperty("storage_free")
    private Long storageFree;
    
    /**
     * 上报时间戳
     */
    private Long timestamp;
    
    public SystemInfoDto() {
        this.timestamp = System.currentTimeMillis();
    }
} 
