package com.admin.common.utils;

import com.admin.entity.ViteConfig;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.serializer.SerializeFilter;
import com.alibaba.fastjson.serializer.ValueFilter;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 写日志前去掉敏感内容。日志保留 30 天，密码、令牌和密钥不能明文进日志：
 * 能读到日志的人可以直接登录账号，或用支付密钥伪造回调给账户加钱。
 */
public final class LogSanitizer {

    private static final String MASK = "***";

    /** 字段名（转小写后）包含这些内容就脱敏；安装命令里带节点密钥，所以 command 也算 */
    private static final List<String> SENSITIVE_PARTS = Arrays.asList(
            "password", "pwd", "token", "secret", "authorization", "command", "redeemcode", "bindcode");

    /** 名称不含上面的词，但内容是密钥的配置项：支付渠道配置带商户密钥，Webhook 地址路径里带 Bot Token */
    private static final Set<String> SENSITIVE_CONFIGS = new HashSet<>(Arrays.asList(
            "payment_config_json", "telegram_webhook_url"));

    private static final ValueFilter FILTER = (object, name, value) -> {
        if (value == null || name == null) {
            return value;
        }
        if (isSensitiveKey(name)) {
            return MASK;
        }
        // 兑换码、邀请码、绑定码的字段就叫 code；R 里的 code 是数字状态码，不受影响
        if ("code".equals(name) && value instanceof String) {
            return MASK;
        }
        // 配置项是 {name, value} 结构，要看 name 才知道 value 是不是密钥
        if ("value".equals(name) && isSensitiveKey(configName(object))) {
            return MASK;
        }
        return value;
    };

    private LogSanitizer() {
    }

    /** 序列化成 JSON 字符串，敏感字段的值替换成 *** */
    public static String toSafeJson(Object value) {
        return JSON.toJSONString(value, new SerializeFilter[]{FILTER});
    }

    /** RestTemplate 的异常信息带完整 URL，Telegram 接口地址和 Webhook 路径里都有 Bot Token */
    public static String maskBotToken(String text) {
        if (text == null) {
            return null;
        }
        return text.replaceAll("/bot[^/\\s\"']+", "/bot" + MASK)
                .replaceAll("/webhook/[^/\\s\"']+", "/webhook/" + MASK);
    }

    private static boolean isSensitiveKey(String name) {
        if (name == null) {
            return false;
        }
        String lower = name.toLowerCase(Locale.ROOT);
        return SENSITIVE_CONFIGS.contains(lower) || SENSITIVE_PARTS.stream().anyMatch(lower::contains);
    }

    private static String configName(Object owner) {
        if (owner instanceof ViteConfig) {
            return ((ViteConfig) owner).getName();
        }
        if (owner instanceof Map) {
            Object name = ((Map<?, ?>) owner).get("name");
            return name == null ? null : name.toString();
        }
        return null;
    }
}
