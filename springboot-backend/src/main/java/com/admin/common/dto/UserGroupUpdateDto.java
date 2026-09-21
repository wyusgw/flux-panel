package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotNull;

@Data
public class UserGroupUpdateDto {

    @NotNull(message = "用户组ID不能为空")
    private Long id;

    private String name;
}
