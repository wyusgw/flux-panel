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

    /**
     * 可用节点组：英文逗号分隔的节点组 ID。设置后该组的普通用户只能使用节点属于这些节点组的设备组（见 NodeGroupScope），
     * 空串或空表示不限制。不用 IGNORED 更新策略：排序等只带部分字段的更新不能把它清掉
     */
    private String nodeGroupIds;
}
