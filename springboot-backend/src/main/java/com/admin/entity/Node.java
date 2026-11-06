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

    /** 该节点所属的节点组ID列表（多对多，非持久化字段，通过 node_group_relation 表维护） */
    @TableField(exist = false)
    private List<Long> nodeGroupIds;

}
