package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.dto.RechargeDto;
import com.admin.common.lang.R;
import com.admin.common.utils.HttpContextUtils;
import com.admin.service.RechargeService;
import org.springframework.beans.factory.annotation.Autowired;
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
        return rechargeService.handleEpayNotify(paramsFromRequest(request));
    }

    @GetMapping("/notify/epay")
    public String notifyEpayGet(HttpServletRequest request) {
        return rechargeService.handleEpayNotify(paramsFromRequest(request));
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
