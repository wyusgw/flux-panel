package com.admin.service;

import com.admin.common.lang.R;
import com.baomidou.mybatisplus.extension.service.IService;
import com.admin.entity.TelegramSendLog;

/**
 * Telegram 通知发送记录服务：登记每次发送尝试、供管理员查看送达状态面板
 */
public interface TelegramSendLogService extends IService<TelegramSendLog> {

    /**
     * 登记一条发送记录
     *
     * @param userId  接收者用户ID，可为空
     * @param chatId  接收者 Telegram chat id
     * @param type    通知类型
     * @param content 实际发送的消息内容
     * @param success 是否发送成功
     * @param error   失败原因，成功时为空
     */
    void record(Long userId, String chatId, String type, String content, boolean success, String error);

    /**
     * 管理员查看发送历史：按类型/状态过滤，按时间倒序，最多返回 limit 条
     */
    R list(String type, String status, Integer limit);

    /**
     * 定时清理：删除超过保留期的记录，避免表无限增长
     */
    void purgeExpired();
}
