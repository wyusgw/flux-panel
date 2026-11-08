package com.admin.service.impl;

import com.alibaba.fastjson.JSONObject;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class RechargePayOptionsTest {

    @Test
    void payTypesDefaultToAlipayAndDropUnknown() {
        assertEquals(Collections.singletonList("alipay"), RechargeServiceImpl.allowedPayTypes(new JSONObject()));
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
}
