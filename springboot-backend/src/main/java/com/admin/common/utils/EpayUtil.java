package com.admin.common.utils;

import cn.hutool.crypto.digest.DigestUtil;

import java.util.Map;
import java.util.TreeMap;

/**
 * 易支付（EPay）签名工具类
 * 协议：参数按 key 的 ASCII 升序排序，拼接为 key1=value1&key2=value2...，
 * 末尾追加商户密钥后取 MD5（小写十六进制）。参与签名时排除 sign、sign_type 及空值参数。
 */
public class EpayUtil {

    private EpayUtil() {
    }

    /**
     * 生成签名
     *
     * @param params      参与签名的参数（不含 sign、sign_type）
     * @param merchantKey 商户密钥
     * @return 小写十六进制 MD5 签名
     */
    public static String sign(Map<String, String> params, String merchantKey) {
        TreeMap<String, String> sorted = new TreeMap<>();
        for (Map.Entry<String, String> entry : params.entrySet()) {
            String key = entry.getKey();
            String value = entry.getValue();
            if (value == null || value.isEmpty() || "sign".equals(key) || "sign_type".equals(key)) {
                continue;
            }
            sorted.put(key, value);
        }

        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> entry : sorted.entrySet()) {
            sb.append(entry.getKey()).append('=').append(entry.getValue()).append('&');
        }
        sb.append(merchantKey);

        return DigestUtil.md5Hex(sb.toString());
    }

    /**
     * 校验签名（用于异步通知回调）
     */
    public static boolean verify(Map<String, String> params, String merchantKey) {
        String receivedSign = params.get("sign");
        if (receivedSign == null || receivedSign.isEmpty()) {
            return false;
        }
        String expected = sign(params, merchantKey);
        return expected.equalsIgnoreCase(receivedSign);
    }
}
