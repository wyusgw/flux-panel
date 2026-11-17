package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableField;

import java.io.Serializable;
import java.util.List;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * <p>
 * 
 * </p>
 *
 * @author QAQ
 * @since 2025-06-03
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class Node extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String name;

    private String secret;

    private String ip;

    private String serverIp;

    private String version;

    private Integer portSta;

    private Integer portEnd;

    private Integer http;

    private Integer tls;

    private Integer socks;

    /** 是否屏蔽 Shadowsocks 等全加密协议：0 否，1 是 */
    private Integer ss;

    /** 节点连接面板使用的 SOCKS5 代理（socks5://[user:pass@]host:port），为空表示直连 */
    private String proxy;

    /** 该节点所属的节点组ID列表（多对多，非持久化字段，通过 node_group_relation 表维护） */
    @TableField(exist = false)
    private List<Long> nodeGroupIds;

    /**
     * 离线前最后一次上报的状态（节点上报的原始 JSON），离线时记录，用于「设备离线保留期」内继续在节点状态页显示。
     * 不直接返回给前端，保留期内才通过 retainedInfo 返回
     */
    @com.fasterxml.jackson.annotation.JsonIgnore
    private String lastInfo;

    /** 最近一次被标记为离线的时间（毫秒），在线时不使用 */
    private Long offlineTime;

    /** 保留期内的最后状态（非持久化，只在节点列表里离线且未过保留期时返回） */
    @TableField(exist = false)
    private String retainedInfo;

    /** 最后状态保留到什么时候（毫秒，非持久化） */
    @TableField(exist = false)
    private Long retainedUntil;

}
