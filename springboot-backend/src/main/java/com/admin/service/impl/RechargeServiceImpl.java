package com.admin.service.impl;

import com.admin.common.dto.RechargeDto;
import com.admin.common.lang.R;
import com.admin.common.utils.EpayUtil;
import com.admin.common.utils.JwtUtil;
import com.admin.common.utils.NotificationUtil;
import com.admin.entity.Order;
import com.admin.entity.User;
import com.admin.entity.ViteConfig;
import com.admin.mapper.OrderMapper;
import com.admin.service.RechargeService;
import com.admin.service.UserService;
import com.admin.service.ViteConfigService;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.UnsupportedEncodingException;
import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * <p>
 * 钱包充值 / 支付网关对接服务实现类（目前仅支持易支付 EPay）
 * </p>
 */
@Service
public class RechargeServiceImpl extends ServiceImpl<OrderMapper, Order> implements RechargeService {

    private static final String CONFIG_PAYMENT_ENABLED = "payment_enabled";
    private static final String CONFIG_PAYMENT_MIN_AMOUNT = "payment_min_amount";
    private static final String CONFIG_PAYMENT_CHANNELS = "payment_config_json";
    private static final String ORDER_TYPE_RECHARGE = "recharge";
    private static final int ORDER_STATUS_PENDING = 0;
    private static final int ORDER_STATUS_PAID = 1;

    @Autowired
    @Lazy
    private UserService userService;

    @Autowired
    @Lazy
    private ViteConfigService viteConfigService;

