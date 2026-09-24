package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotNull;

@Data
public class SingleTunnelGroupUpdateDto {

    @NotNull(message = "单端组ID不能为空")
    private Long id;

    private String name;
}
