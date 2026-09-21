package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * <p>
 * 转发规则分组
 * </p>
 *
 * @author QAQ
 * @since 2026-09-21
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class ForwardGroup extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private Integer userId;

    private String name;

    private Integer sort;
}
