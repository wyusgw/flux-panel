package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

@Data
public class ChangePasswordDto {

    /** 新用户名，留空表示不修改用户名，只改密码 */
    private String newUsername;

    @NotBlank(message = "当前密码不能为空")
    private String currentPassword;

    @NotBlank(message = "新密码不能为空")
    private String newPassword;

    @NotBlank(message = "确认密码不能为空")
    private String confirmPassword;
} 