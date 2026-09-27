package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.lang.R;
import com.admin.service.TelegramSendLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * <p>
 * Telegram 通知发送记录控制器：供管理员查看送达状态面板
 * </p>
 *
 * @author QAQ
 * @since 2026-09-27
 */
@RestController
@CrossOrigin
@RequestMapping("/api/v1/telegram-log")
public class TelegramSendLogController {

    @Autowired
    private TelegramSendLogService telegramSendLogService;

    @LogAnnotation
    @RequireRole
    @PostMapping("/list")
    public R list(@RequestBody(required = false) Map<String, Object> params) {
        String type = params != null && params.get("type") != null ? params.get("type").toString() : null;
        String status = params != null && params.get("status") != null ? params.get("status").toString() : null;
        Integer limit = params != null && params.get("limit") != null ? Integer.valueOf(params.get("limit").toString()) : null;
        return telegramSendLogService.list(type, status, limit);
    }
}
