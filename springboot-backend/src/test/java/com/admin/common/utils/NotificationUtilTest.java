package com.admin.common.utils;

import com.admin.entity.DeviceGroup;
import com.admin.entity.Node;
import com.admin.entity.User;
import com.admin.entity.ViteConfig;
import com.admin.service.DeviceGroupService;
import com.admin.service.TaskQueueService;
import com.admin.service.TelegramSendLogService;
import com.admin.service.UserService;
import com.admin.service.ViteConfigService;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotificationUtilTest {

    private final UserService userService = mock(UserService.class);
    private final DeviceGroupService deviceGroupService = mock(DeviceGroupService.class);
    private final ViteConfigService configService = mock(ViteConfigService.class);
    private final TaskQueueService queue = mock(TaskQueueService.class);
    private final NotificationUtil notification = new NotificationUtil();

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(notification, "userService", userService);
        ReflectionTestUtils.setField(notification, "deviceGroupService", deviceGroupService);
        ReflectionTestUtils.setField(notification, "viteConfigService", configService);
        ReflectionTestUtils.setField(notification, "taskQueueService", queue);
        ReflectionTestUtils.setField(notification, "telegramSendLogService", mock(TelegramSendLogService.class));
        ViteConfig config = new ViteConfig();
        config.setValue("token");
        // 只有 Bot Token 有值，消息模板走默认值
        when(configService.getOne(any())).thenAnswer(invocation -> {
            com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<?> wrapper = invocation.getArgument(0);
            wrapper.getSqlSegment();
            return wrapper.getParamNameValuePairs().containsValue("telegram_bot_token") ? config : null;
        });
        // 默认这个 Telegram 关联了多个账号，只关联一个的情况单独测试
        when(userService.count(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(2);
        when(deviceGroupService.list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(Collections.<DeviceGroup>emptyList());
    }

    private static User user(long id, String name, int role, String chatId) {
        User user = new User();
        user.setId(id);
        user.setUser(name);
        user.setRoleId(role);
        user.setTelegramChatId(chatId);
        user.setNotifyDeviceMode(3);
        user.setNotifyRenewMode(1);
        user.setNotifyExpiryMode(1);
        user.setNotifyFlowMode(1);
        user.setNotifyPaymentMode(1);
        return user;
    }

    private List<JSONObject> sent() {
        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(queue, atLeast(0)).enqueue(eq("TELEGRAM_NOTIFY"), isNull(), payload.capture(), any(), isNull());
        return payload.getAllValues().stream().map(JSON::parseObject).collect(Collectors.toList());
    }

    private void deviceOffline(User... candidates) {
        when(userService.list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(new ArrayList<>(Arrays.asList(candidates)));
        Node node = new Node();
        node.setId(1L);
        node.setName("HK-1");
        notification.notifyDeviceStatus(node, false);
    }

    @Test
    void sameTelegramGetsOneDeviceMessageListingAccounts() {
        deviceOffline(user(1, "alice", 1, "100"), user(2, "bob", 1, "100"));
        List<JSONObject> messages = sent();
        assertEquals(1, messages.size());
        assertEquals("100", messages.get(0).getString("chatId"));
        assertTrue(messages.get(0).getString("text").contains("账号：alice、bob"));
        assertTrue(messages.get(0).getString("text").contains("HK-1"));
    }

    @Test
    void differentTelegramsEachGetTheirOwnMessage() {
        deviceOffline(user(1, "alice", 1, "100"), user(2, "bob", 1, "200"), user(3, "carol", 1, "100"));
        List<JSONObject> messages = sent();
        assertEquals(2, messages.size());
        assertTrue(messages.get(0).getString("text").contains("账号：alice、carol"));
        assertEquals("200", messages.get(1).getString("chatId"));
        assertTrue(messages.get(1).getString("text").contains("账号：bob"));
    }

    @Test
    void adminStyleWinsWhenAnyMergedAccountIsAdmin() {
        deviceOffline(user(1, "alice", 1, "100"), user(2, "root", 0, "100"), user(3, "bob", 1, "200"));
        List<JSONObject> messages = sent();
        assertTrue(messages.get(0).getString("text").contains("[管理员通知]"));
        assertFalse(messages.get(1).getString("text").contains("[管理员通知]"));
    }

    @Test
    void accountsNotInScopeAreNotListed() {
        User off = user(2, "bob", 1, "100");
        off.setNotifyDeviceMode(0);
        deviceOffline(user(1, "alice", 1, "100"), off);
        String text = sent().get(0).getString("text");
        assertTrue(text.contains("账号：alice"));
        assertFalse(text.contains("bob"));
    }

    @Test
    void personalNotificationsKeepOnePerAccountWithItsName() {
        notification.notifyExpiryReminder(user(1, "alice", 1, "100"), 3);
        notification.notifyExpiryReminder(user(2, "bob", 1, "100"), 5);
        List<JSONObject> messages = sent();
        assertEquals(2, messages.size());
        assertTrue(messages.get(0).getString("text").contains("账号：alice"));
        assertTrue(messages.get(1).getString("text").contains("账号：bob"));
    }

    @Test
    void everyPersonalNotificationCarriesTheAccountName() {
        User alice = user(1, "alice", 1, "100");
        notification.notifyPaymentSuccess(alice, BigDecimal.ONE, BigDecimal.TEN);
        notification.notifyRenewSuccess(alice, BigDecimal.ONE);
        notification.notifyRenewFailed(alice, "x");
        notification.notifyExpiryReminder(alice, 1);
        notification.notifyFlowReminder(alice, 90);
        List<JSONObject> messages = sent();
        assertEquals(5, messages.size());
        messages.forEach(message -> assertTrue(message.getString("text").contains("账号：alice"), message.getString("text")));
    }

    @Test
    void accountNameIsEscapedForTelegramHtml() {
        notification.notifyExpiryReminder(user(1, "a<b>&c", 1, "100"), 1);
        assertTrue(sent().get(0).getString("text").contains("账号：a&lt;b&gt;&amp;c"));
    }

    @Test
    void singleBoundAccountGetsNoAccountLine() {
        when(userService.count(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(1);
        User alice = user(1, "alice", 1, "100");
        notification.notifyPaymentSuccess(alice, BigDecimal.ONE, BigDecimal.TEN);
        notification.notifyRenewSuccess(alice, BigDecimal.ONE);
        notification.notifyRenewFailed(alice, "x");
        notification.notifyExpiryReminder(alice, 1);
        notification.notifyFlowReminder(alice, 90);
        deviceOffline(alice);
        List<JSONObject> messages = sent();
        assertEquals(6, messages.size());
        messages.forEach(message -> {
            assertFalse(message.getString("text").contains("账号："), message.getString("text"));
            assertFalse(message.getString("text").contains("alice"), message.getString("text"));
            assertTrue(message.getString("text").contains("</b>\n\n"), message.getString("text"));
        });
    }

    @Test
    void twoBoundAccountsShowTheNameEvenWhenOnlyOneIsInScope() {
        User off = user(2, "bob", 1, "100");
        off.setNotifyDeviceMode(0);
        deviceOffline(user(1, "alice", 1, "100"), off);
        assertTrue(sent().get(0).getString("text").contains("账号：alice"));
    }

    @Test
    void noRecipientsMeansNoMessage() {
        User off = user(1, "alice", 1, "100");
        off.setNotifyDeviceMode(0);
        deviceOffline(off);
        verify(queue, never()).enqueue(anyString(), any(), anyString(), any(), any());
    }
}
