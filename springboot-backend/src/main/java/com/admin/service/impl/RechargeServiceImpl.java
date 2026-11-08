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
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * <p>
 * 钱包充值 / 支付网关对接服务实现类（目前仅支持易支付 EPay）
 * </p>
 */
@Service
public class RechargeServiceImpl extends ServiceImpl<OrderMapper, Order> implements RechargeService {

    private static final String CONFIG_PAYMENT_MIN_AMOUNT = "payment_min_amount";
    private static final String CONFIG_PAYMENT_CHANNELS = "payment_config_json";
    private static final String ORDER_TYPE_RECHARGE = "recharge";
    private static final int ORDER_STATUS_PENDING = 0;
    private static final int ORDER_STATUS_PAID = 1;

    /** 易支付通用的付款方式及名称，渠道未配置 payTypes 时只允许支付宝（兼容旧配置） */
    static final Map<String, String> PAY_TYPE_LABELS = new LinkedHashMap<>();

    static {
        PAY_TYPE_LABELS.put("alipay", "支付宝");
        PAY_TYPE_LABELS.put("wxpay", "微信支付");
        PAY_TYPE_LABELS.put("qqpay", "QQ钱包");
    }

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

        if (!hasConfiguredPaymentChannel()) {
            return R.err("站点未配置可用的支付渠道");
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

        List<String> allowedPayTypes = allowedPayTypes(channel);
        if (allowedPayTypes.isEmpty()) {
            return R.err("该支付渠道未配置可用的付款方式");
        }
        String payType = StringUtils.isBlank(dto.getPayType()) ? allowedPayTypes.get(0) : dto.getPayType();
        if (!allowedPayTypes.contains(payType)) {
            return R.err("该支付渠道不支持此付款方式");
        }

        BigDecimal feeRate = parseFeeRate(config.getString("feeRate"));
        if (feeRate == null) {
            return R.err("该支付渠道的费率配置有误");
        }
        BigDecimal amount = dto.getAmount().setScale(2, RoundingMode.HALF_UP);
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            return R.err("充值金额必须大于0");
        }
        BigDecimal payAmount = payAmountOf(amount, feeRate);

        String host = StringUtils.isNotBlank(callbackHost) ? stripTrailingSlash(callbackHost) : baseUrl;
        String notifyUrl = host + "/api/v1/recharge/notify/epay";
        String returnUrl = host + "/shop";

        String orderNo = generateOrderNo();
        String money = payAmount.toPlainString();

        Map<String, String> params = new LinkedHashMap<>();
        params.put("pid", pid);
        params.put("type", payType);
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
        order.setAmount(amount);
        order.setPayAmount(payAmount);
        order.setPayType(payType);
        order.setOrderStatus(ORDER_STATUS_PENDING);
        String info = "钱包充值（" + channel.getString("name") + " · " + PAY_TYPE_LABELS.get(payType);
        if (payAmount.compareTo(amount) != 0) {
            info += "，实付 " + money + " 元";
        }
        order.setInfo(info + "）");
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
        result.put("payAmount", payAmount);
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

