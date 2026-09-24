package com.admin.service;

import com.admin.entity.UserDailyRawFlow;
import com.baomidou.mybatisplus.extension.service.IService;

public interface UserDailyRawFlowService extends IService<UserDailyRawFlow> {

    /**
     * 把一次流量上报的原始（不计流量倍率）字节数累加到该用户"今天"这一自然日的记录上，
     * 记录不存在则先创建。仅用于"统计数据"弹窗的展示，不参与计费。
     */
    void recordRaw(Integer userId, long rawBytes);

    /**
     * 查询某用户今日、昨日累计的原始流量（字节），用于"我的转发规则"页「统计数据」弹窗
     */
    long[] getTodayAndYesterday(Integer userId);
}
