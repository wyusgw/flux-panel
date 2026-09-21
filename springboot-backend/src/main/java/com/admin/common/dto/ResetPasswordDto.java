package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

/**
 * 个人中心「重置密码」请求：新密码留空时由后端随机生成
 */
@Data
public class ResetPasswordDto {

    @NotBlank(message = "当前密码不能为空")
    private String currentPassword;

    private String newPassword;
}
