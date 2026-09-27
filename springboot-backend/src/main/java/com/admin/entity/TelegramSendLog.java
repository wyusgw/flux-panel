package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * <p>
 * Telegram 通知发送记录：每次尝试发送（无论成功/失败）都登记一条，供管理员查看送达状态。
 * 与 task_queue 的 TELEGRAM_NOTIFY 类型不同，后者只登记失败后待重试的任务，这里覆盖全部发送历史。
 * </p>
 *
 * @author QAQ
 * @since 2026-09-27
 */
@Data
@TableName("telegram_send_log")
public class TelegramSendLog implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 接收者用户ID（设备状态广播给管理员时为对应管理员的ID；测试消息为发起测试的管理员ID）
     */
    private Long userId;

    private String chatId;

    /**
     * 通知类型：PAYMENT_SUCCESS / DEVICE_OFFLINE / DEVICE_ONLINE / RENEW_SUCCESS / RENEW_FAILED /
     * EXPIRY_REMINDER / FLOW_REMINDER / TEST
     */
    private String type;

    /**
     * 实际发送的消息内容（渲染模板后的最终文本）
     */
    private String content;

    /**
     * SUCCESS：首次发送即成功；FAILED：首次发送失败（若已登记进 task_queue 重试，见 error 字段说明）
     */
    private String status;

    private String error;

    private Long createdTime;
}
