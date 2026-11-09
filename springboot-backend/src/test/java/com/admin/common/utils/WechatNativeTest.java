package com.admin.common.utils;

import com.alibaba.fastjson2.JSONObject;
import org.junit.jupiter.api.Test;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WechatNativeTest {

    private static final String V3_KEY = "0123456789abcdef0123456789abcdef";

    @Test
    void nativeBodyUsesCents() {
        String body = PaymentGatewayUtil.wechatNativeBody("wxAPP", "1900", "RC1", new BigDecimal("10.5"), "钱包充值", "https://a.com/n");
        assertEquals("{\"appid\":\"wxAPP\",\"mchid\":\"1900\",\"description\":\"钱包充值\",\"out_trade_no\":\"RC1\","
                + "\"notify_url\":\"https://a.com/n\",\"amount\":{\"total\":1050,\"currency\":\"CNY\"}}", body);
    }

    @Test
    void authorizationSignsRequestAndNotifyVerifies() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        KeyPair pair = generator.generateKeyPair();
        String privateKey = "-----BEGIN PRIVATE KEY-----\n"
                + Base64.getMimeEncoder().encodeToString(pair.getPrivate().getEncoded()) + "\n-----END PRIVATE KEY-----\n";
        String publicKey = Base64.getEncoder().encodeToString(pair.getPublic().getEncoded());

        String auth = PaymentGatewayUtil.wechatAuthorization("1900", "SERIAL", privateKey, "POST",
                "/v3/pay/transactions/native", "{}", 1700000000L, "N1");
        assertTrue(auth.startsWith("WECHATPAY2-SHA256-RSA2048 mchid=\"1900\",nonce_str=\"N1\",signature=\""));
        assertTrue(auth.endsWith(",timestamp=\"1700000000\",serial_no=\"SERIAL\""));

        String body = "{\"event_type\":\"TRANSACTION.SUCCESS\",\"summary\":\"支付成功\"}";
        Signature signer = Signature.getInstance("SHA256withRSA");
        signer.initSign(pair.getPrivate());
        signer.update(("1700000000\nNONCE\n" + body + "\n").getBytes(StandardCharsets.UTF_8));
        String sign = Base64.getEncoder().encodeToString(signer.sign());

        assertTrue(PaymentGatewayUtil.wechatVerifyNotify("1700000000", "NONCE", body, sign, publicKey, 1700000100L));
        assertFalse(PaymentGatewayUtil.wechatVerifyNotify("1700000000", "NONCE", body + " ", sign, publicKey, 1700000100L));
        // 超过 5 分钟视为重放
        assertFalse(PaymentGatewayUtil.wechatVerifyNotify("1700000000", "NONCE", body, sign, publicKey, 1700001000L));
        assertFalse(PaymentGatewayUtil.wechatVerifyNotify(null, "NONCE", body, sign, publicKey, 1700000100L));
    }

    @Test
    void decryptResource() throws Exception {
        String plain = "{\"out_trade_no\":\"RC1\",\"trade_state\":\"SUCCESS\"}";
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(V3_KEY.getBytes(StandardCharsets.UTF_8), "AES"),
                new GCMParameterSpec(128, "abcdefghijkl".getBytes(StandardCharsets.UTF_8)));
        cipher.updateAAD("transaction".getBytes(StandardCharsets.UTF_8));
        JSONObject resource = new JSONObject();
        resource.put("ciphertext", Base64.getEncoder().encodeToString(cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8))));
        resource.put("nonce", "abcdefghijkl");
        resource.put("associated_data", "transaction");

        assertEquals("RC1", PaymentGatewayUtil.wechatDecryptResource(resource, V3_KEY).getString("out_trade_no"));
        assertNull(PaymentGatewayUtil.wechatDecryptResource(resource, "fedcba9876543210fedcba9876543210"));
        assertNull(PaymentGatewayUtil.wechatDecryptResource(resource, "short"));
    }
}
