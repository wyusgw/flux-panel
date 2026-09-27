package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * <p>
 * 节点按自然日累计的原始流量（不计流量倍率），供管理员仪表盘「今日/昨日节点流量排行」使用。
 * 与 {@link UserDailyRawFlow} 是同一次流量上报按不同维度（节点 / 用户）各自累计的两份独立统计，
 * 互不影响；节点维度取自流量上报请求所携带的节点密钥对应的节点，即产生这条流量的入口节点。
 * </p>
 *
 * @author QAQ
 * @since 2026-09-27
 */
@Data
@TableName("node_daily_raw_flow")
public class NodeDailyRawFlow implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private Long nodeId;

    /** 自然日，格式 yyyy-MM-dd */
    private String day;

    /** 当日累计原始流量（上行+下行，字节，不计倍率） */
    private Long rawBytes;

    private Long updatedTime;
}
