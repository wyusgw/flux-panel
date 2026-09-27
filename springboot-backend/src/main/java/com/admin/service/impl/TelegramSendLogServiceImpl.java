package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.TelegramSendLog;
import com.admin.entity.User;
import com.admin.mapper.TelegramSendLogMapper;
import com.admin.service.TelegramSendLogService;
import com.admin.service.UserService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * <p>
 * Telegram 通知发送记录服务实现类
 * </p>
 *
 * @author QAQ
 * @since 2026-09-27
 */
@Slf4j
@Service
public class TelegramSendLogServiceImpl extends ServiceImpl<TelegramSendLogMapper, TelegramSendLog> implements TelegramSendLogService {

    private static final String STATUS_SUCCESS = "SUCCESS";
    private static final String STATUS_FAILED = "FAILED";

    /** 发送记录保留时长：30 天，避免表无限增长 */
    private static final long RETENTION_MS = 30L * 24 * 60 * 60 * 1000;

    /** 单次查询最多返回的记录数，避免管理员面板一次性加载过多数据 */
    private static final int MAX_LIMIT = 500;
    private static final int DEFAULT_LIMIT = 100;

    @Resource
    @Lazy
    private UserService userService;

    @Override
    public void record(Long userId, String chatId, String type, String content, boolean success, String error) {
        try {
            TelegramSendLog entry = new TelegramSendLog();
            entry.setUserId(userId);
            entry.setChatId(chatId);
            entry.setType(type);
            entry.setContent(content);
            entry.setStatus(success ? STATUS_SUCCESS : STATUS_FAILED);
            entry.setError(error);
            entry.setCreatedTime(System.currentTimeMillis());
            this.save(entry);
        } catch (Exception e) {
            log.warn("登记 Telegram 发送记录失败: {}", e.getMessage());
        }
    }

    @Override
    public R list(String type, String status, Integer limit) {
        int effectiveLimit = (limit == null || limit <= 0) ? DEFAULT_LIMIT : Math.min(limit, MAX_LIMIT);

        QueryWrapper<TelegramSendLog> query = new QueryWrapper<>();
        if (type != null && !type.isEmpty()) {
            query.eq("type", type);
        }
        if (status != null && !status.isEmpty()) {
            query.eq("status", status);
        }
        query.orderByDesc("created_time");
        query.last("LIMIT " + effectiveLimit);

        List<TelegramSendLog> items = this.list(query);
        if (items.isEmpty()) {
            return R.ok(new ArrayList<>());
        }

        Set<Long> userIds = items.stream().map(TelegramSendLog::getUserId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, String> userNameMap = new HashMap<>();
        if (!userIds.isEmpty()) {
            List<User> users = userService.listByIds(userIds);
            for (User u : users) {
                userNameMap.put(u.getId(), u.getUser());
            }
        }

        List<Map<String, Object>> result = items.stream().map(item -> {
            Map<String, Object> row = new HashMap<>();
            row.put("id", item.getId());
            row.put("userId", item.getUserId());
            row.put("userName", item.getUserId() != null ? userNameMap.getOrDefault(item.getUserId(), "用户#" + item.getUserId()) : null);
            row.put("chatId", item.getChatId());
            row.put("type", item.getType());
            row.put("content", item.getContent());
            row.put("status", item.getStatus());
            row.put("error", item.getError());
            row.put("createdTime", item.getCreatedTime());
            return row;
        }).collect(Collectors.toList());

        return R.ok(result);
    }

    @Override
    public void purgeExpired() {
        long cutoff = System.currentTimeMillis() - RETENTION_MS;
        this.remove(new QueryWrapper<TelegramSendLog>().lt("created_time", cutoff));
    }
}
