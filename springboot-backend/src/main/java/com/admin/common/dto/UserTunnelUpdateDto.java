package com.admin.common.dto;

import lombok.Data;
import javax.validation.constraints.NotNull;

/**
 * 更新用户隧道权限。额度字段已移除（见 UserTunnelDto 的说明），
 * 这里只保留启用/禁用该权限的能力。
 */
@Data
public class UserTunnelUpdateDto {

    @NotNull(message = "用户隧道权限ID不能为空")
    private Integer id;

    @NotNull(message = "状态必选")
    private Integer status;
}
