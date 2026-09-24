package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * <p>
 * 用户按自然日累计的原始流量（不计设备组流量倍率），供"我的转发规则"页「统计数据」弹窗的
 * 今日流量/昨日流量展示使用。与计费用的 {@link StatisticsFlow}（按小时、已计倍率、只保留 48 小时）
 * 是两套不同用途的统计，互不影响。
 * </p>
 *
 * @author QAQ
 * @since 2026-09-23
 */
@Data
@TableName("user_daily_raw_flow")
public class UserDailyRawFlow implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private Integer userId;

    /** 自然日，格式 yyyy-MM-dd */
    private String day;

    /** 当日累计原始流量（上行+下行，字节，不计倍率） */
    private Long rawBytes;

    private Long updatedTime;
}
