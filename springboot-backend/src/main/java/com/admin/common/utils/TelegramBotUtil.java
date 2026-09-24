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
 * Telegram Bot API 的最小封装。默认长轮询模式，不依赖公网可达的 webhook；
 * 若在推送通知页配置了 Webhook URL，则改用 setWebhook 让 Telegram 主动推送更新。
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
                TelegramUpdate u = parseUpdate(updates.getJSONObject(i));
                if (u != null) result.add(u);
            }
        } catch (Exception e) {
            log.warn("Telegram getUpdates 失败: {}", e.getMessage());
        }
        return result;
    }

    /**
     * 解析单条 Update JSON（getUpdates 返回数组里的一项，或 Webhook 请求体本身），
     * 不是文本消息/缺少必要字段时返回 null
     */
    public static TelegramUpdate parseUpdate(JSONObject update) {
        if (update == null) return null;
        JSONObject message = update.getJSONObject("message");
        if (message == null) return null;
        JSONObject chat = message.getJSONObject("chat");
        if (chat == null) return null;
        TelegramUpdate u = new TelegramUpdate();
        u.updateId = update.getLongValue("update_id");
        u.chatId = chat.getString("id");
        u.text = message.getString("text");
        return u;
    }

    /**
     * 注册 Webhook：配置了 Webhook URL 时调用，让 Telegram 改为主动推送更新（此后不能再用 getUpdates 长轮询）。
     * 返回是否注册成功。
     */
    public static boolean setWebhook(String token, String url) {
        if (token == null || token.isEmpty() || url == null || url.isEmpty()) return false;
        try {
            Map<String, Object> params = new HashMap<>();
            params.put("url", url);
            String resp = HttpUtil.get(API_BASE + token + "/setWebhook", params, TIMEOUT_MS);
            JSONObject json = JSONObject.parseObject(resp);
            boolean ok = json != null && json.getBooleanValue("ok");
            if (!ok) {
                log.warn("Telegram setWebhook 失败: {}", resp);
            }
            return ok;
        } catch (Exception e) {
            log.warn("Telegram setWebhook 异常: {}", e.getMessage());
            return false;
        }
    }

    /**
     * 取消 Webhook：Webhook URL 清空时调用，恢复为长轮询模式。返回是否成功。
     */
    public static boolean deleteWebhook(String token) {
        if (token == null || token.isEmpty()) return false;
        try {
            String resp = HttpUtil.get(API_BASE + token + "/deleteWebhook", TIMEOUT_MS);
            JSONObject json = JSONObject.parseObject(resp);
            boolean ok = json != null && json.getBooleanValue("ok");
            if (!ok) {
                log.warn("Telegram deleteWebhook 失败: {}", resp);
            }
            return ok;
        } catch (Exception e) {
            log.warn("Telegram deleteWebhook 异常: {}", e.getMessage());
            return false;
        }
    }
}
