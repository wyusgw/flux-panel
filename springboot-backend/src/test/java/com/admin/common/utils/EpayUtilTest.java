package com.admin.common.utils;

import cn.hutool.crypto.digest.DigestUtil;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EpayUtilTest {

    @Test
    void signFollowsEpaySpec() {
        Map<String, String> params = new HashMap<>();
        params.put("pid", "1001");
        params.put("type", "alipay");
        params.put("money", "1.00");
        params.put("name", "");
        params.put("sign_type", "MD5");
        // 按 key 升序、排除空值与 sign_type，密钥直接拼在最后（前面没有 &）
        String expected = DigestUtil.md5Hex("money=1.00&pid=1001&type=alipayKEY");
        assertEquals(expected, EpayUtil.sign(params, "KEY"));
    }

    @Test
    void verifyChecksSign() {
        Map<String, String> params = new HashMap<>();
        params.put("out_trade_no", "RC1");
        params.put("money", "10.00");
        params.put("sign", EpayUtil.sign(params, "KEY"));
        assertTrue(EpayUtil.verify(params, "KEY"));
        assertFalse(EpayUtil.verify(params, "OTHER"));
        params.put("money", "0.01");
        assertFalse(EpayUtil.verify(params, "KEY"));
    }
}
