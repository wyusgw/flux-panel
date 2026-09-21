package com.admin.common.utils;

import com.admin.entity.DeviceGroup;
import com.admin.entity.Node;
import com.admin.entity.User;
import com.admin.entity.ViteConfig;
import com.admin.service.DeviceGroupService;
import com.admin.service.UserService;
import com.admin.service.ViteConfigService;
import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 个人中心「推送信息」的实际发送方：充值到账、设备离线/恢复的 Telegram 通知。
 * 所有方法均对异常静默降级，绝不影响调用方的主流程（充值确认、节点连接处理）。
 */
@Slf4j
@Component
public class NotificationUtil {

    @Resource
    private UserService userService;

    @Resource
    private DeviceGroupService deviceGroupService;

    @Resource
    private ViteConfigService viteConfigService;

    /**
     * 充值成功通知
     */
    public void notifyPaymentSuccess(User user, BigDecimal amount, BigDecimal newBalance) {
        try {
            if (user == null || isBlank(user.getTelegramChatId())) return;
            if (user.getNotifyPaymentMode() == null || user.getNotifyPaymentMode() != 1) return;
            String token = getConfigValue("telegram_bot_token");
            if (isBlank(token)) return;

            String text = String.format("充值成功\n金额：￥%s\n当前余额：￥%s", amount.toPlainString(), newBalance.toPlainString());
            TelegramBotUtil.sendMessage(token, user.getTelegramChatId(), text);
        } catch (Exception e) {
            log.warn("发送充值通知失败: {}", e.getMessage());
        }
    }

    /**
     * 设备离线/恢复通知
     */
    public void notifyDeviceStatus(Node node, boolean online) {
        try {
            if (node == null || node.getId() == null) return;
            String token = getConfigValue("telegram_bot_token");
            if (isBlank(token)) return;

            List<DeviceGroup> groups = deviceGroupService.list(new QueryWrapper<DeviceGroup>().eq("node_id", node.getId()));
            List<Long> nodeGroupIds = groups.stream().map(DeviceGroup::getId).collect(Collectors.toList());

            List<User> candidates = userService.list(new QueryWrapper<User>()
                    .ne("notify_device_mode", 0)
                    .isNotNull("telegram_chat_id"));
            if (candidates.isEmpty()) return;

            String text = online
                    ? String.format("设备「%s」已恢复在线", node.getName())
                    : String.format("设备「%s」已离线", node.getName());

            for (User candidate : candidates) {
                if (isBlank(candidate.getTelegramChatId())) continue;
                if (!shouldNotifyDevice(candidate, nodeGroupIds)) continue;
                TelegramBotUtil.sendMessage(token, candidate.getTelegramChatId(), text);
            }

            // 管理员无条件接收全部设备上下线通知，不受各自 notify_device_mode 偏好限制
            List<User> admins = userService.list(new QueryWrapper<User>()
                    .eq("role_id", 0)
                    .isNotNull("telegram_chat_id"));
            for (User admin : admins) {
                if (isBlank(admin.getTelegramChatId())) continue;
                TelegramBotUtil.sendMessage(token, admin.getTelegramChatId(), "[管理员通知] " + text);
            }
        } catch (Exception e) {
            log.warn("发送设备状态通知失败: {}", e.getMessage());
        }
    }

    /**
     * 自动续费成功通知
     */
    public void notifyRenewSuccess(User user, BigDecimal amount) {
        try {
            if (user == null || isBlank(user.getTelegramChatId())) return;
            String token = getConfigValue("telegram_bot_token");
            if (isBlank(token)) return;
            String text = String.format("自动续费成功\n扣款金额：￥%s", amount.toPlainString());
            TelegramBotUtil.sendMessage(token, user.getTelegramChatId(), text);
        } catch (Exception e) {
            log.warn("发送自动续费成功通知失败: {}", e.getMessage());
        }
    }

    /**
     * 自动续费失败通知
     */
    public void notifyRenewFailed(User user, String reason) {
        try {
            if (user == null || isBlank(user.getTelegramChatId())) return;
            String token = getConfigValue("telegram_bot_token");
            if (isBlank(token)) return;
            String text = "自动续费失败\n原因：" + (isBlank(reason) ? "未知错误" : reason);
            TelegramBotUtil.sendMessage(token, user.getTelegramChatId(), text);
        } catch (Exception e) {
            log.warn("发送自动续费失败通知失败: {}", e.getMessage());
        }
    }

    /**
     * 套餐即将到期提醒
     */
    public void notifyExpiryReminder(User user, long diffDays) {
        try {
            if (user == null || isBlank(user.getTelegramChatId())) return;
            String token = getConfigValue("telegram_bot_token");
            if (isBlank(token)) return;
            String text = diffDays <= 1
                    ? "您的套餐将于明天到期，请及时续费"
                    : String.format("您的套餐将于%d天后到期，请及时续费", diffDays);
            TelegramBotUtil.sendMessage(token, user.getTelegramChatId(), text);
        } catch (Exception e) {
            log.warn("发送到期提醒失败: {}", e.getMessage());
        }
    }

    /**
     * 流量即将用尽提醒
     */
    public void notifyFlowReminder(User user, double usedPercent) {
        try {
            if (user == null || isBlank(user.getTelegramChatId())) return;
            String token = getConfigValue("telegram_bot_token");
            if (isBlank(token)) return;
            String text = String.format("您的套餐流量已使用 %.0f%%，即将用尽，请留意", usedPercent);
            TelegramBotUtil.sendMessage(token, user.getTelegramChatId(), text);
        } catch (Exception e) {
            log.warn("发送流量提醒失败: {}", e.getMessage());
        }
    }

    /**
     * 管理员在站点设置中发送的测试消息
     */
    public boolean sendTestMessage(User user) {
        if (user == null || isBlank(user.getTelegramChatId())) return false;
        String token = getConfigValue("telegram_bot_token");
        if (isBlank(token)) return false;
        return TelegramBotUtil.sendMessage(token, user.getTelegramChatId(), "这是一条测试消息，收到即代表 Telegram 通知配置正常。");
    }

    /**
     * 白名单模式：命中所选设备组才通知；黑名单模式：命中所选设备组则不通知，其余都通知
     */
    private boolean shouldNotifyDevice(User user, List<Long> nodeGroupIds) {
        Integer mode = user.getNotifyDeviceMode();
        if (mode == null || mode == 0) return false;
        List<Long> scopeIds = parseIds(user.getNotifyDeviceGroups());
        boolean intersects = nodeGroupIds.stream().anyMatch(scopeIds::contains);
        if (mode == 1) return intersects;
        if (mode == 2) return !intersects;
        return false;
    }

    private List<Long> parseIds(String json) {
        if (isBlank(json)) return Collections.emptyList();
        try {
            return JSON.parseArray(json, Long.class);
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    private String getConfigValue(String name) {
        ViteConfig config = viteConfigService.getOne(new QueryWrapper<ViteConfig>().eq("name", name));
        return config != null ? config.getValue() : null;
    }

    private boolean isBlank(String s) {
        return s == null || s.isEmpty();
    }
}
