package com.admin.common.utils;

import cn.hutool.crypto.digest.DigestUtil;
import cn.hutool.http.HttpRequest;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.alibaba.fastjson2.JSONWriter;
import lombok.extern.slf4j.Slf4j;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * EPUSDT、TokenPay、Cryptomus 三种网关的签名、下单与回调验签。
 * 下单失败时抛出 {@link GatewayException}，消息可直接展示给用户；验签方法不抛异常。
 */
@Slf4j
public final class PaymentGatewayUtil {

    private static final int TIMEOUT_MS = 10000;
    public static final String CRYPTOMUS_DEFAULT_API = "https://api.cryptomus.com";

    private PaymentGatewayUtil() {
    }

    public static class GatewayException extends Exception {
        public GatewayException(String message) {
            super(message);
        }
    }

    // ========== 通用：参数按 key 升序拼成 k=v&k=v，末尾直接拼密钥后取 MD5（EPUSDT、TokenPay 共用） ==========

    /**
     * 参与签名的值取原文：JSON 里的数字保持原样（如 10.50 还是 10.50），排除签名字段和空值
     */
    static String sortedSign(Map<String, ?> params, String excludeKey, String secret) {
        TreeMap<String, String> sorted = new TreeMap<>();
        for (Map.Entry<String, ?> entry : params.entrySet()) {
            if (entry.getKey().equals(excludeKey) || entry.getValue() == null) {
                continue;
            }
            String value = valueText(entry.getValue());
            if (value.isEmpty()) {
                continue;
            }
            sorted.put(entry.getKey(), value);
        }
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> entry : sorted.entrySet()) {
            if (sb.length() > 0) {
                sb.append('&');
            }
            sb.append(entry.getKey()).append('=').append(entry.getValue());
        }
        sb.append(secret);
        return DigestUtil.md5Hex(sb.toString());
    }

    private static String valueText(Object value) {
        if (value instanceof BigDecimal) {
            return ((BigDecimal) value).toPlainString();
        }
        return String.valueOf(value);
    }

    private static boolean signMatches(JSONObject body, String signKey, String secret) {
        String received = body.getString(signKey);
        return received != null && !received.isEmpty()
                && sortedSign(body, signKey, secret).equalsIgnoreCase(received);
    }

    private static JSONObject postJson(String url, Map<String, String> headers, String body, String gatewayName) throws GatewayException {
        String resp;
        try {
            HttpRequest request = HttpRequest.post(url).body(body, "application/json").timeout(TIMEOUT_MS);
            if (headers != null) {
                headers.forEach(request::header);
            }
            resp = request.execute().body();
        } catch (Exception e) {
            log.warn("{} 下单请求失败: {}", gatewayName, e.getMessage());
            throw new GatewayException("连接支付网关失败，请稍后重试");
        }
        try {
            JSONObject json = JSON.parseObject(resp);
            if (json == null) {
                throw new IllegalStateException("empty");
            }
            return json;
        } catch (Exception e) {
            log.warn("{} 下单响应无法解析: {}", gatewayName, LogSanitizer.maskBotToken(String.valueOf(resp)));
            throw new GatewayException("支付网关返回了无法识别的响应");
        }
    }

    private static String stripTrailingSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    // ========== EPUSDT ==========

    /**
     * EPUSDT 金额是浮点数，服务端按 Go 的 %v 格式化后验签：去掉末尾的 0（10.50 → 10.5，10.00 → 10）
     */
    static String epusdtAmount(BigDecimal amount) {
        BigDecimal stripped = amount.stripTrailingZeros();
        return stripped.scale() < 0 ? stripped.setScale(0).toPlainString() : stripped.toPlainString();
    }

    static JSONObject epusdtCreateBody(String orderNo, BigDecimal payAmount, String notifyUrl, String redirectUrl, String token) {
        JSONObject body = new JSONObject();
        body.put("order_id", orderNo);
        body.put("amount", new BigDecimal(epusdtAmount(payAmount)));
        body.put("notify_url", notifyUrl);
        body.put("redirect_url", redirectUrl);
        body.put("signature", sortedSign(body, "signature", token));
        return body;
    }

    /** 创建 EPUSDT 订单，返回收银台地址 */
    public static String epusdtCreate(String apiUrl, String token, String orderNo, BigDecimal payAmount,
                                      String notifyUrl, String redirectUrl) throws GatewayException {
        JSONObject body = epusdtCreateBody(orderNo, payAmount, notifyUrl, redirectUrl, token);
        JSONObject resp = postJson(stripTrailingSlash(apiUrl) + "/api/v1/order/create-transaction", null,
                JSON.toJSONString(body, JSONWriter.Feature.WriteBigDecimalAsPlain), "EPUSDT");
        JSONObject data = resp.getJSONObject("data");
        String payUrl = data == null ? null : data.getString("payment_url");
        if (resp.getIntValue("status_code") != 200 || payUrl == null || payUrl.isEmpty()) {
            log.warn("EPUSDT 下单失败: {}", resp.toJSONString());
            throw new GatewayException("支付网关下单失败：" + firstNonBlank(resp.getString("message"), "未知错误"));
        }
        return payUrl;
    }

    /** EPUSDT 回调验签，回调状态 2 表示支付成功 */
    public static boolean epusdtVerify(JSONObject body, String token) {
        return body != null && signMatches(body, "signature", token);
    }

    // ========== TokenPay ==========

    static JSONObject tokenpayCreateBody(String orderNo, String userKey, BigDecimal payAmount, String currency,
                                         String notifyUrl, String redirectUrl, String apiToken) {
        JSONObject body = new JSONObject();
        body.put("OutOrderId", orderNo);
        body.put("OrderUserKey", userKey);
        body.put("ActualAmount", payAmount.setScale(2, java.math.RoundingMode.HALF_UP));
        body.put("Currency", currency);
        body.put("NotifyUrl", notifyUrl);
        body.put("RedirectUrl", redirectUrl);
        body.put("Signature", sortedSign(body, "Signature", apiToken));
        return body;
    }

    /** 创建 TokenPay 订单，返回收银台地址。ActualAmount 为法币金额，由 TokenPay 按其汇率换算成币种金额 */
    public static String tokenpayCreate(String apiUrl, String apiToken, String orderNo, String userKey, BigDecimal payAmount,
                                        String currency, String notifyUrl, String redirectUrl) throws GatewayException {
        JSONObject body = tokenpayCreateBody(orderNo, userKey, payAmount, currency, notifyUrl, redirectUrl, apiToken);
        JSONObject resp = postJson(stripTrailingSlash(apiUrl) + "/CreateOrder", null,
                JSON.toJSONString(body, JSONWriter.Feature.WriteBigDecimalAsPlain), "TokenPay");
        String payUrl = resp.getString("data");
        if (!resp.getBooleanValue("success") || payUrl == null || !payUrl.startsWith("http")) {
            log.warn("TokenPay 下单失败: {}", resp.toJSONString());
            throw new GatewayException("支付网关下单失败：" + firstNonBlank(resp.getString("message"), "未知错误"));
        }
        return payUrl;
    }

    /** TokenPay 回调验签，回调 Status 为 1 表示已支付 */
    public static boolean tokenpayVerify(JSONObject body, String apiToken) {
        return body != null && signMatches(body, "Signature", apiToken);
    }

    // ========== Cryptomus ==========

    /** Cryptomus 签名：md5(base64(请求体 JSON) + API Key) */
    static String cryptomusSign(String json, String apiKey) {
        return DigestUtil.md5Hex(Base64.getEncoder().encodeToString(json.getBytes(StandardCharsets.UTF_8)) + apiKey);
    }

    static String cryptomusCreateBody(String orderNo, BigDecimal amount, String currency, String callbackUrl, String returnUrl) {
        JSONObject body = new JSONObject();
        body.put("amount", amount.toPlainString());
        body.put("currency", currency);
        body.put("order_id", orderNo);
        body.put("url_callback", callbackUrl);
        body.put("url_return", returnUrl);
        body.put("url_success", returnUrl);
        return body.toJSONString();
    }

    /** 创建 Cryptomus 发票，返回支付页地址 */
    public static String cryptomusCreate(String apiUrl, String merchantId, String apiKey, String orderNo, BigDecimal amount,
                                         String currency, String callbackUrl, String returnUrl) throws GatewayException {
        String body = cryptomusCreateBody(orderNo, amount, currency, callbackUrl, returnUrl);
        Map<String, String> headers = new TreeMap<>();
        headers.put("merchant", merchantId);
        headers.put("sign", cryptomusSign(body, apiKey));
        String base = stripTrailingSlash(apiUrl == null || apiUrl.isEmpty() ? CRYPTOMUS_DEFAULT_API : apiUrl);
        JSONObject resp = postJson(base + "/v1/payment", headers, body, "Cryptomus");
        JSONObject result = resp.getJSONObject("result");
        String payUrl = result == null ? null : result.getString("url");
        if (resp.getIntValue("state", -1) != 0 || payUrl == null || payUrl.isEmpty()) {
            log.warn("Cryptomus 下单失败: {}", resp.toJSONString());
            throw new GatewayException("支付网关下单失败：" + firstNonBlank(resp.getString("message"), "未知错误"));
        }
        return payUrl;
    }

    private static final Pattern SIGN_FIELD = Pattern.compile(",?\\s*\"sign\"\\s*:\\s*\"[0-9a-fA-F]*\"");

    /**
     * Cryptomus 回调验签：去掉 sign 后按 PHP json_encode(..., JSON_UNESCAPED_UNICODE) 的格式重新编码
     * （紧凑、保留字段顺序和 null、斜杠转义为 \/），再按下单签名的算法比对。
     * 另外直接从原始请求体里删去 sign 字段再算一次，两种任一匹配即通过，避免数字或转义格式的细微差异。
     */
    public static boolean cryptomusVerify(String rawBody, String apiKey) {
        try {
            JSONObject body = JSON.parseObject(rawBody);
            if (body == null) return false;
            String received = body.getString("sign");
            if (received == null || received.isEmpty()) return false;
            body.remove("sign");
            String reencoded = JSON.toJSONString(body, JSONWriter.Feature.WriteNulls, JSONWriter.Feature.WriteBigDecimalAsPlain)
                    .replace("/", "\\/");
            if (cryptomusSign(reencoded, apiKey).equalsIgnoreCase(received)) {
                return true;
            }
            Matcher matcher = SIGN_FIELD.matcher(rawBody);
            if (matcher.find()) {
                String stripped = (rawBody.substring(0, matcher.start()) + rawBody.substring(matcher.end())).trim()
                        .replace("{,", "{");
                return cryptomusSign(stripped, apiKey).equalsIgnoreCase(received);
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    private static String firstNonBlank(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value;
    }
}
