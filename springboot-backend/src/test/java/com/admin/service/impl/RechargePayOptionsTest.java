package com.admin.service.impl;

import com.alibaba.fastjson.JSONObject;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RechargePayOptionsTest {

    @Test
    void payTypesDefaultToNoneAndDropUnknown() {
        assertEquals(Collections.emptyList(), RechargeServiceImpl.allowedPayTypes(new JSONObject()));
        JSONObject channel = JSONObject.parseObject("{\"payTypes\":[\"wxpay\",\"bank\",\"alipay\",\"wxpay\"]}");
        assertEquals(Arrays.asList("wxpay", "alipay"), RechargeServiceImpl.allowedPayTypes(channel));
        assertEquals(Collections.emptyList(), RechargeServiceImpl.allowedPayTypes(JSONObject.parseObject("{\"payTypes\":[]}")));
    }

    @Test
    void feeRateParsing() {
        assertEquals(0, BigDecimal.ZERO.compareTo(RechargeServiceImpl.parseFeeRate(null)));
        assertEquals(0, BigDecimal.ZERO.compareTo(RechargeServiceImpl.parseFeeRate("0.0")));
        assertEquals(0, new BigDecimal("3").compareTo(RechargeServiceImpl.parseFeeRate(" 3 ")));
        assertNull(RechargeServiceImpl.parseFeeRate("-1"));
        assertNull(RechargeServiceImpl.parseFeeRate("101"));
        assertNull(RechargeServiceImpl.parseFeeRate("abc"));
    }

    @Test
    void payAmountAddsRoundedFee() {
        assertEquals("103.00", RechargeServiceImpl.payAmountOf(new BigDecimal("100.00"), new BigDecimal("3")).toPlainString());
        assertEquals("10.00", RechargeServiceImpl.payAmountOf(new BigDecimal("10.00"), BigDecimal.ZERO).toPlainString());
        // 0.15 × 2.5% = 0.00375 → 0.00
        assertEquals("0.15", RechargeServiceImpl.payAmountOf(new BigDecimal("0.15"), new BigDecimal("2.5")).toPlainString());
        // 1.00 × 0.6% = 0.006 → 0.01
        assertEquals("1.01", RechargeServiceImpl.payAmountOf(new BigDecimal("1.00"), new BigDecimal("0.6")).toPlainString());
    }

    @Test
    void configCompletenessPerType() {
        assertTrue(RechargeServiceImpl.isConfigComplete("epay", JSONObject.parseObject("{\"url\":\"u\",\"pid\":\"1\",\"secret\":\"s\"}")));
        assertFalse(RechargeServiceImpl.isConfigComplete("epay", JSONObject.parseObject("{\"url\":\"u\",\"secret\":\"s\"}")));
        assertTrue(RechargeServiceImpl.isConfigComplete("epusdt", JSONObject.parseObject("{\"url\":\"u\",\"secret\":\"s\"}")));
        assertFalse(RechargeServiceImpl.isConfigComplete("tokenpay", JSONObject.parseObject("{\"url\":\"u\",\"secret\":\"s\"}")));
        assertTrue(RechargeServiceImpl.isConfigComplete("tokenpay", JSONObject.parseObject("{\"url\":\"u\",\"secret\":\"s\",\"currency\":\"USDT_TRC20\"}")));
        assertTrue(RechargeServiceImpl.isConfigComplete("cryptomus", JSONObject.parseObject("{\"pid\":\"m\",\"secret\":\"s\"}")));
        assertTrue(RechargeServiceImpl.isConfigComplete("alipayf2f", JSONObject.parseObject("{\"pid\":\"2021\",\"secret\":\"k\",\"publicKey\":\"p\"}")));
        assertFalse(RechargeServiceImpl.isConfigComplete("alipayf2f", JSONObject.parseObject("{\"pid\":\"2021\",\"secret\":\"k\"}")));
        assertTrue(RechargeServiceImpl.isConfigComplete("wechatnative", JSONObject.parseObject(
                "{\"pid\":\"1900\",\"appId\":\"wx\",\"serialNo\":\"S\",\"secret\":\"k\",\"apiV3Key\":\"v\",\"publicKey\":\"p\"}")));
        assertFalse(RechargeServiceImpl.isConfigComplete("wechatnative", JSONObject.parseObject(
                "{\"pid\":\"1900\",\"appId\":\"wx\",\"secret\":\"k\",\"apiV3Key\":\"v\",\"publicKey\":\"p\"}")));
        assertFalse(RechargeServiceImpl.isConfigComplete("unknown", JSONObject.parseObject("{\"url\":\"u\",\"pid\":\"1\",\"secret\":\"s\"}")));
    }

    @Test
    void cryptomusAmountConversion() {
        assertEquals("103.00", RechargeServiceImpl.cryptomusAmount(new BigDecimal("103"), "CNY", null).toPlainString());
        // 100 ÷ 7.2 = 13.888… 向上取整到 13.89
        assertEquals("13.89", RechargeServiceImpl.cryptomusAmount(new BigDecimal("100.00"), "USD", "7.2").toPlainString());
        assertNull(RechargeServiceImpl.cryptomusAmount(new BigDecimal("100.00"), "USD", null));
        assertNull(RechargeServiceImpl.cryptomusAmount(new BigDecimal("100.00"), "USD", "0"));
        assertEquals("USD", RechargeServiceImpl.cryptomusCurrency(JSONObject.parseObject("{\"currency\":\" usd \"}")));
        assertEquals("CNY", RechargeServiceImpl.cryptomusCurrency(new JSONObject()));
    }
}
