package com.admin.controller;

import com.admin.common.lang.R;
import com.admin.common.task.TelegramPollingTask;
import com.admin.common.utils.TelegramBotUtil;
import com.admin.entity.ViteConfig;
import com.admin.service.ViteConfigService;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * <p>
 * Telegram Webhook 接收端点：仅在推送通知页配置了 Webhook URL 时才会被 Telegram 调用，
 * 与长轮询（{@link TelegramPollingTask#poll()}）互斥，二选一。
 * 路径里的 {token} 就是 Bot Token 本身（Telegram 官方推荐做法），必须与当前配置的
 * telegram_bot_token 完全一致才处理，否则视为非法请求直接忽略——不需要额外的鉴权头。
 * 此端点在 {@link com.admin.config.WebMvcConfig} 中被排除在 JWT 拦截之外。
 * </p>
 */
@Slf4j
@RestController
@CrossOrigin
@RequestMapping("/api/v1/telegram/webhook")
public class TelegramWebhookController {

    @Autowired
    private ViteConfigService viteConfigService;

    @Autowired
    private TelegramPollingTask telegramPollingTask;

    @PostMapping("/{token}")
    public R receive(@PathVariable String token, @RequestBody(required = false) JSONObject body) {
        try {
            if (!"true".equals(getConfigValue("telegram_enabled"))) {
                return R.ok();
            }
            String configuredToken = getConfigValue("telegram_bot_token");
            if (configuredToken == null || configuredToken.isEmpty() || !configuredToken.equals(token)) {
                log.warn("收到 Telegram Webhook 请求，但路径 Token 与当前配置不匹配，已忽略");
                return R.ok();
            }
            if (body == null) {
                return R.ok();
            }

            TelegramBotUtil.TelegramUpdate update = TelegramBotUtil.parseUpdate(body);
            if (update != null) {
                telegramPollingTask.handleUpdate(configuredToken, update);
            }
        } catch (Exception e) {
            // Telegram 对失败请求会重试，这里始终返回成功、只记录日志，避免触发无意义的重试风暴
            log.warn("处理 Telegram Webhook 请求异常: {}", e.getMessage(), e);
        }
        return R.ok();
    }

    private String getConfigValue(String name) {
        ViteConfig config = viteConfigService.getOne(new QueryWrapper<ViteConfig>().eq("name", name));
        return config != null ? config.getValue() : null;
    }
}
