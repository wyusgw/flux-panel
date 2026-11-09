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

    // ========== 支付宝当面付（alipay.trade.precreate 生成收款码） ==========

    public static final String ALIPAY_DEFAULT_GATEWAY = "https://openapi.alipay.com/gateway.do";

    /** 去掉 PEM 头尾和空白，得到 Base64 密钥正文 */
    static String keyBody(String key) {
        return key.replaceAll("-----[A-Z ]+-----", "").replaceAll("\\s", "");
    }

    /** 支付宝待签名串：除 sign（回调验签时还排除 sign_type）外的非空参数按 key 升序拼成 k=v&k=v */
    static String alipaySignContent(Map<String, String> params, boolean excludeSignType) {
        TreeMap<String, String> sorted = new TreeMap<>();
        for (Map.Entry<String, String> entry : params.entrySet()) {
            String key = entry.getKey();
            String value = entry.getValue();
            if (value == null || value.isEmpty() || "sign".equals(key) || (excludeSignType && "sign_type".equals(key))) {
                continue;
            }
            sorted.put(key, value);
        }
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> entry : sorted.entrySet()) {
            if (sb.length() > 0) {
                sb.append('&');
            }
            sb.append(entry.getKey()).append('=').append(entry.getValue());
        }
        return sb.toString();
    }

    /** RSA2（SHA256withRSA）签名，应用私钥为 PKCS8 格式 */
    static String alipaySign(String content, String privateKey) throws GatewayException {
        try {
            java.security.PrivateKey key = java.security.KeyFactory.getInstance("RSA")
                    .generatePrivate(new java.security.spec.PKCS8EncodedKeySpec(Base64.getDecoder().decode(keyBody(privateKey))));
            java.security.Signature signature = java.security.Signature.getInstance("SHA256withRSA");
            signature.initSign(key);
            signature.update(content.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(signature.sign());
        } catch (Exception e) {
            log.warn("支付宝签名失败: {}", e.getClass().getSimpleName());
            throw new GatewayException("应用私钥格式有误，请使用 PKCS8 格式的 RSA2 私钥");
        }
    }

    static boolean alipayRsaVerify(String content, String sign, String publicKey) {
        try {
            java.security.PublicKey key = java.security.KeyFactory.getInstance("RSA")
                    .generatePublic(new java.security.spec.X509EncodedKeySpec(Base64.getDecoder().decode(keyBody(publicKey))));
            java.security.Signature signature = java.security.Signature.getInstance("SHA256withRSA");
            signature.initVerify(key);
            signature.update(content.getBytes(StandardCharsets.UTF_8));
            return signature.verify(Base64.getDecoder().decode(sign.replaceAll("\\s", "")));
        } catch (Exception e) {
            return false;
        }
    }

    static Map<String, String> alipayPrecreateParams(String appId, String orderNo, BigDecimal payAmount, String subject,
                                                     String notifyUrl, String timestamp) {
        JSONObject biz = new JSONObject();
        biz.put("out_trade_no", orderNo);
        biz.put("total_amount", payAmount.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString());
        biz.put("subject", subject);
        Map<String, String> params = new TreeMap<>();
        params.put("app_id", appId);
        params.put("method", "alipay.trade.precreate");
        params.put("format", "JSON");
        params.put("charset", "utf-8");
        params.put("sign_type", "RSA2");
        params.put("timestamp", timestamp);
        params.put("version", "1.0");
        params.put("notify_url", notifyUrl);
        params.put("biz_content", biz.toJSONString());
        return params;
    }

    /** 当面付预下单，返回收款码内容（https://qr.alipay.com/...，手机上打开可直接唤起支付宝） */
    public static String alipayPrecreate(String gateway, String appId, String privateKey, String orderNo, BigDecimal payAmount,
                                         String subject, String notifyUrl) throws GatewayException {
        String timestamp = java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Shanghai"))
                .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        Map<String, String> params = alipayPrecreateParams(appId, orderNo, payAmount, subject, notifyUrl, timestamp);
        params.put("sign", alipaySign(alipaySignContent(params, false), privateKey));

        String url = gateway == null || gateway.isEmpty() ? ALIPAY_DEFAULT_GATEWAY : gateway.trim();
        String resp;
        try {
            Map<String, Object> form = new java.util.HashMap<>(params);
            resp = HttpRequest.post(url + (url.contains("?") ? "&" : "?") + "charset=utf-8")
                    .form(form).timeout(TIMEOUT_MS).execute().body();
        } catch (Exception e) {
            log.warn("支付宝当面付下单请求失败: {}", e.getMessage());
            throw new GatewayException("连接支付宝失败，请稍后重试");
        }
        JSONObject result;
        try {
            result = JSON.parseObject(resp).getJSONObject("alipay_trade_precreate_response");
        } catch (Exception e) {
            result = null;
        }
        if (result == null) {
            log.warn("支付宝当面付响应无法解析: {}", resp);
            throw new GatewayException("支付宝返回了无法识别的响应");
        }
        String qrCode = result.getString("qr_code");
        if (!"10000".equals(result.getString("code")) || qrCode == null || qrCode.isEmpty()) {
            log.warn("支付宝当面付下单失败: {}", result.toJSONString());
            throw new GatewayException("支付宝下单失败：" + firstNonBlank(result.getString("sub_msg"), firstNonBlank(result.getString("msg"), "未知错误")));
        }
        return qrCode;
    }

    /** 支付宝异步通知验签：排除 sign、sign_type 后按升序拼接，用支付宝公钥验 RSA2 签名 */
    public static boolean alipayVerify(Map<String, String> params, String alipayPublicKey) {
        String sign = params.get("sign");
        if (sign == null || sign.isEmpty() || alipayPublicKey == null || alipayPublicKey.isEmpty()) {
            return false;
        }
        return alipayRsaVerify(alipaySignContent(params, true), sign, alipayPublicKey);
    }

    // ========== 微信支付 Native（APIv3，生成 weixin://wxpay/... 收款码） ==========

    public static final String WECHAT_DEFAULT_API = "https://api.mch.weixin.qq.com";
    private static final String WECHAT_NATIVE_PATH = "/v3/pay/transactions/native";
    /** 回调时间戳与当前时间相差超过 5 分钟视为重放 */
    private static final long WECHAT_NOTIFY_MAX_SKEW_SECONDS = 300;

    static java.security.PrivateKey loadPkcs8PrivateKey(String privateKey) throws Exception {
        return java.security.KeyFactory.getInstance("RSA")
                .generatePrivate(new java.security.spec.PKCS8EncodedKeySpec(Base64.getDecoder().decode(keyBody(privateKey))));
    }

    /** 支持直接填公钥，也支持填平台证书（-----BEGIN CERTIFICATE-----） */
    static java.security.PublicKey loadPublicKeyOrCertificate(String value) throws Exception {
        byte[] der = Base64.getDecoder().decode(keyBody(value));
        if (value.contains("CERTIFICATE")) {
            return java.security.cert.CertificateFactory.getInstance("X.509")
                    .generateCertificate(new java.io.ByteArrayInputStream(der)).getPublicKey();
        }
        return java.security.KeyFactory.getInstance("RSA").generatePublic(new java.security.spec.X509EncodedKeySpec(der));
    }

    static String sha256RsaSign(String message, String privateKey) throws GatewayException {
        try {
            java.security.Signature signature = java.security.Signature.getInstance("SHA256withRSA");
            signature.initSign(loadPkcs8PrivateKey(privateKey));
            signature.update(message.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(signature.sign());
        } catch (Exception e) {
            log.warn("微信支付签名失败: {}", e.getClass().getSimpleName());
            throw new GatewayException("商户 API 私钥格式有误，请填写 apiclient_key.pem 的内容");
        }
    }

    /** APIv3 请求签名串：请求方法\nURL 路径\n时间戳\n随机串\n请求体\n */
    static String wechatAuthorization(String mchId, String serialNo, String privateKey, String method, String path,
                                      String body, long timestamp, String nonce) throws GatewayException {
        String message = method + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n" + body + "\n";
        String signature = sha256RsaSign(message, privateKey);
        return "WECHATPAY2-SHA256-RSA2048 mchid=\"" + mchId + "\",nonce_str=\"" + nonce + "\",signature=\"" + signature
                + "\",timestamp=\"" + timestamp + "\",serial_no=\"" + serialNo + "\"";
    }

    /** 金额单位为分 */
    static String wechatNativeBody(String appId, String mchId, String orderNo, BigDecimal payAmount, String description, String notifyUrl) {
        JSONObject amount = new JSONObject();
        amount.put("total", payAmount.movePointRight(2).setScale(0, java.math.RoundingMode.HALF_UP).intValueExact());
        amount.put("currency", "CNY");
        JSONObject body = new JSONObject();
        body.put("appid", appId);
        body.put("mchid", mchId);
        body.put("description", description);
        body.put("out_trade_no", orderNo);
        body.put("notify_url", notifyUrl);
        body.put("amount", amount);
        return body.toJSONString();
    }

    private static String randomNonce() {
        return java.util.UUID.randomUUID().toString().replace("-", "");
    }

    /** Native 下单，返回 code_url（weixin://wxpay/bizpayurl?pr=...），需用微信扫码 */
    public static String wechatNativeCreate(String apiUrl, String appId, String mchId, String serialNo, String privateKey,
                                            String orderNo, BigDecimal payAmount, String description, String notifyUrl) throws GatewayException {
        String body = wechatNativeBody(appId, mchId, orderNo, payAmount, description, notifyUrl);
        String authorization = wechatAuthorization(mchId, serialNo, privateKey, "POST", WECHAT_NATIVE_PATH, body,
                System.currentTimeMillis() / 1000, randomNonce());
        String base = stripTrailingSlash(apiUrl == null || apiUrl.isEmpty() ? WECHAT_DEFAULT_API : apiUrl.trim());
        Map<String, String> headers = new TreeMap<>();
        headers.put("Authorization", authorization);
        headers.put("Accept", "application/json");
        JSONObject resp = postJson(base + WECHAT_NATIVE_PATH, headers, body, "微信支付");
        String codeUrl = resp.getString("code_url");
        if (codeUrl == null || codeUrl.isEmpty()) {
            log.warn("微信支付 Native 下单失败: {}", resp.toJSONString());
            throw new GatewayException("微信支付下单失败：" + firstNonBlank(resp.getString("message"), "未知错误"));
        }
        return codeUrl;
    }

    /** 回调验签：时间戳\n随机串\n请求体\n，用微信支付公钥（或平台证书）验 SHA256withRSA */
    public static boolean wechatVerifyNotify(String timestamp, String nonce, String body, String signature, String publicKey,
                                             long nowSeconds) {
        if (timestamp == null || nonce == null || body == null || signature == null || publicKey == null || publicKey.isEmpty()) {
            return false;
        }
        try {
            if (Math.abs(nowSeconds - Long.parseLong(timestamp.trim())) > WECHAT_NOTIFY_MAX_SKEW_SECONDS) {
                return false;
            }
            java.security.Signature verifier = java.security.Signature.getInstance("SHA256withRSA");
            verifier.initVerify(loadPublicKeyOrCertificate(publicKey));
            verifier.update((timestamp + "\n" + nonce + "\n" + body + "\n").getBytes(StandardCharsets.UTF_8));
            return verifier.verify(Base64.getDecoder().decode(signature.trim()));
        } catch (Exception e) {
            return false;
        }
    }

    /** 用 APIv3 密钥解密回调里的 resource（AEAD_AES_256_GCM），返回交易 JSON；失败返回 null */
    public static JSONObject wechatDecryptResource(JSONObject resource, String apiV3Key) {
        if (resource == null || apiV3Key == null || apiV3Key.getBytes(StandardCharsets.UTF_8).length != 32) {
            return null;
        }
        try {
            javax.crypto.Cipher cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(javax.crypto.Cipher.DECRYPT_MODE,
                    new javax.crypto.spec.SecretKeySpec(apiV3Key.getBytes(StandardCharsets.UTF_8), "AES"),
                    new javax.crypto.spec.GCMParameterSpec(128, resource.getString("nonce").getBytes(StandardCharsets.UTF_8)));
            String aad = resource.getString("associated_data");
            if (aad != null) {
                cipher.updateAAD(aad.getBytes(StandardCharsets.UTF_8));
            }
            byte[] plain = cipher.doFinal(Base64.getDecoder().decode(resource.getString("ciphertext")));
            return JSON.parseObject(new String(plain, StandardCharsets.UTF_8));
        } catch (Exception e) {
            return null;
        }
    }

    private static String firstNonBlank(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value;
    }
}
