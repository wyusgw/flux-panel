package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

@Data
public class ForwardGroupUpdateDto {

    @NotNull(message = "分组ID不能为空")
    private Long id;

    @NotBlank(message = "分组名称不能为空")
    private String name;
}
