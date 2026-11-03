package com.admin.common.dto;


import lombok.Data;

import javax.validation.constraints.NotBlank;

@Data
public class LoginDto {

    @NotBlank(message = "用户名不能为空")
    private String username;

    @NotBlank(message = "密码不能为空")
    private String password;

    private String captchaId;

    /** 第三方验证码（Google reCAPTCHA / Cloudflare Turnstile）前端拿到的令牌 */
    private String captchaToken;


}
