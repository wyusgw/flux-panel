package com.admin.service.impl;

import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ViteConfigDemoEditTest {

    @Test
    void siteAreaOpensOnlyHarmlessDisplayConfigs() {
        Set<String> site = Set.of("site");
        assertTrue(ViteConfigServiceImpl.isDemoEditable("app_name", site));
        assertTrue(ViteConfigServiceImpl.isDemoEditable("site_announcement", site));
        for (String name : new String[]{"allow_register", "invite_register_policy", "captcha_enabled", "captcha_provider",
                "captcha_google_secret_key", "payment_config_json", "payment_min_amount", "ip", "looking_glass_hide_ip",
                "node_traffic_reset_day", "error_log_retention_days", "telegram_bot_token", "telegram_tpl_device_offline", "some_new_key"}) {
            assertFalse(ViteConfigServiceImpl.isDemoEditable(name, site), name);
        }
    }

    @Test
    void pushAreaOpensTemplatesButNotTheBot() {
        Set<String> push = Set.of("push");
        assertTrue(ViteConfigServiceImpl.isDemoEditable("telegram_tpl_device_offline", push));
        assertTrue(ViteConfigServiceImpl.isDemoEditable("device_offline_grace_seconds", push));
        assertTrue(ViteConfigServiceImpl.isDemoEditable("telegram_reminder_hour", push));
        for (String name : new String[]{"telegram_enabled", "telegram_bot_token", "telegram_webhook_url", "telegram_update_offset", "app_name"}) {
            assertFalse(ViteConfigServiceImpl.isDemoEditable(name, push), name);
        }
    }

    @Test
    void noAreaOpensNothing() {
        assertFalse(ViteConfigServiceImpl.isDemoEditable("app_name", Set.of()));
    }
}
