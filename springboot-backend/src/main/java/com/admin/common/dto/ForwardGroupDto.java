package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

@Data
public class ForwardGroupDto {

    @NotBlank(message = "分组名称不能为空")
    private String name;
}
