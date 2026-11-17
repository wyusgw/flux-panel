package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotNull;

@Data
public class UserGroupUpdateDto {

    @NotNull(message = "用户组ID不能为空")
    private Long id;

    private String name;

    /** 可用节点组；为空列表表示不限制，不传（null）表示不修改 */
    private java.util.List<Long> nodeGroupIds;
}
