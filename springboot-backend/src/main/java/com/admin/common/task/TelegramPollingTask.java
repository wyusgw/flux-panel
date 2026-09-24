package com.admin.common.task;

import com.admin.common.utils.TelegramBotUtil;
import com.admin.entity.User;
import com.admin.entity.ViteConfig;
import com.admin.service.UserService;
import com.admin.service.ViteConfigService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import javax.annotation.Resource;
import java.util.List;

/**
 * Telegram 更新处理任务：默认定期拉取 getUpdates 长轮询，处理 /start、/bind 绑定命令，
 * 避免要求面板具备公网可达的 HTTPS 入口；若在推送通知页配置了 Webhook URL，则改为
 * {@link com.admin.controller.TelegramWebhookController} 被动接收推送、直接调用本类的
 * {@link #handleUpdate} 处理同一套指令，此时本任务的轮询会自动跳过（两者不能同时使用）。
 */
@Slf4j
@Configuration
@EnableScheduling
public class TelegramPollingTask {

    private static final long BIND_CODE_TTL_MS = 10 * 60 * 1000L;

    @Resource
    UserService userService;

    @Resource
    ViteConfigService viteConfigService;

    @Scheduled(fixedDelay = 3000)
    public void poll() {
        try {
            if (!"true".equals(getConfigValue("telegram_enabled"))) {
                return;
            }
            String token = getConfigValue("telegram_bot_token");
            if (token == null || token.isEmpty()) {
                return;
            }
            String webhookUrl = getConfigValue("telegram_webhook_url");
            if (webhookUrl != null && !webhookUrl.isEmpty()) {
                // 已配置 Webhook：Telegram 不允许同一个 Bot 同时使用 getUpdates 长轮询，跳过本次轮询
                return;
            }

            long offset = 0L;
            String offsetStr = getConfigValue("telegram_update_offset");
            if (offsetStr != null && !offsetStr.isEmpty()) {
                try {
                    offset = Long.parseLong(offsetStr);
                } catch (NumberFormatException ignored) {
                }
            }

            List<TelegramBotUtil.TelegramUpdate> updates = TelegramBotUtil.getUpdates(token, offset);
            if (updates.isEmpty()) {
                return;
            }

            long maxUpdateId = offset - 1;
            for (TelegramBotUtil.TelegramUpdate update : updates) {
                maxUpdateId = Math.max(maxUpdateId, update.updateId);
                handleUpdate(token, update);
            }
            setConfigValue("telegram_update_offset", String.valueOf(maxUpdateId + 1));
        } catch (Exception e) {
            log.warn("Telegram 轮询任务异常: {}", e.getMessage());
        }
    }

    private static final String HELP_TEXT = "可用指令：\n/bind <绑定码> 绑定账号（在个人中心获取绑定码）\n/unbind 解除当前账号的绑定\n/help 查看本帮助";

    /**
     * 处理一条 Telegram 更新（/bind、/unbind、/help 等指令），轮询与 Webhook 两种模式共用。
     */
    public void handleUpdate(String token, TelegramBotUtil.TelegramUpdate update) {
        if (update.text == null) return;
        String text = update.text.trim();

        if (text.equals("/unbind") || text.startsWith("/unbind ")) {
            handleUnbind(token, update);
            return;
        }
        if (text.equals("/help") || text.equals("/start")) {
            TelegramBotUtil.sendMessage(token, update.chatId, HELP_TEXT);
            return;
        }

        String code;
        if (text.startsWith("/start ")) {
            code = text.substring(7).trim();
        } else if (text.startsWith("/bind ")) {
            code = text.substring(6).trim();
        } else {
            TelegramBotUtil.sendMessage(token, update.chatId, "无法识别的指令，发送 /help 查看可用指令");
            return;
        }
        if (code.isEmpty()) {
            TelegramBotUtil.sendMessage(token, update.chatId, HELP_TEXT);
            return;
        }

        User user = userService.getOne(new QueryWrapper<User>().eq("telegram_bind_code", code));
        if (user == null) {
            TelegramBotUtil.sendMessage(token, update.chatId, "绑定码无效，请在个人中心重新获取");
            return;
        }
        if (user.getTelegramBindTime() == null || System.currentTimeMillis() - user.getTelegramBindTime() > BIND_CODE_TTL_MS) {
            TelegramBotUtil.sendMessage(token, update.chatId, "绑定码已过期，请在个人中心重新获取");
            return;
        }

        userService.update(new UpdateWrapper<User>()
                .eq("id", user.getId())
                .set("telegram_chat_id", update.chatId)
                .set("telegram_bind_code", null)
                .set("telegram_bind_time", null)
                .set("updated_time", System.currentTimeMillis()));

        TelegramBotUtil.sendMessage(token, update.chatId, "绑定成功！后续将通过该账号接收您的推送通知。");
    }

    private void handleUnbind(String token, TelegramBotUtil.TelegramUpdate update) {
        User user = userService.getOne(new QueryWrapper<User>().eq("telegram_chat_id", update.chatId));
        if (user == null) {
            TelegramBotUtil.sendMessage(token, update.chatId, "当前未绑定任何账号");
            return;
        }
        userService.update(new UpdateWrapper<User>()
                .eq("id", user.getId())
                .set("telegram_chat_id", null)
                .set("updated_time", System.currentTimeMillis()));
        TelegramBotUtil.sendMessage(token, update.chatId, "已解除绑定，将不再接收推送通知");
    }

    private String getConfigValue(String name) {
        ViteConfig config = viteConfigService.getOne(new QueryWrapper<ViteConfig>().eq("name", name));
        return config != null ? config.getValue() : null;
    }

    private void setConfigValue(String name, String value) {
        ViteConfig config = viteConfigService.getOne(new QueryWrapper<ViteConfig>().eq("name", name));
        if (config != null) {
            config.setValue(value);
            config.setTime(System.currentTimeMillis());
            viteConfigService.updateById(config);
        } else {
            ViteConfig newConfig = new ViteConfig();
            newConfig.setName(name);
            newConfig.setValue(value);
            newConfig.setTime(System.currentTimeMillis());
            viteConfigService.save(newConfig);
        }
    }
}
