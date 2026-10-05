package com.admin.service;

import com.admin.entity.NodeTrafficCycle;
import com.baomidou.mybatisplus.extension.service.IService;

public interface NodeTrafficCycleService extends IService<NodeTrafficCycle> {

    /**
     * 节点每次上报系统信息时调用：用网卡累计值（rawUp/rawDown）更新该节点的周期流量，返回更新后的周期数据（只读快照）。
     * 周期到了重置日会自动清零重新累计；网卡计数器变小（服务器重启）时把新值整体计为增量。
     */
    NodeTrafficCycle record(Long nodeId, long rawUp, long rawDown);

    /** 当前配置的每月重置日（站点设置 node_traffic_reset_day），默认 1，范围 1-31 */
    int getResetDay();

    /** 把内存中的最新周期流量落库（定时任务与停机时调用） */
    void flush();
}
