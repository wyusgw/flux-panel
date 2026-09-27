package com.admin.service;

import com.admin.entity.NodeDailyRawFlow;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.List;

public interface NodeDailyRawFlowService extends IService<NodeDailyRawFlow> {

    /**
     * 把一次流量上报的原始（不计流量倍率）字节数累加到该节点"今天"这一自然日的记录上，
     * 记录不存在则先创建。仅用于管理员仪表盘的节点流量排行展示，不参与计费。
     */
    void recordRaw(Long nodeId, long rawBytes);

    /**
     * 查询某一自然日所有节点的累计原始流量记录，供仪表盘计算节点流量排行
     */
    List<NodeDailyRawFlow> listByDay(String day);
}
