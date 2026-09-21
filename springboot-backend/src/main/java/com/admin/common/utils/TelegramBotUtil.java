package com.admin.common.utils;

import cn.hutool.http.HttpUtil;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import lombok.extern.slf4j.Slf4j;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Telegram Bot API 的最小封装（长轮询模式，不依赖公网可达的 webhook）。
 * 所有方法均对异常静默降级，绝不向调用方抛出异常。
 */
@Slf4j
public class TelegramBotUtil {

    private static final String API_BASE = "https://api.telegram.org/bot";
    private static final int TIMEOUT_MS = 8000;

    public static class TelegramUpdate {
        public long updateId;
        public String chatId;
        public String text;
    }

    /**
     * 校验 Bot Token 并返回机器人用户名，用于站点设置保存时自动填充；失败返回 null
     */
    public static String getMe(String token) {
        if (token == null || token.isEmpty()) return null;
        try {
            String resp = HttpUtil.get(API_BASE + token + "/getMe", TIMEOUT_MS);
            JSONObject json = JSONObject.parseObject(resp);
            if (json != null && json.getBooleanValue("ok")) {
                return json.getJSONObject("result").getString("username");
            }
        } catch (Exception e) {
            log.warn("Telegram getMe 校验失败: {}", e.getMessage());
        }
        return null;
    }

    /**
     * 发送文本消息，返回是否发送成功（异常/非 ok 响应均返回 false，不向调用方抛出异常）
     */
    public static boolean sendMessage(String token, String chatId, String text) {
        if (token == null || token.isEmpty() || chatId == null || chatId.isEmpty()) return false;
        try {
            Map<String, Object> params = new HashMap<>();
            params.put("chat_id", chatId);
            params.put("text", text);
            String resp = HttpUtil.get(API_BASE + token + "/sendMessage", params, TIMEOUT_MS);
            JSONObject json = JSONObject.parseObject(resp);
            return json != null && json.getBooleanValue("ok");
        } catch (Exception e) {
            log.warn("Telegram 消息发送失败: {}", e.getMessage());
            return false;
        }
    }

    /**
     * 拉取自 offset 起的增量更新（长轮询，本方法内部不阻塞等待，timeout=0 立即返回），失败返回空列表
     */
    public static List<TelegramUpdate> getUpdates(String token, long offset) {
        List<TelegramUpdate> result = new ArrayList<>();
        if (token == null || token.isEmpty()) return result;
        try {
            Map<String, Object> params = new HashMap<>();
            params.put("offset", offset);
            params.put("timeout", 0);
            String resp = HttpUtil.get(API_BASE + token + "/getUpdates", params, TIMEOUT_MS);
            JSONObject json = JSONObject.parseObject(resp);
            if (json == null || !json.getBooleanValue("ok")) return result;
            JSONArray updates = json.getJSONArray("result");
            if (updates == null) return result;
            for (int i = 0; i < updates.size(); i++) {
                JSONObject update = updates.getJSONObject(i);
                JSONObject message = update.getJSONObject("message");
                if (message == null) continue;
                JSONObject chat = message.getJSONObject("chat");
                if (chat == null) continue;
                TelegramUpdate u = new TelegramUpdate();
                u.updateId = update.getLongValue("update_id");
                u.chatId = chat.getString("id");
                u.text = message.getString("text");
                result.add(u);
            }
        } catch (Exception e) {
            log.warn("Telegram getUpdates 失败: {}", e.getMessage());
        }
        return result;
    }
}
