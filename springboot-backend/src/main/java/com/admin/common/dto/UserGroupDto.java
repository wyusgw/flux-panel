package com.admin.common.dto;

import lombok.Data;

@Data
public class UserGroupDto {

    /** 自定义 ID；不传表示自动生成 */
    private Long id;

    private String name;

    /** 可用节点组；不传或为空表示不限制 */
    private java.util.List<Long> nodeGroupIds;
}
