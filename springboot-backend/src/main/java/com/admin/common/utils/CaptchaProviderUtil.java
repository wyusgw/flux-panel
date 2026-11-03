package com.admin.common.utils;

import cn.hutool.http.HttpUtil;
import com.admin.entity.ViteConfig;
import com.admin.service.ViteConfigService;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.extern.slf4j.Slf4j;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

/**
 * 登录验证码的类型判定与第三方验证码（Google reCAPTCHA、Cloudflare Turnstile）的服务端校验。
 * 站点设置里的验证码类型为 GOOGLE / CLOUDFLARE 时走第三方验证：前端拿到令牌，登录时随请求带上，后端用密钥向服务商校验。
 */
@Slf4j
public final class CaptchaProviderUtil {

    /** 验证码未开启 */
    public static final int MODE_NONE = 0;
    /** 自带验证码（滑块、点选、旋转、拼图） */
    public static final int MODE_BUILT_IN = 1;
    /** Google reCAPTCHA */
    public static final int MODE_GOOGLE = 2;
    /** Cloudflare Turnstile */
    public static final int MODE_CLOUDFLARE = 3;

    private static final String GOOGLE_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
    private static final String CLOUDFLARE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    private static final int VERIFY_TIMEOUT_MS = 8000;

    private CaptchaProviderUtil() {
    }

    private static String configValue(ViteConfigService service, String name) {
        ViteConfig config = service.getOne(new QueryWrapper<ViteConfig>().eq("name", name));
        return config == null || config.getValue() == null ? "" : config.getValue().trim();
    }

    /**
     * 当前登录应使用的验证方式。选了 Google / Cloudflare 但站点密钥或服务端密钥没填全时，
     * 退回内置验证码，避免因为配置不完整把所有人（包括管理员）都挡在登录页外
     */
    public static int resolveMode(ViteConfigService service) {
        if (!Objects.equals(configValue(service, "captcha_enabled"), "true")) {
            return MODE_NONE;
        }
        // captcha_provider：BUILT_IN（自带验证码，未配置时的默认值）、GOOGLE、CLOUDFLARE；
        // 自带验证码具体用哪种形式（滑块、点选等）由 captcha_type 决定
        String provider = configValue(service, "captcha_provider");
        if ("GOOGLE".equals(provider) && hasKeys(service, "google")) {
            return MODE_GOOGLE;
        }
        if ("CLOUDFLARE".equals(provider) && hasKeys(service, "cloudflare")) {
            return MODE_CLOUDFLARE;
        }
        return MODE_BUILT_IN;
    }

    private static boolean hasKeys(ViteConfigService service, String provider) {
        return !configValue(service, "captcha_" + provider + "_site_key").isEmpty()
                && !configValue(service, "captcha_" + provider + "_secret_key").isEmpty();
    }

    /** 向服务商校验前端拿到的令牌，成功返回 true；网络异常、服务商拒绝一律视为失败 */
    public static boolean verifyToken(ViteConfigService service, int mode, String token, String remoteIp) {
        if (token == null || token.trim().isEmpty()) {
            return false;
        }
        String provider = mode == MODE_GOOGLE ? "google" : "cloudflare";
        String url = mode == MODE_GOOGLE ? GOOGLE_VERIFY_URL : CLOUDFLARE_VERIFY_URL;
        try {
            Map<String, Object> params = new HashMap<>();
            params.put("secret", configValue(service, "captcha_" + provider + "_secret_key"));
            params.put("response", token.trim());
            if (remoteIp != null && !remoteIp.isEmpty()) {
                params.put("remoteip", remoteIp);
            }
            String body = HttpUtil.post(url, params, VERIFY_TIMEOUT_MS);
            JSONObject result = JSONObject.parseObject(body);
            boolean success = result != null && result.getBooleanValue("success");
            if (!success) {
                log.info("{} 验证码校验未通过: {}", provider, body);
            }
            return success;
        } catch (Exception e) {
            log.warn("{} 验证码校验请求失败: {}", provider, e.getMessage());
            return false;
        }
    }
}
