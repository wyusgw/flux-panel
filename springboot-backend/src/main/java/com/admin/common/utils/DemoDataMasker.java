package com.admin.common.utils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.IntNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 演示管理员看到的数据打码：演示账号能看到完整后台，但不能看到密钥、IP、用户身份和可直接使用的兑换码等。
 * 按字段名匹配，新增接口只要沿用这些字段名就会自动打码；其余字符串里出现的 IP 也会被替换。
 * 字符串替换成占位符、数字替换成 0，保持类型不变，前端照常渲染。
 */
public final class DemoDataMasker {

    public static final String MASK = "***";

    private static final Set<String> MASKED_KEYS = new HashSet<>(Arrays.asList(
            "addr", "chatid", "code", "config", "content", "dedupkey", "error", "info", "interfacename",
            "lasterror", "payload", "redeemcode", "remark", "summary", "tcplistenaddr",
            "telegrambindcode", "telegramchatid", "tradeno", "udplistenaddr", "walletbalance"
    ));

    private static final Set<String> USER_NAME_KEYS = new HashSet<>(Arrays.asList("user", "username"));

    private static final String[] SENSITIVE_PARTS = {"secret", "token", "password", "pwd", "apikey"};

    private static final Pattern IP_PATTERN = Pattern.compile(
            "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b"
                    + "|(?i:\\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\\b)"
                    + "|(?i:(?<![0-9a-z:])(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?(?![0-9a-z:]))"
    );

    private DemoDataMasker() {
    }

    /** 替换文本里出现的 IP 地址，用于无法按字段处理的内容（如 WebSocket 推送的节点信息） */
    public static String maskIps(String text) {
        return text == null ? null : IP_PATTERN.matcher(text).replaceAll(MASK);
    }

    public static JsonNode mask(JsonNode node) {
        if (node == null) {
            return null;
        }
        if (node.isObject()) {
            return maskObject((ObjectNode) node);
        }
        if (node.isArray()) {
            ArrayNode result = JsonNodeFactory.instance.arrayNode();
            node.forEach(item -> result.add(mask(item)));
            return result;
        }
        if (node.isTextual()) {
            return TextNode.valueOf(maskIps(node.textValue()));
        }
        return node;
    }

    private static ObjectNode maskObject(ObjectNode source) {
        ObjectNode result = JsonNodeFactory.instance.objectNode();
        List<String> names = new ArrayList<>();
        source.fieldNames().forEachRemaining(names::add);
        for (String name : names) {
            JsonNode value = source.get(name);
            if (USER_NAME_KEYS.contains(name.toLowerCase(Locale.ROOT))) {
                result.set(name, value.isNull() ? value : TextNode.valueOf(maskedUserName(source)));
            } else if (isSensitive(name)) {
                result.set(name, replace(value));
            } else if ("version".equals(name)) {
                // 版本号形如 1.2.3.4 时会被当成 IP
                result.set(name, value);
            } else if (name.endsWith("UserRanking") && value.isArray()) {
                result.set(name, maskRanking(value));
            } else {
                result.set(name, mask(value));
            }
        }
        return result;
    }

    /** 用户流量排行里的 name 是用户名，普通对象的 name 是节点、隧道等名称，所以单独处理 */
    private static ArrayNode maskRanking(JsonNode ranking) {
        ArrayNode result = JsonNodeFactory.instance.arrayNode();
        for (JsonNode item : ranking) {
            JsonNode masked = mask(item);
            if (masked.isObject() && masked.has("name")) {
                ((ObjectNode) masked).put("name", MASK);
            }
            result.add(masked);
        }
        return result;
    }

    private static boolean isSensitive(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (MASKED_KEYS.contains(lower) || name.equals("ip") || name.endsWith("Ip") || name.endsWith("Addr")) {
            return true;
        }
        for (String part : SENSITIVE_PARTS) {
            if (lower.contains(part)) {
                return true;
            }
        }
        return false;
    }

    private static String maskedUserName(ObjectNode owner) {
        JsonNode id = owner.has("userId") ? owner.get("userId") : owner.get("id");
        return id != null && id.isNumber() ? "用户" + id.asText() : "用户" + MASK;
    }

    private static JsonNode replace(JsonNode value) {
        if (value.isTextual()) {
            return TextNode.valueOf(MASK);
        }
        if (value.isNumber()) {
            return IntNode.valueOf(0);
        }
        if (value.isArray()) {
            return JsonNodeFactory.instance.arrayNode();
        }
        if (value.isObject()) {
            return JsonNodeFactory.instance.objectNode();
        }
        return value;
    }
}
