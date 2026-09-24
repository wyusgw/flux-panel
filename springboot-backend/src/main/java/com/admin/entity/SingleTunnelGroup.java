package com.admin.entity;

import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * <p>
 * 单端组：普通用户自己建立、用来给自己的单端隧道设备分组分类，每个用户只能看到/管理自己建立的单端组，
 * 用户之间互不相通（区别于管理员统一管理、控制可见范围的「用户组」）。
 * </p>
 *
 * @author QAQ
 * @since 2026-09-24
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class SingleTunnelGroup extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String name;

    /**
     * 拥有者用户ID：该单端组只属于这个用户
     */
    private Long ownerUserId;

    private Integer sort;
}
