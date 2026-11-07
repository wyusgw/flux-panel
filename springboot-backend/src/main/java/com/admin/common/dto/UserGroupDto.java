package com.admin.common.dto;

import lombok.Data;

@Data
public class UserGroupDto {

    /** 自定义 ID；不传表示自动生成 */
    private Long id;

    private String name;
}
