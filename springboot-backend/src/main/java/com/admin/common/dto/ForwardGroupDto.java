package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

@Data
public class ForwardGroupDto {

    @NotBlank(message = "分组名称不能为空")
    private String name;

    /**
     * 目标用户ID：仅管理员可用，代该用户创建分组（转发规则页"管理转发规则"入口）；
     * 普通用户忽略该字段，分组归属始终是自己
     */
    private Integer userId;
}
