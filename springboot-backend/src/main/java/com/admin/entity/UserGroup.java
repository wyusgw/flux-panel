package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * <p>
 * 用户组
 * </p>
 *
 * @author QAQ
 * @since 2026-09-21
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class UserGroup extends BaseEntity {

    private static final long serialVersionUID = 1L;

    /**
     * 用户组ID（可手动指定，留空自动生成）
     */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private String name;

    private Integer sort;
}
