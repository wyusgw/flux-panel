package com.admin.service.impl;

import com.admin.entity.ViteConfig;
import com.admin.mapper.ViteConfigMapper;
import com.admin.service.ViteConfigService;
import com.admin.common.lang.R;
import com.admin.common.utils.TelegramBotUtil;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * <p>
 *  网站配置服务实现类
 * </p>
 *
 * @author QAQ
 * @since 2025-07-24
 */
@Service
public class ViteConfigServiceImpl extends ServiceImpl<ViteConfigMapper, ViteConfig> implements ViteConfigService {

    // ========== 常量定义 ==========
    
    /** 成功响应消息 */
    private static final String SUCCESS_UPDATE_MSG = "配置更新成功";
    
    /** 错误响应消息 */
    private static final String ERROR_UPDATE_MSG = "配置更新失败";
    private static final String ERROR_CONFIG_NOT_FOUND = "配置不存在";
    private static final String ERROR_CONFIG_NAME_REQUIRED = "配置名称不能为空";
    private static final String ERROR_CONFIG_VALUE_REQUIRED = "配置值不能为空";

    // ========== 公共接口实现 ==========

    /**
     * 获取所有网站配置
     * 
     * @return 包含所有配置的Map
     */
    @Override
    public R getConfigs() {
        List<ViteConfig> configList = this.list();
        Map<String, String> configMap = new HashMap<>();
        
        boolean admin = isAdminRequest();
        for (ViteConfig config : configList) {
            // 这个接口不需要登录就能访问，密钥只给真管理员（演示账号也算其他人）
            if (!admin && isSecretConfig(config.getName())) {
                continue;
            }
            configMap.put(config.getName(), admin ? config.getValue() : publicValue(config.getName(), config.getValue()));
        }
        
        return R.ok(configMap);
    }

    /**
     * 根据配置名称获取配置值
     * 
     * @param name 配置名称
     * @return 配置响应对象
     */
    @Override
    public R getConfigByName(String name) {
        if (!StringUtils.hasText(name)) {
            return R.err(ERROR_CONFIG_NAME_REQUIRED);
        }

        QueryWrapper<ViteConfig> queryWrapper = new QueryWrapper<>();
        queryWrapper.eq("name", name);
        ViteConfig config = this.getOne(queryWrapper);

        if (config == null || (isSecretConfig(config.getName()) && !isAdminRequest())) {
            return R.err(ERROR_CONFIG_NOT_FOUND);
        }

        if (!isAdminRequest()) {
            config.setValue(publicValue(config.getName(), config.getValue()));
        }
        return R.ok(config);
    }

    /**
     * 批量更新网站配置
     * 
     * @param configMap 配置Map
     * @return 更新结果响应
     */
    @Override
    public R updateConfigs(Map<String, String> configMap) {
        if (configMap == null || configMap.isEmpty()) {
            return R.err("配置数据不能为空");
        }

        try {
            for (Map.Entry<String, String> entry : configMap.entrySet()) {
                String name = entry.getKey();
                String value = entry.getValue();
                
                if (!StringUtils.hasText(name)) {
                    continue; // 跳过无效的配置名
                }
                
                updateOrCreateConfig(name, value);
            }
            return R.ok(SUCCESS_UPDATE_MSG);
        } catch (Exception e) {
            return R.err(ERROR_UPDATE_MSG + ": " + e.getMessage());
        }
    }

    /** 站点设置里演示账号能改的配置项，其余（注册、验证码、流量重置、日志保留、Looking Glass 隐藏 IP 等）改了影响真实用户且恢复不了后果 */
    private static final java.util.Set<String> DEMO_SITE_CONFIGS = new java.util.HashSet<>(java.util.Arrays.asList(
            "app_name", "site_announcement", "theme_policy", "transparent_theme_landscape_url",
            "transparent_theme_portrait_url", "diagnosis_ping_count", "diagnosis_detail_ping_count"));

    /** 配置项是否在已分配区域内。推送通知里的 Bot 开关和密钥不开放，只开放消息模板、提醒阈值和离线设置 */
    static boolean isDemoEditable(String name, java.util.Set<String> areas) {
        if (areas.contains(com.admin.common.utils.DemoArea.SITE.getCode()) && DEMO_SITE_CONFIGS.contains(name)) {
            return true;
        }
        return areas.contains(com.admin.common.utils.DemoArea.PUSH.getCode()) && name != null
                && (name.startsWith("telegram_tpl_") || name.startsWith("device_offline_")
                || name.equals("telegram_expiry_reminder_days") || name.equals("telegram_flow_reminder_percent")
                || name.equals("telegram_reminder_hour"));
    }

    @Override
    public R updateConfigsAsDemo(Map<String, String> configMap, java.util.Set<String> areas) {
        if (configMap == null || configMap.isEmpty()) {
            return R.err("配置数据不能为空");
        }
        Map<String, String> current = new HashMap<>();
        for (ViteConfig config : this.list()) {
            current.put(config.getName(), publicValue(config.getName(), config.getValue()));
        }
        Map<String, String> allowed = new HashMap<>();
        for (Map.Entry<String, String> entry : configMap.entrySet()) {
            String value = entry.getValue();
            // 页面一次提交整个分组：打码内容和没有改动的配置项跳过，真正改了不允许的配置项才拒绝
            if (value != null && value.contains(com.admin.common.utils.DemoDataMasker.MASK)) {
                continue;
            }
            if (isDemoEditable(entry.getKey(), areas)) {
                allowed.put(entry.getKey(), value);
            } else if (!java.util.Objects.equals(emptyToNull(value), emptyToNull(current.get(entry.getKey())))) {
                return R.err(403, "禁止编辑");
            }
        }
        return allowed.isEmpty() ? R.ok(SUCCESS_UPDATE_MSG) : updateConfigs(allowed);
    }

