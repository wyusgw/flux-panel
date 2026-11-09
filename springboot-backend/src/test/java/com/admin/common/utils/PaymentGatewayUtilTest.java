package com.admin.common.utils;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 期望签名由独立脚本按各网关文档算法算出，不是用被测代码生成的 */
class PaymentGatewayUtilTest {

    @Test
    void epusdtAmountMatchesGoFloatFormat() {
        assertEquals("10.5", PaymentGatewayUtil.epusdtAmount(new BigDecimal("10.50")));
        assertEquals("10", PaymentGatewayUtil.epusdtAmount(new BigDecimal("10.00")));
        assertEquals("100", PaymentGatewayUtil.epusdtAmount(new BigDecimal("100.00")));
        assertEquals("0.01", PaymentGatewayUtil.epusdtAmount(new BigDecimal("0.01")));
    }

    @Test
    void epusdtCreateSignature() {
        JSONObject body = PaymentGatewayUtil.epusdtCreateBody("RC1", new BigDecimal("10.50"),
                "https://a.com/n", "https://a.com/shop", "TOKEN");
        assertEquals("8a487557fc69572cb7fcf0ecefcadfcc", body.getString("signature"));
    }

    @Test
    void epusdtNotifyVerifyUsesRawNumbers() {
        JSONObject body = JSON.parseObject("{\"order_id\":\"RC1\",\"amount\":10.5,\"notify_url\":\"https://a.com/n\","
                + "\"redirect_url\":\"https://a.com/shop\",\"signature\":\"8a487557fc69572cb7fcf0ecefcadfcc\"}");
        assertTrue(PaymentGatewayUtil.epusdtVerify(body, "TOKEN"));
        assertFalse(PaymentGatewayUtil.epusdtVerify(body, "OTHER"));
        body.put("amount", new BigDecimal("0.01"));
        assertFalse(PaymentGatewayUtil.epusdtVerify(body, "TOKEN"));
    }

    @Test
    void tokenpayCreateSignature() {
        JSONObject body = PaymentGatewayUtil.tokenpayCreateBody("RC1", "7", new BigDecimal("10"), "USDT_TRC20",
                "https://a.com/n", "https://a.com/shop", "TOKEN");
        assertEquals("3d2e18ee881b6987d0cf1317f1081ceb", body.getString("Signature"));
        String json = body.toJSONString();
        assertTrue(json.contains("\"ActualAmount\":10.00"), json);
    }

    @Test
    void tokenpayNotifyKeepsDecimalScale() {
        JSONObject body = JSON.parseObject("{\"ActualAmount\":10.00,\"Currency\":\"USDT_TRC20\",\"NotifyUrl\":\"https://a.com/n\","
                + "\"OrderUserKey\":\"7\",\"OutOrderId\":\"RC1\",\"RedirectUrl\":\"https://a.com/shop\","
                + "\"Signature\":\"3d2e18ee881b6987d0cf1317f1081ceb\"}");
        assertTrue(PaymentGatewayUtil.tokenpayVerify(body, "TOKEN"));
    }

    @Test
    void cryptomusWebhookVerify() {
        String raw = "{\"type\":\"payment\",\"uuid\":\"u-1\",\"order_id\":\"RC1\",\"amount\":\"10.00\",\"status\":\"paid\","
                + "\"url\":\"https:\\/\\/x.com\\/a\",\"additional_data\":null,\"is_final\":true,"
                + "\"sign\":\"917c7371bab69e3025d184e72bcbdf73\"}";
        assertTrue(PaymentGatewayUtil.cryptomusVerify(raw, "KEY"));
        assertFalse(PaymentGatewayUtil.cryptomusVerify(raw, "OTHER"));
        assertFalse(PaymentGatewayUtil.cryptomusVerify(raw.replace("10.00", "99.00"), "KEY"));
        // 网关发来的斜杠没有转义时，重新编码后仍按 PHP 格式计算
        assertTrue(PaymentGatewayUtil.cryptomusVerify(raw.replace("\\/", "/"), "KEY"));
        assertFalse(PaymentGatewayUtil.cryptomusVerify("not json", "KEY"));
    }

    @Test
    void cryptomusRequestSign() {
        String body = PaymentGatewayUtil.cryptomusCreateBody("RC1", new BigDecimal("10.00"), "CNY", "https://a.com/n", "https://a.com/shop");
        assertTrue(body.startsWith("{\"amount\":\"10.00\",\"currency\":\"CNY\",\"order_id\":\"RC1\""), body);
        assertEquals(32, PaymentGatewayUtil.cryptomusSign(body, "KEY").length());
    }
}
