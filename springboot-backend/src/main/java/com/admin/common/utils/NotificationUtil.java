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
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import java.math.BigDecimal;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 个人中心「推送信息」的实际发送方：充值到账、设备离线/恢复、自动续费结果、到期/流量提醒的 Telegram 通知。
 * 所有方法均对异常静默降级，绝不影响调用方的主流程（充值确认、节点连接处理）。
 * <p>
 * 每类通知的正文支持管理员在推送设置页自定义模板（{@code telegram_tpl_*} 配置项，占位符用 {xxx} 表示，
 * 未配置时使用 DEFAULT_TPL_* 常量作为默认值）；标题固定由代码生成（纯文本，不用 emoji——Telegram 的
 * sendMessage 不支持在文本里内嵌真实图标，emoji 是唯一的图形化选项，这里选择不用，保持纯文字），
 * 与正文一起以 Telegram HTML 富文本格式（parse_mode=HTML）发送。占位符对应的变量值一律做 HTML 转义，
 * 避免用户可控内容（节点名、失败原因等）破坏消息格式；管理员自己填写的模板文本本身不转义。
 * </p>
 */
@Slf4j
@Component
public class NotificationUtil {

    private static final String PARSE_MODE_HTML = "HTML";

    private static final String DEFAULT_TPL_PAYMENT_SUCCESS = "金额：¥{amount}\n当前余额：¥{balance}";
    private static final String DEFAULT_TPL_DEVICE_OFFLINE = "设备「{name}」已离线";
    private static final String DEFAULT_TPL_DEVICE_ONLINE = "设备「{name}」已恢复在线";
    private static final String DEFAULT_TPL_RENEW_SUCCESS = "扣款金额：¥{amount}";
    private static final String DEFAULT_TPL_RENEW_FAILED = "原因：{reason}";
    private static final String DEFAULT_TPL_EXPIRY_REMINDER = "您的套餐将于 {days} 天后到期，请及时续费";
    private static final String DEFAULT_TPL_FLOW_REMINDER = "您的套餐流量已使用 {percent}%，即将用尽，请留意";

    @Resource
    private UserService userService;

    @Resource
    private DeviceGroupService deviceGroupService;

    @Resource
    private ViteConfigService viteConfigService;

    @Resource
    @Lazy
    private TaskQueueService taskQueueService;

    @Resource
    @Lazy
    private TelegramSendLogService telegramSendLogService;

