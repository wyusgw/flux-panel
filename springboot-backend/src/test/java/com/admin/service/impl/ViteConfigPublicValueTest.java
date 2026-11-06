package com.admin.service.impl;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ViteConfigPublicValueTest {

    @Test
    void secretsAreHiddenFromEveryoneButRealAdmin() {
        assertTrue(ViteConfigServiceImpl.isSecretConfig("captcha_google_secret_key"));
        assertTrue(ViteConfigServiceImpl.isSecretConfig("telegram_bot_token"));
        assertTrue(ViteConfigServiceImpl.isSecretConfig("telegram_webhook_url"));
        assertFalse(ViteConfigServiceImpl.isSecretConfig("captcha_google_site_key"));
        assertFalse(ViteConfigServiceImpl.isSecretConfig("app_name"));
    }

    @Test
    void paymentChannelsKeepPublicFieldsAndLoseCredentials() {
        String raw = "[{\"id\":\"a\",\"name\":\"Pay\",\"type\":\"epay\",\"enabled\":true,\"config\":{\"url\":\"https://x\",\"pid\":\"1\",\"secret\":\"SECRET\"}}]";
        String result = ViteConfigServiceImpl.publicValue("payment_config_json", raw);
        assertFalse(result.contains("SECRET"));
        assertFalse(result.contains("https://x"));
        assertFalse(result.contains("config"));
        assertTrue(result.contains("\"name\":\"Pay\""));
        assertTrue(result.contains("\"enabled\":true"));
    }

    @Test
    void brokenPaymentConfigNeverLeaksOriginalText() {
        assertEquals("[]", ViteConfigServiceImpl.publicValue("payment_config_json", "SECRET not json"));
        assertEquals("[]", ViteConfigServiceImpl.publicValue("payment_config_json", null));
        assertEquals("flux", ViteConfigServiceImpl.publicValue("app_name", "flux"));
    }
}
