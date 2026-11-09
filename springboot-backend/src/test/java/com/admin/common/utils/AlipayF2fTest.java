package com.admin.common.utils;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AlipayF2fTest {

    @Test
    void signContentSortsAndSkipsSignFields() {
        Map<String, String> params = new HashMap<>();
        params.put("total_amount", "10.00");
        params.put("app_id", "2021");
        params.put("sign", "xxx");
        params.put("sign_type", "RSA2");
        params.put("empty", "");
        assertEquals("app_id=2021&sign_type=RSA2&total_amount=10.00", PaymentGatewayUtil.alipaySignContent(params, false));
        assertEquals("app_id=2021&total_amount=10.00", PaymentGatewayUtil.alipaySignContent(params, true));
    }

    @Test
    void precreateParams() {
        Map<String, String> params = PaymentGatewayUtil.alipayPrecreateParams("2021", "RC1", new BigDecimal("10.5"),
                "钱包充值", "https://a.com/n", "2026-11-08 12:00:00");
        assertEquals("alipay.trade.precreate", params.get("method"));
        assertEquals("RSA2", params.get("sign_type"));
        assertEquals("{\"out_trade_no\":\"RC1\",\"total_amount\":\"10.50\",\"subject\":\"钱包充值\"}", params.get("biz_content"));
    }

    @Test
    void signAndVerifyRoundTripWithPemKeys() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        KeyPair pair = generator.generateKeyPair();
        String privateKey = "-----BEGIN PRIVATE KEY-----\n"
                + Base64.getMimeEncoder().encodeToString(pair.getPrivate().getEncoded()) + "\n-----END PRIVATE KEY-----";
        String publicKey = Base64.getEncoder().encodeToString(pair.getPublic().getEncoded());

        Map<String, String> params = new HashMap<>();
        params.put("out_trade_no", "RC1");
        params.put("total_amount", "10.00");
        params.put("trade_status", "TRADE_SUCCESS");
        params.put("sign_type", "RSA2");
        params.put("sign", PaymentGatewayUtil.alipaySign(PaymentGatewayUtil.alipaySignContent(params, true), privateKey));

        assertTrue(PaymentGatewayUtil.alipayVerify(params, publicKey));
        params.put("total_amount", "0.01");
        assertFalse(PaymentGatewayUtil.alipayVerify(params, publicKey));
        assertFalse(PaymentGatewayUtil.alipayVerify(params, "not a key"));
    }

    @Test
    void badPrivateKeyGivesReadableError() {
        PaymentGatewayUtil.GatewayException e = assertThrows(PaymentGatewayUtil.GatewayException.class,
                () -> PaymentGatewayUtil.alipaySign("a=1", "not a key"));
        assertTrue(e.getMessage().contains("PKCS8"));
    }
}
