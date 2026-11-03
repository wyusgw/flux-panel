package com.admin.controller;

import cloud.tianai.captcha.application.ImageCaptchaApplication;
import cloud.tianai.captcha.common.constant.CaptchaTypeConstant;
import cloud.tianai.captcha.common.response.ApiResponse;
import cloud.tianai.captcha.application.vo.ImageCaptchaVO;
import cloud.tianai.captcha.validator.common.model.dto.ImageCaptchaTrack;
import cloud.tianai.captcha.validator.common.model.dto.MatchParam;
import com.admin.common.dto.CaptchaVerifyDto;
import com.admin.common.lang.R;
import com.admin.common.utils.CaptchaProviderUtil;
import com.admin.entity.ViteConfig;
import com.admin.service.ViteConfigService;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import cloud.tianai.captcha.application.vo.CaptchaResponse;

import javax.annotation.Resource;
import javax.validation.Valid;
import java.util.Collections;
import java.util.Objects;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 验证码控制器
 */
@Slf4j
@RestController
@CrossOrigin
@RequestMapping("/api/v1/captcha")
public class CaptchaController extends BaseController {

    @Resource
     ImageCaptchaApplication application;

    private static final String[] OPTIONS = {
            "SLIDER", "WORD_IMAGE_CLICK", "ROTATE", "CONCAT"
    };

    /**
     * 登录是否需要验证码以及用哪种：0 不需要，1 内置验证码，2 Google reCAPTCHA，3 Cloudflare Turnstile
     */
    @PostMapping("/check")
    public R check() {
        return R.ok(CaptchaProviderUtil.resolveMode(viteConfigService));
    }


    @PostMapping("/generate")
    public CaptchaResponse<ImageCaptchaVO> genCaptcha() {
        ViteConfig viteConfig = viteConfigService.getOne(new QueryWrapper<ViteConfig>().eq("name", "captcha_type"));
        String captchaType;
        // 没配置、选了随机，或配置的不是自带验证码支持的形式时，随机选一种
        if (viteConfig == null || Objects.equals(viteConfig.getValue(), "RANDOM")
                || !java.util.Arrays.asList(OPTIONS).contains(viteConfig.getValue())) {
            captchaType = getRandomOption();
        }else {
            captchaType = viteConfig.getValue();
        }
        return application.generateCaptcha(captchaType);
    }


    @PostMapping("/verify")
    public ApiResponse<?> verify(@Valid @RequestBody CaptchaVerifyDto verifyDto) {
        ApiResponse<?> response = application.matching(verifyDto.getId(), verifyDto.getData());
        if (response.isSuccess()) {
            return ApiResponse.ofSuccess(Collections.singletonMap("validToken", verifyDto.getId()));
        }
        return response;
    }

    public static String getRandomOption() {
        int index = ThreadLocalRandom.current().nextInt(OPTIONS.length);
        return OPTIONS[index];
    }
}