    private static String emptyToNull(String value) {
        return value == null || value.isEmpty() ? null : value;
    }

    /**
     * 更新单个配置项
     * 
     * @param name 配置名
     * @param value 配置值
     * @return 更新结果响应
     */
    @Override
    public R updateConfig(String name, String value) {
        // 1. 验证必填字段
        if (!StringUtils.hasText(name)) {
            return R.err(ERROR_CONFIG_NAME_REQUIRED);
        }
        if (!StringUtils.hasText(value)) {
            return R.err(ERROR_CONFIG_VALUE_REQUIRED);
        }

        try {
            updateOrCreateConfig(name, value);
            return R.ok(SUCCESS_UPDATE_MSG);
        } catch (Exception e) {
            return R.err(ERROR_UPDATE_MSG + ": " + e.getMessage());
        }
    }

    // ========== 私有辅助方法 ==========

    /** 只有真管理员能读取的配置：服务端密钥、Bot Token、Webhook 地址（路径里带 Token） */
    static boolean isSecretConfig(String name) {
        return name != null && (name.contains("secret") || name.contains("token") || name.equals("telegram_webhook_url"));
    }

    /**
     * 其他人看到的配置值。支付渠道配置是公开的（商城页要列出可用渠道），但每个渠道的 config
     * 里有接口地址、商户号和密钥，要去掉；解析不了时按没有渠道处理，不能把原文返回出去
     */
    static String publicValue(String name, String value) {
        if (!"payment_config_json".equals(name)) {
            return value;
        }
        try {
            com.alibaba.fastjson2.JSONArray channels = com.alibaba.fastjson2.JSON.parseArray(value);
            if (channels == null) {
                return "[]";
            }
            for (int i = 0; i < channels.size(); i++) {
                channels.getJSONObject(i).remove("config");
            }
            return channels.toJSONString();
        } catch (Exception e) {
            return "[]";
        }
    }

    /** 当前请求是否来自真管理员：必须带有签名和有效期都通过校验的管理员令牌，不能只看令牌里自称的角色；演示账号不算 */
    private static boolean isAdminRequest() {
        try {
            javax.servlet.http.HttpServletRequest request = com.admin.common.utils.HttpContextUtils.getHttpServletRequest();
            if (request.getAttribute(com.admin.common.interceptor.ReadOnlyInterceptor.CONFIG_SECRETS_HIDDEN_ATTRIBUTE) != null) {
                return false;
            }
            String token = request.getHeader("Authorization");
            return token != null && com.admin.common.utils.JwtUtil.validateToken(token)
                    && Integer.valueOf(0).equals(com.admin.common.utils.JwtUtil.getRoleIdFromToken(token))
                    && !com.admin.common.utils.JwtUtil.isDemoToken(token);
        } catch (Exception e) {
            return false;
        }
    }


    /**
     * 更新或创建配置项
     * 如果配置存在则更新，不存在则创建
     */
    private void updateOrCreateConfig(String name, String value) {
        QueryWrapper<ViteConfig> queryWrapper = new QueryWrapper<>();
        queryWrapper.eq("name", name);
        ViteConfig existingConfig = this.getOne(queryWrapper);

        if (existingConfig != null) {
            // 更新现有配置
            existingConfig.setValue(value);
            existingConfig.setTime(System.currentTimeMillis());
            this.updateById(existingConfig);
        } else {
            // 创建新配置
            ViteConfig newConfig = new ViteConfig();
            newConfig.setName(name);
            newConfig.setValue(value);
            newConfig.setTime(System.currentTimeMillis());
            this.save(newConfig);
        }

        // Bot Token 保存时顺带校验并自动回填机器人用户名，供绑定页面生成 t.me 深链
        if ("telegram_bot_token".equals(name)) {
            String username = TelegramBotUtil.getMe(value);
            if (username != null) {
                QueryWrapper<ViteConfig> usernameQuery = new QueryWrapper<>();
                usernameQuery.eq("name", "telegram_bot_username");
                ViteConfig usernameConfig = this.getOne(usernameQuery);
                if (usernameConfig != null) {
                    usernameConfig.setValue(username);
                    usernameConfig.setTime(System.currentTimeMillis());
                    this.updateById(usernameConfig);
                } else {
                    ViteConfig newUsernameConfig = new ViteConfig();
                    newUsernameConfig.setName("telegram_bot_username");
                    newUsernameConfig.setValue(username);
                    newUsernameConfig.setTime(System.currentTimeMillis());
                    this.save(newUsernameConfig);
                }
            }
        }

        // Bot Token 或 Webhook URL 任一项变更时，都需要按最新的两个值重新同步 Webhook 注册状态：
        // Webhook URL 非空则注册 Webhook（此后长轮询会自动让路）；为空则取消注册，回退为长轮询。
        if ("telegram_bot_token".equals(name) || "telegram_webhook_url".equals(name)) {
            syncTelegramWebhook();
        }
    }

    /**
     * 按当前保存的 telegram_bot_token / telegram_webhook_url 同步 Telegram 的 Webhook 注册状态
     */
    private void syncTelegramWebhook() {
        String token = getConfigValueInternal("telegram_bot_token");
        String webhookUrl = getConfigValueInternal("telegram_webhook_url");
        if (token == null || token.isEmpty()) {
            return;
        }
        if (webhookUrl != null && !webhookUrl.isEmpty()) {
            TelegramBotUtil.setWebhook(token, webhookUrl);
        } else {
            TelegramBotUtil.deleteWebhook(token);
        }
    }

    private String getConfigValueInternal(String name) {
        ViteConfig config = this.getOne(new QueryWrapper<ViteConfig>().eq("name", name));
        return config != null ? config.getValue() : null;
    }

}