    /**
     * 充值成功通知
     */
    public void notifyPaymentSuccess(User user, BigDecimal amount, BigDecimal newBalance) {
        try {
            if (user == null || isBlank(user.getTelegramChatId())) return;
            if (user.getNotifyPaymentMode() == null || user.getNotifyPaymentMode() != 1) return;
            String token = getConfigValue("telegram_bot_token");
            if (isBlank(token)) return;

            Map<String, String> vars = new LinkedHashMap<>();
            vars.put("amount", escapeHtml(amount.toPlainString()));
            vars.put("balance", escapeHtml(newBalance.toPlainString()));
            String text = buildMessage("充值成功", render("telegram_tpl_payment_success", DEFAULT_TPL_PAYMENT_SUCCESS, vars));
            sendWithRetry(user.getId(), user.getTelegramChatId(), text, "PAYMENT_SUCCESS", token);
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

            Map<String, String> vars = new LinkedHashMap<>();
            vars.put("name", escapeHtml(node.getName()));
            String title = online ? "设备恢复在线" : "设备离线";
            String tplKey = online ? "telegram_tpl_device_online" : "telegram_tpl_device_offline";
            String defaultTpl = online ? DEFAULT_TPL_DEVICE_ONLINE : DEFAULT_TPL_DEVICE_OFFLINE;
            String type = online ? "DEVICE_ONLINE" : "DEVICE_OFFLINE";
            String body = render(tplKey, defaultTpl, vars);
            String text = buildMessage(title, body);

            for (User candidate : candidates) {
                if (isBlank(candidate.getTelegramChatId())) continue;
                if (!shouldNotifyDevice(candidate, nodeGroupIds)) continue;
                sendWithRetry(candidate.getId(), candidate.getTelegramChatId(), text, type, token);
            }

            // 管理员无条件接收全部设备上下线通知，不受各自 notify_device_mode 偏好限制
            List<User> admins = userService.list(new QueryWrapper<User>()
                    .eq("role_id", 0)
                    .isNotNull("telegram_chat_id"));
            String adminText = buildMessage("[管理员通知] " + title, body);
            for (User admin : admins) {
                if (isBlank(admin.getTelegramChatId())) continue;
                sendWithRetry(admin.getId(), admin.getTelegramChatId(), adminText, type, token);
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
            if (!isNotifyEnabled(user.getNotifyRenewMode())) return;
            String token = getConfigValue("telegram_bot_token");
            if (isBlank(token)) return;
            Map<String, String> vars = new LinkedHashMap<>();
            vars.put("amount", escapeHtml(amount.toPlainString()));
            String text = buildMessage("自动续费成功", render("telegram_tpl_renew_success", DEFAULT_TPL_RENEW_SUCCESS, vars));
            sendWithRetry(user.getId(), user.getTelegramChatId(), text, "RENEW_SUCCESS", token);
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
            if (!isNotifyEnabled(user.getNotifyRenewMode())) return;
            String token = getConfigValue("telegram_bot_token");
            if (isBlank(token)) return;
            Map<String, String> vars = new LinkedHashMap<>();
            vars.put("reason", escapeHtml(isBlank(reason) ? "未知错误" : reason));
            String text = buildMessage("自动续费失败", render("telegram_tpl_renew_failed", DEFAULT_TPL_RENEW_FAILED, vars));
            sendWithRetry(user.getId(), user.getTelegramChatId(), text, "RENEW_FAILED", token);
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
            if (!isNotifyEnabled(user.getNotifyExpiryMode())) return;
            String token = getConfigValue("telegram_bot_token");
            if (isBlank(token)) return;
            Map<String, String> vars = new LinkedHashMap<>();
            vars.put("days", String.valueOf(Math.max(diffDays, 0)));
            String text = buildMessage("套餐到期提醒", render("telegram_tpl_expiry_reminder", DEFAULT_TPL_EXPIRY_REMINDER, vars));
            sendWithRetry(user.getId(), user.getTelegramChatId(), text, "EXPIRY_REMINDER", token);
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
            if (!isNotifyEnabled(user.getNotifyFlowMode())) return;
            String token = getConfigValue("telegram_bot_token");
            if (isBlank(token)) return;
            Map<String, String> vars = new LinkedHashMap<>();
            vars.put("percent", String.format("%.0f", usedPercent));
            String text = buildMessage("流量提醒", render("telegram_tpl_flow_reminder", DEFAULT_TPL_FLOW_REMINDER, vars));
            sendWithRetry(user.getId(), user.getTelegramChatId(), text, "FLOW_REMINDER", token);
        } catch (Exception e) {
            log.warn("发送流量提醒失败: {}", e.getMessage());
        }
    }

    /**
     * 管理员在站点设置中发送的测试消息（同步返回结果，不走重试队列）
     */
    public boolean sendTestMessage(User user) {
        if (user == null || isBlank(user.getTelegramChatId())) return false;
        String token = getConfigValue("telegram_bot_token");
        if (isBlank(token)) return false;
        String text = buildMessage("测试消息", "这是一条测试消息，收到即代表 Telegram 通知配置正常。");
        boolean ok = TelegramBotUtil.sendMessage(token, user.getTelegramChatId(), text, PARSE_MODE_HTML);
        telegramSendLogService.record(user.getId(), user.getTelegramChatId(), "TEST", text, ok, ok ? null : "发送失败");
        return ok;
    }

    /**
     * 白名单模式：命中所选设备组才通知；黑名单模式：命中所选设备组则不通知，其余都通知；
     * 全部接收模式：不看设备组，任何设备上下线都通知
     */
    private boolean shouldNotifyDevice(User user, List<Long> nodeGroupIds) {
        Integer mode = user.getNotifyDeviceMode();
        if (mode == null || mode == 0) return false;
        if (mode == 3) return true;
        List<Long> scopeIds = parseIds(user.getNotifyDeviceGroups());
        boolean intersects = nodeGroupIds.stream().anyMatch(scopeIds::contains);
        if (mode == 1) return intersects;
        if (mode == 2) return !intersects;
        return false;
    }

    /**
     * 自动续费/到期/流量这三类提醒的开关字段迁移前默认全部开启（保持"绑定即必发"的既有行为），
     * 数据库列本身也是 NOT NULL DEFAULT 1，这里的 null 判断只是兜底防御
     */
    private boolean isNotifyEnabled(Integer mode) {
        return mode == null || mode == 1;
    }

    private List<Long> parseIds(String json) {
        if (isBlank(json)) return Collections.emptyList();
        try {
            return JSON.parseArray(json, Long.class);
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    /**
     * 渲染消息正文模板：优先使用管理员在推送设置页配置的自定义模板（configKey），未配置时使用默认模板；
     * 模板占位符格式为 {key}，逐一替换为 vars 中对应的值（值需调用方自行转义）
     */
    private String render(String configKey, String defaultTemplate, Map<String, String> vars) {
        String tpl = getConfigValue(configKey);
        if (isBlank(tpl)) tpl = defaultTemplate;
        String result = tpl;
        for (Map.Entry<String, String> entry : vars.entrySet()) {
            result = result.replace("{" + entry.getKey() + "}", entry.getValue());
        }
        return result;
    }

    /**
     * 拼装最终发送的 HTML 消息：粗体标题（代码固定，纯文本不用 emoji）+ 空行 + 正文
     */
    private String buildMessage(String title, String body) {
        return "<b>" + escapeHtml(title) + "</b>\n\n" + body;
    }

    /**
     * Telegram HTML parse_mode 要求转义 &lt;、&gt;、&amp;，否则消息中若包含这些字符会导致发送失败
     */
    private String escapeHtml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    /**
     * Telegram 通知每次都先登记进通用任务队列（task_type=TELEGRAM_NOTIFY），再由队列异步立即执行发送，
     * 发送失败则留在队列里由定时兜底扫描自动重试；发送记录由 TelegramNotifyTaskHandler 在每次发送尝试后写入。
     * 不阻塞/不影响当前调用方的主流程
     */
    private void sendWithRetry(Long userId, String chatId, String text, String type, String token) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("userId", userId);
            payload.put("type", type);
            payload.put("chatId", chatId);
            payload.put("text", text);
            payload.put("parseMode", PARSE_MODE_HTML);
            payload.put("summary", "Telegram 通知：" + (text.length() > 40 ? text.substring(0, 40) + "..." : text));
            Long queueId = taskQueueService.enqueue("TELEGRAM_NOTIFY", null, payload.toJSONString(), Collections.emptyList(), null);
            taskQueueService.dispatch(queueId);
        } catch (Exception e) {
            log.warn("登记 Telegram 通知任务失败: {}", e.getMessage());
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
