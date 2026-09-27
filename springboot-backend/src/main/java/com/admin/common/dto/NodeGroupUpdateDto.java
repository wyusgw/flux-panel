package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotNull;

@Data
public class NodeGroupUpdateDto {

    @NotNull(message = "节点组ID不能为空")
    private Long id;

    private String name;
}