    @Autowired
    @Lazy
    private NotificationUtil notificationUtil;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R createRechargeOrder(RechargeDto dto, String baseUrl) {
        Integer userId = JwtUtil.getUserIdFromToken();
        if (userId == null) {
            return R.err("用户未登录或token无效");
        }

        User user = userService.getById(userId);
        if (user == null) {
            return R.err("用户不存在");
        }

        if (dto.getAmount() == null || dto.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            return R.err("充值金额必须大于0");
        }

        if (!"true".equals(getConfigValue(CONFIG_PAYMENT_ENABLED))) {
            return R.err("站点未启用在线支付");
        }

        BigDecimal minAmount = parseAmount(getConfigValue(CONFIG_PAYMENT_MIN_AMOUNT));
        if (minAmount != null && dto.getAmount().compareTo(minAmount) < 0) {
            return R.err("充值金额不能低于最小充值金额 " + minAmount + " 元");
        }

        JSONObject channel = findChannel(dto.getChannelId());
        if (channel == null) {
            return R.err("支付渠道不存在");
        }
        if (!channel.getBooleanValue("enabled")) {
            return R.err("该支付渠道未启用");
        }
        String type = channel.getString("type");
        if (!"epay".equals(type)) {
            return R.err("该支付类型暂未支持，目前仅支持 EPay");
        }

        JSONObject config = channel.getJSONObject("config");
        String url = config == null ? null : config.getString("url");
        String pid = config == null ? null : config.getString("pid");
        String secret = config == null ? null : config.getString("secret");
        String callbackHost = config == null ? null : config.getString("callbackHost");
        if (StringUtils.isBlank(url) || StringUtils.isBlank(pid) || StringUtils.isBlank(secret)) {
            return R.err("该支付渠道尚未配置完整（URL / PID / 密钥）");
        }

        String host = StringUtils.isNotBlank(callbackHost) ? stripTrailingSlash(callbackHost) : baseUrl;
        String notifyUrl = host + "/api/v1/recharge/notify/epay";
        String returnUrl = host + "/shop";

        String orderNo = generateOrderNo();
        String money = dto.getAmount().setScale(2, java.math.RoundingMode.HALF_UP).toPlainString();

        Map<String, String> params = new LinkedHashMap<>();
        params.put("pid", pid);
        params.put("type", "alipay");
        params.put("out_trade_no", orderNo);
        params.put("notify_url", notifyUrl);
        params.put("return_url", returnUrl);
        params.put("name", "钱包充值");
        params.put("money", money);
        params.put("sign_type", "MD5");

        String sign = EpayUtil.sign(params, secret);
        params.put("sign", sign);

        String payUrl = stripTrailingSlash(url) + "/submit.php?" + buildQueryString(params);

        Order order = new Order();
        order.setOrderNo(orderNo);
        order.setUserId(user.getId());
        order.setUserName(user.getUser());
        order.setType(ORDER_TYPE_RECHARGE);
        order.setChannelId(dto.getChannelId());
        order.setAmount(dto.getAmount());
        order.setOrderStatus(ORDER_STATUS_PENDING);
        order.setInfo("钱包充值（" + channel.getString("name") + "）");
        long currentTime = System.currentTimeMillis();
        order.setCreatedTime(currentTime);
        order.setUpdatedTime(currentTime);
        order.setStatus(1);

        boolean saved = this.save(order);
        if (!saved) {
            return R.err("创建充值订单失败");
        }

        JSONObject result = new JSONObject();
        result.put("orderNo", orderNo);
        result.put("payUrl", payUrl);
        return R.ok(result);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String handleEpayNotify(Map<String, String> params) {
        String outTradeNo = params.get("out_trade_no");
        if (StringUtils.isBlank(outTradeNo)) {
            return "fail";
        }

        Order order = this.getOne(new QueryWrapper<Order>().eq("order_no", outTradeNo));
        if (order == null) {
            return "fail";
        }

        // 已经处理过（网关重试通知），直接幂等返回成功，不再重复加值
        if (order.getOrderStatus() != null && order.getOrderStatus() == ORDER_STATUS_PAID) {
            return "success";
        }

        JSONObject channel = findChannel(order.getChannelId());
        if (channel == null) {
            return "fail";
        }
        JSONObject config = channel.getJSONObject("config");
        String secret = config == null ? null : config.getString("secret");
        if (StringUtils.isBlank(secret) || !EpayUtil.verify(params, secret)) {
            return "fail";
        }

        if (!"TRADE_SUCCESS".equals(params.get("trade_status"))) {
            return "fail";
        }

        long now = System.currentTimeMillis();
        // 原子条件更新：仅当仍为待支付状态时才转为已支付，避免并发重复通知重复加值
        boolean updated = this.update(new UpdateWrapper<Order>()
                .eq("order_no", outTradeNo)
                .eq("order_status", ORDER_STATUS_PENDING)
                .set("order_status", ORDER_STATUS_PAID)
                .set("trade_no", params.get("trade_no"))
                .set("paid_time", now)
                .set("updated_time", now));

        if (!updated) {
            // 竞争条件下已被其他请求处理，幂等返回成功
            return "success";
        }

        User user = userService.getById(order.getUserId());
        if (user == null) {
            return "fail";
        }
        BigDecimal balance = user.getWalletBalance() != null ? user.getWalletBalance() : BigDecimal.ZERO;
        BigDecimal newBalance = balance.add(order.getAmount());
        User updateUser = new User();
        updateUser.setId(user.getId());
        updateUser.setWalletBalance(newBalance);
        updateUser.setUpdatedTime(now);
        userService.updateById(updateUser);

        notificationUtil.notifyPaymentSuccess(user, order.getAmount(), newBalance);

        return "success";
    }

    // ========== 私有辅助方法 ==========

    private String getConfigValue(String name) {
        ViteConfig config = viteConfigService.getOne(new QueryWrapper<ViteConfig>().eq("name", name));
        return config != null ? config.getValue() : null;
    }

    private BigDecimal parseAmount(String value) {
        if (StringUtils.isBlank(value)) {
            return null;
        }
        try {
            return new BigDecimal(value);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private JSONObject findChannel(String channelId) {
        if (StringUtils.isBlank(channelId)) {
            return null;
        }
        String json = getConfigValue(CONFIG_PAYMENT_CHANNELS);
        if (StringUtils.isBlank(json)) {
            return null;
        }
        try {
            JSONArray channels = JSONArray.parseArray(json);
            for (int i = 0; i < channels.size(); i++) {
                JSONObject channel = channels.getJSONObject(i);
                if (channelId.equals(channel.getString("id"))) {
                    return channel;
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private String generateOrderNo() {
        return "RC" + System.currentTimeMillis() + ThreadLocalRandom.current().nextInt(1000, 9999);
    }

    private String stripTrailingSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private String buildQueryString(Map<String, String> params) {
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> entry : params.entrySet()) {
            if (sb.length() > 0) {
                sb.append('&');
            }
            sb.append(entry.getKey()).append('=').append(urlEncode(entry.getValue()));
        }
        return sb.toString();
    }

    private String urlEncode(String value) {
        try {
            return URLEncoder.encode(value, StandardCharsets.UTF_8.name());
        } catch (UnsupportedEncodingException e) {
            return value;
        }
    }
}
