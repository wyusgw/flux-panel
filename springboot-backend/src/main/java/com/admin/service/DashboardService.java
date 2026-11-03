package com.admin.service;

import com.admin.common.lang.R;

/**
 * 管理员仪表盘的聚合统计服务：把散落在多张表里的原始数据在后端汇总好，
 * 前端只负责渲染，避免像此前那样在前端把整份用户/节点列表拉下来自己拼算（且经常漏算）。
 */
public interface DashboardService {

    /**
     * 今日/昨日系统总流量、用户流量排行、节点流量排行（均为不计流量倍率的原始流量）
     */
    R getFlowStats();

    /**
     * 节点在线 / 离线数量趋势。range 为 "day"（默认）时返回最近 24 小时每 5 分钟一个采样点，
     * 为 "month" 时返回最近 30 天按自然日汇总的点（当日最多在线数、当日最多离线数）。
     * 每个点为：time（毫秒时间戳）、online、offline
     */
    R getNodeOnlineTrend(String range);
}
