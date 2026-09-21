package com.admin.service;

import com.admin.common.dto.RechargeDto;
import com.admin.common.lang.R;

import java.util.Map;

/**
 * <p>
 * 钱包充值 / 支付网关对接服务
 * </p>
 */
public interface RechargeService {

    /**
     * 创建充值订单，返回支付跳转链接
     *
     * @param dto     充值请求（金额、渠道ID）
     * @param baseUrl 当前请求的 scheme://host，用于在渠道未配置回调域名时拼接 notify_url/return_url
     */
    R createRechargeOrder(RechargeDto dto, String baseUrl);

    /**
     * 处理易支付异步通知回调
     *
     * @param params 回调参数
     * @return 必须原样返回给网关的文本（"success" 或 "fail"）
     */
    String handleEpayNotify(Map<String, String> params);
}
