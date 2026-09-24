package com.admin.service.impl.task;

import com.admin.common.lang.R;
import com.admin.common.utils.TelegramBotUtil;
import com.admin.entity.TaskQueue;
import com.admin.entity.ViteConfig;
import com.admin.service.TaskHandler;
import com.admin.service.ViteConfigService;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;

/**
 * <p>
 * 任务队列的「Telegram 通知发送」处理器：NotificationUtil 发送通知失败时登记的任务，
 * 由此处理器负责重试发送。payload 约定：{"chatId": "...", "text": "...", "summary": "..."}
 * </p>
 *
 * @author QAQ
 * @since 2026-09-24
 */
@Component
public class TelegramNotifyTaskHandler implements TaskHandler {

    @Resource
    @Lazy
    private ViteConfigService viteConfigService;

    @Override
    public String getTaskType() {
        return "TELEGRAM_NOTIFY";
    }

    @Override
    public String getLabel() {
        return "Telegram 通知发送";
    }

    @Override
    public R handle(TaskQueue task) {
        JSONObject payload = JSONObject.parseObject(task.getPayload());
        String chatId = payload != null ? payload.getString("chatId") : null;
        String text = payload != null ? payload.getString("text") : null;
        if (chatId == null || text == null) {
            return R.err("任务数据缺少 chatId/text");
        }
        ViteConfig config = viteConfigService.getOne(new QueryWrapper<ViteConfig>().eq("name", "telegram_bot_token"));
        String token = config != null ? config.getValue() : null;
        if (token == null || token.isEmpty()) {
            return R.err("Telegram Bot Token 未配置");
        }
        boolean ok = TelegramBotUtil.sendMessage(token, chatId, text);
        return ok ? R.ok() : R.err("Telegram 消息发送失败");
    }
}
