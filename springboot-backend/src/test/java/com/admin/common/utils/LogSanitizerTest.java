package com.admin.common.utils;

import com.admin.common.dto.LoginDto;
import com.admin.common.lang.R;
import com.admin.entity.Node;
import com.admin.entity.ViteConfig;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONException;
import com.admin.config.FastjsonSafeModeConfig;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LogSanitizerTest {

    private void assertHidden(String json, String... secrets) {
        for (String secret : secrets) {
            assertFalse(json.contains(secret), secret + " 不应出现在: " + json);
        }
    }

    @Test
    void loginRequestPasswordIsHiddenButUsernameStays() {
        LoginDto dto = new LoginDto();
        dto.setUsername("alice");
        dto.setPassword("S3cretPass");

        String json = LogSanitizer.toSafeJson(dto);

        assertHidden(json, "S3cretPass");
        assertTrue(json.contains("alice"));
    }

    @Test
    void loginResponseTokenIsHiddenAndResponseShapeIsKept() {
        Map<String, Object> data = new HashMap<>();
        data.put("token", "eyJhbGciOi.payload.sig");
        data.put("name", "alice");
        R response = R.ok(data);

        String json = LogSanitizer.toSafeJson(response);

        assertHidden(json, "eyJhbGciOi");
        assertTrue(json.contains("alice"));
        assertEquals(0, JSON.parseObject(json).getIntValue("code"), "数字状态码不能被脱敏");
    }

    @Test
    void generatedAndChangedPasswordsAreHidden() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("generatedPassword", "gen12345");
        body.put("newPassword", "new12345");
        body.put("currentPassword", "cur12345");
        body.put("confirmPassword", "con12345");
        body.put("pwd", "pwd12345");

        assertHidden(LogSanitizer.toSafeJson(body), "gen12345", "new12345", "cur12345", "con12345", "pwd12345");
    }

    @Test
    void secretConfigValuesAreHiddenInEveryShape() {
        Map<String, String> configs = new HashMap<>();
        configs.put("telegram_bot_token", "123:ABC");
        configs.put("payment_config_json", "[{\"config\":{\"secret\":\"merchantKey\"}}]");
        configs.put("telegram_webhook_url", "https://x/webhook/123:ABC");
        configs.put("app_name", "flux");
        String all = LogSanitizer.toSafeJson(R.ok(configs));
        assertHidden(all, "123:ABC", "merchantKey");
        assertTrue(all.contains("flux"));

        Map<String, Object> single = new HashMap<>();
        single.put("name", "payment_config_json");
        single.put("value", "merchantKey");
        assertHidden(LogSanitizer.toSafeJson(single), "merchantKey");

        ViteConfig entity = new ViteConfig();
        entity.setName("telegram_bot_token");
        entity.setValue("123:ABC");
        assertHidden(LogSanitizer.toSafeJson(R.ok(entity)), "123:ABC");
    }

    @Test
    void ordinaryConfigValueIsKept() {
        Map<String, Object> single = new HashMap<>();
        single.put("name", "app_name");
        single.put("value", "flux");
        assertTrue(LogSanitizer.toSafeJson(single).contains("flux"));
    }

    @Test
    void nodeSecretsAndInstallCommandsAreHidden() {
        Map<String, Object> install = new HashMap<>();
        install.put("commandAuto", "curl x | bash -s -- -a addr -s nodeSecret1");
        install.put("offlineCommand", "bash offline.sh -s nodeSecret2");
        install.put("secret", "nodeSecret3");
        install.put("addr", "panel.example.com");
        Node node = new Node();
        node.setName("n1");
        node.setSecret("nodeSecret4");

        String json = LogSanitizer.toSafeJson(Arrays.asList(install, node));

        assertHidden(json, "nodeSecret1", "nodeSecret2", "nodeSecret3", "nodeSecret4");
        assertTrue(json.contains("panel.example.com"));
    }

    @Test
    void flowUploadSecretQueryParamIsHidden() {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("rawData", "{\"n\":\"1_5_-1_tcp\"}");
        params.put("secret", "nodeSecret5");

        assertHidden(LogSanitizer.toSafeJson(params), "nodeSecret5");
    }

    @Test
    void redeemAndBindCodesAreHidden() {
        String json = LogSanitizer.toSafeJson(Collections.singletonList(Map.of(
                "redeemCode", "RC1234", "code", "BC5678", "telegramBindCode", "654321")));

        assertHidden(json, "RC1234", "BC5678", "654321");
    }

    @Test
    void nullsAndPlainValuesAreSafe() {
        assertEquals("null", LogSanitizer.toSafeJson(null));
        assertEquals("\"ok\"", LogSanitizer.toSafeJson("ok"));
        Map<String, Object> body = new HashMap<>();
        body.put("password", null);
        assertEquals("{}", LogSanitizer.toSafeJson(body));
    }

    @Test
    void botTokenIsRemovedFromErrorMessages() {
        String message = "I/O error on POST request for \"https://api.telegram.org/bot123:ABC/sendMessage\": timeout";
        assertEquals("I/O error on POST request for \"https://api.telegram.org/bot***/sendMessage\": timeout",
                LogSanitizer.maskBotToken(message));
        assertHidden(LogSanitizer.maskBotToken("https://x/api/v1/telegram/webhook/123:ABC failed"), "123:ABC");
        assertNull(LogSanitizer.maskBotToken(null));
    }

    @Test
    void safeModeRejectsAutoTypeButStillParsesNormalReports() {
        new FastjsonSafeModeConfig().enableSafeMode();

        assertThrows(JSONException.class, () ->
                JSON.parseObject("{\"@type\":\"java.net.InetAddress\",\"val\":\"example.com\"}"));

        com.admin.common.dto.FlowDto flow = JSON.parseObject("{\"n\":\"1_5_-1_tcp\",\"u\":1,\"d\":2}", com.admin.common.dto.FlowDto.class);
        assertEquals("1_5_-1_tcp", flow.getN());
        assertEquals(2L, flow.getD());
    }
}
