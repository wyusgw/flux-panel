package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * <p>
 * 节点组：对节点进行分类，用于分配哪些节点可被套餐/用户组使用
 * </p>
 *
 * @author QAQ
 * @since 2026-09-27
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class NodeGroup extends BaseEntity {

    private static final long serialVersionUID = 1L;

    /**
     * 节点组ID（可手动指定，留空自动生成）
     */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private String name;

    private Integer sort;
}