        // 回调的商户号与金额必须和下单时一致，避免同一密钥下其他订单或改价的通知被当成本订单入账
        String pid = config.getString("pid");
        if (StringUtils.isNotBlank(params.get("pid")) && !params.get("pid").equals(pid)) {
            return "fail";
        }
        BigDecimal paidMoney = parseAmount(params.get("money"));
        // 新订单核对含手续费的实付金额，升级前创建的订单没有 pay_amount，按到账金额核对
        BigDecimal expectedMoney = order.getPayAmount() != null ? order.getPayAmount() : order.getAmount();
        if (paidMoney == null || expectedMoney == null || paidMoney.compareTo(expectedMoney) != 0) {
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

        if (!creditWallet(order, now)) {
            // 抛出异常让订单状态一起回滚，网关重试时还能重新处理，不会出现已支付却没加值
            throw new IllegalStateException("充值加值失败，订单 " + outTradeNo);
        }

        return "success";
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R markOrderPaidManually(Long orderId) {
        Order order = this.getById(orderId);
        if (order == null) {
            return R.err("订单不存在");
        }
        if (!ORDER_TYPE_RECHARGE.equals(order.getType())) {
            return R.err("仅充值类型订单支持此操作");
        }
        if (order.getOrderStatus() != null && order.getOrderStatus() == ORDER_STATUS_PAID) {
            return R.ok("订单已是已支付状态");
        }

        long now = System.currentTimeMillis();
        // 与网关回调走相同的原子条件更新，避免与真实回调并发时重复加值
        boolean updated = this.update(new UpdateWrapper<Order>()
                .eq("id", orderId)
                .eq("order_status", ORDER_STATUS_PENDING)
                .set("order_status", ORDER_STATUS_PAID)
                .set("paid_time", now)
                .set("updated_time", now));

        if (!updated) {
            return R.err("订单状态已变化，请刷新后重试");
        }

        if (!creditWallet(order, now)) {
            return R.err("用户不存在，加值失败");
        }

        return R.ok("已标记为支付成功并完成加值");
    }

    /**
     * 充值订单转为已支付后的加值动作：更新用户钱包余额并推送通知。
     * 由网关异步通知与管理员手动标记两处共用，调用前必须已完成订单状态的原子转换。
     */
    private boolean creditWallet(Order order, long now) {
        User user = userService.getById(order.getUserId());
        if (user == null) {
            return false;
        }
        // 原子加值：写回读到的余额会覆盖同时发生的购买或其他充值
        boolean credited = userService.update(null, new UpdateWrapper<User>()
                .eq("id", user.getId())
                .setSql("wallet_balance = wallet_balance + " + order.getAmount().toPlainString())
                .set("updated_time", now));
        if (!credited) {
            return false;
        }
        BigDecimal newBalance = userService.getById(user.getId()).getWalletBalance();

        notificationUtil.notifyPaymentSuccess(user, order.getAmount(), newBalance);
        return true;
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

    /**
     * 站点是否已配置至少一个可用的支付渠道（启用状态、类型受支持且 URL/PID/密钥均已填写）。
     * 在线支付无需单独的开关，只要存在这样的渠道即视为已启用。
     */
    private boolean hasConfiguredPaymentChannel() {
        String json = getConfigValue(CONFIG_PAYMENT_CHANNELS);
        if (StringUtils.isBlank(json)) {
            return false;
        }
        try {
            JSONArray channels = JSONArray.parseArray(json);
            for (int i = 0; i < channels.size(); i++) {
                if (isChannelUsable(channels.getJSONObject(i))) {
                    return true;
                }
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    private boolean isChannelUsable(JSONObject channel) {
        if (channel == null || !channel.getBooleanValue("enabled")) {
            return false;
        }
        if (!"epay".equals(channel.getString("type"))) {
            return false;
        }
        JSONObject config = channel.getJSONObject("config");
        String url = config == null ? null : config.getString("url");
        String pid = config == null ? null : config.getString("pid");
        String secret = config == null ? null : config.getString("secret");
        return StringUtils.isNotBlank(url) && StringUtils.isNotBlank(pid) && StringUtils.isNotBlank(secret);
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

    /** 渠道允许的付款方式：取 payTypes 中受支持的值，未配置时默认支付宝 */
    static List<String> allowedPayTypes(JSONObject channel) {
        List<String> result = new ArrayList<>();
        Object raw = channel == null ? null : channel.get("payTypes");
        if (!(raw instanceof JSONArray)) {
            result.add("alipay");
            return result;
        }
        JSONArray types = (JSONArray) raw;
        for (int i = 0; i < types.size(); i++) {
            String type = types.getString(i);
            if (PAY_TYPE_LABELS.containsKey(type) && !result.contains(type)) {
                result.add(type);
            }
        }
        return result;
    }

    /** 费率（百分比），留空为 0；不是 0～100 之间的数字返回 null */
    static BigDecimal parseFeeRate(String value) {
        if (StringUtils.isBlank(value)) {
            return BigDecimal.ZERO;
        }
        try {
            BigDecimal rate = new BigDecimal(value.trim());
            if (rate.compareTo(BigDecimal.ZERO) < 0 || rate.compareTo(new BigDecimal("100")) > 0) {
                return null;
            }
            return rate;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 实付金额 = 到账金额 ×（1 + 费率%），保留两位小数，四舍五入 */
    static BigDecimal payAmountOf(BigDecimal amount, BigDecimal feeRate) {
        BigDecimal fee = amount.multiply(feeRate).divide(new BigDecimal("100"), 2, RoundingMode.HALF_UP);
        return amount.add(fee).setScale(2, RoundingMode.HALF_UP);
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
