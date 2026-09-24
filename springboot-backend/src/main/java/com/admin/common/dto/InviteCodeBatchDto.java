package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.Min;
import javax.validation.constraints.NotEmpty;
import javax.validation.constraints.NotNull;

import java.util.List;

@Data
public class InviteCodeBatchDto {

    @NotNull(message = "可用次数不能为空")
    @Min(value = 1, message = "可用次数至少为1")
    private Integer usesRemaining;

    @NotEmpty(message = "邀请代码不能为空")
    private List<String> codes;
}
