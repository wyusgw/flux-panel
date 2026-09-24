package com.admin.common.dto;

import lombok.Data;
import javax.validation.constraints.NotNull;

/**
 * 为用户分配隧道权限。流量/转发数量/到期时间等额度统一由账号自身的套餐控制，
 * 分配隧道权限只代表"该用户可以使用这条隧道"，不再单独设置额度。
 */
@Data
public class UserTunnelDto {

    @NotNull(message = "用户ID不能为空")
    private Integer userId;

    @NotNull(message = "隧道ID不能为空")
    private Integer tunnelId;
}
