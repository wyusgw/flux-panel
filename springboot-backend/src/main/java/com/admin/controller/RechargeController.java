package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.dto.RechargeDto;
import com.admin.common.lang.R;
import com.admin.common.utils.HttpContextUtils;
import com.admin.service.RechargeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.HashMap;
import java.util.Map;

/**
 * <p>
 * 钱包充值 / 支付网关对接控制器
 * </p>
 *
 * @author QAQ
 * @since 2026-09-21
 */
@RestController
@RequestMapping("/api/v1/recharge")
@CrossOrigin
public class RechargeController {

    @Autowired
    private RechargeService rechargeService;

    /**
     * 创建充值订单，返回支付跳转链接（需登录）
     */
    @LogAnnotation
    @PostMapping("/create")
    public R create(@Validated @RequestBody RechargeDto rechargeDto) {
        return rechargeService.createRechargeOrder(rechargeDto, resolveBaseUrl(HttpContextUtils.getHttpServletRequest()));
    }

    /**
     * 易支付异步通知回调（网关服务器直接调用，无登录态，必须原样返回 success/fail 纯文本）
     */
    @PostMapping("/notify/epay")
    public String notifyEpayPost(HttpServletRequest request) {
        return handleNotify(request);
    }

    @GetMapping("/notify/epay")
    public String notifyEpayGet(HttpServletRequest request) {
        return handleNotify(request);
    }

    /** 查询自己的充值订单状态（需登录），当面付扫码时轮询 */
    @PostMapping("/status")
    public R status(@RequestBody Map<String, String> body) {
        return rechargeService.getRechargeOrderStatus(body == null ? null : body.get("orderNo"));
    }

    /** 支付宝当面付异步通知：表单参数，返回 success 表示已处理，其他内容支付宝会重试 */
    @PostMapping("/notify/alipayf2f")
    public String notifyAlipayF2f(HttpServletRequest request) {
        Map<String, String> params = paramsFromRequest(request);
        return safely(() -> rechargeService.handleAlipayF2fNotify(params)) ? "success" : "fail";
    }

    /** 微信支付 Native 回调：成功返回 200，失败返回 4xx 和 FAIL，微信支付会重试 */
    @PostMapping("/notify/wechatnative")
    public ResponseEntity<String> notifyWechatNative(HttpServletRequest request, @RequestBody(required = false) String body) {
        boolean ok = safely(() -> rechargeService.handleWechatNativeNotify(
                request.getHeader("Wechatpay-Timestamp"), request.getHeader("Wechatpay-Nonce"),
                request.getHeader("Wechatpay-Signature"), body));
        return ok
                ? ResponseEntity.ok().contentType(org.springframework.http.MediaType.APPLICATION_JSON).body("{\"code\":\"SUCCESS\"}")
                : ResponseEntity.badRequest().contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                    .body("{\"code\":\"FAIL\",\"message\":\"处理失败\"}");
    }

    /** EPUSDT 回调：返回 ok 表示已处理，其他内容网关会重试 */
    @PostMapping("/notify/epusdt")
    public String notifyEpusdt(@RequestBody(required = false) String body) {
        return safely(() -> rechargeService.handleEpusdtNotify(body)) ? "ok" : "fail";
    }

    /** TokenPay 回调：返回 ok 表示已处理 */
    @PostMapping("/notify/tokenpay")
    public String notifyTokenpay(@RequestBody(required = false) String body) {
        return safely(() -> rechargeService.handleTokenpayNotify(body)) ? "ok" : "fail";
    }

    /** Cryptomus Webhook：非 200 状态码时网关会重试 */
    @PostMapping("/notify/cryptomus")
    public ResponseEntity<String> notifyCryptomus(@RequestBody(required = false) String body) {
        return safely(() -> rechargeService.handleCryptomusNotify(body))
                ? ResponseEntity.ok("ok")
                : ResponseEntity.badRequest().body("fail");
    }

    private boolean safely(java.util.function.BooleanSupplier handler) {
        try {
            return handler.getAsBoolean();
        } catch (Exception e) {
            return false;
        }
    }

    /** 处理异常时也只回 fail 纯文本，让网关稍后重试 */
    private String handleNotify(HttpServletRequest request) {
        try {
            return rechargeService.handleEpayNotify(paramsFromRequest(request));
        } catch (Exception e) {
            return "fail";
        }
    }

    private Map<String, String> paramsFromRequest(HttpServletRequest request) {
        Map<String, String> params = new HashMap<>();
        request.getParameterMap().forEach((key, values) -> {
            if (values != null && values.length > 0) {
                params.put(key, values[0]);
            }
        });
        return params;
    }

    private String resolveBaseUrl(HttpServletRequest request) {
        String scheme = request.getHeader("X-Forwarded-Proto");
        if (scheme == null || scheme.isEmpty()) {
            scheme = request.getScheme();
        }
        String host = request.getHeader("Host");
        if (host == null || host.isEmpty()) {
            host = request.getServerName() + ":" + request.getServerPort();
        }
        return scheme + "://" + host;
    }
}
