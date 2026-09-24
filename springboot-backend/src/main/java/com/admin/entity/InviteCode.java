package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * <p>
 * 邀请码（注册码）：配合站点设置里的"邀请码注册策略"（disabled/optional/required）使用，
 * 控制新用户注册时是否需要填写有效邀请码
 * </p>
 *
 * @author QAQ
 * @since 2026-09-24
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("invite_code")
public class InviteCode extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private String code;

    /**
     * 剩余可用次数
     */
    private Integer usesRemaining;
}
