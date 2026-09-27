package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * <p>
 * 节点与节点组的多对多关联，一个节点可以同时属于多个节点组
 * </p>
 *
 * @author QAQ
 * @since 2026-09-27
 */
@Data
@TableName("node_group_relation")
public class NodeGroupRelation implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private Long nodeGroupId;

    private Long nodeId;

    private Long createdTime;
}
