package com.admin.common.task;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TelegramPollingTaskTest {

    @Test
    void normalizeCommandStripsBotUsername() {
        assertEquals("/help", TelegramPollingTask.normalizeCommand("/help@demo_bot"));
        assertEquals("/bind ABC123", TelegramPollingTask.normalizeCommand("/bind@demo_bot ABC123"));
        assertEquals("/bind ABC123", TelegramPollingTask.normalizeCommand("/bind ABC123"));
        assertEquals("/start", TelegramPollingTask.normalizeCommand("/start"));
        assertEquals("hello@x", TelegramPollingTask.normalizeCommand("hello@x"));
    }

    @Test
    void menuCommandsAreValid() {
        for (String[] c : TelegramPollingTask.MENU_COMMANDS) {
            assertTrue(c[0].matches("[a-z0-9_]{1,32}"), c[0]);
            assertTrue(c[1].length() >= 1 && c[1].length() <= 256, c[1]);
        }
    }
}
