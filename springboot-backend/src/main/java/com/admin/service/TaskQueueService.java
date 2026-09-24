package com.admin.service;

import com.admin.common.lang.R;
import com.admin.entity.TaskQueue;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.List;

public interface TaskQueueService extends IService<TaskQueue> {

    /**
     * 登记一条待重试任务。dedupKey 非空时，同一 taskType+dedupKey 已有记录会被覆盖更新（不会重复插入）；
     * dedupKey 为空则总是新插入一条。nodeIds 为该任务关联的节点（节点上线时会触发对应任务重试），可为空。
     */
    void enqueue(String taskType, String dedupKey, String payload, List<Long> nodeIds, String error);

    /**
     * 按 taskType+dedupKey 移除一条待重试任务（连同其节点关联），任务已完成（如转发被删除）时调用
     */
    void removeByTypeAndKey(String taskType, String dedupKey);

    /**
     * 获取队列列表（管理员查看，附带任务类型展示名称、关联节点名称等信息）
     */
    R listAll();

    /**
     * 管理员手动触发单条重试
     */
    R retryOne(Long queueId);

    /**
     * 某个节点重新上线时调用：重试所有与该节点关联的队列项，不区分任务类型
     */
    void retryByNodeId(Long nodeId);

    /**
     * 定时兜底扫描：重试所有还没超过自动重试次数上限的队列项
     */
    void retryAllPending();

    /**
     * 定时兜底扫描每次成功执行后调用一次，记录本次运行时间，供 {@link #getHealth()} 判断队列是否还在正常运行
     */
    void recordSweepRun();

    /**
     * 队列总体运行状态：服务是否还在正常运行（定时兜底扫描是否按预期节奏执行）、
     * 最近一次扫描时间、服务启动时间
     */
    R getHealth();

    /**
     * 定时清理：删除超过 24 小时的 SUCCESS 记录（连同其节点关联），避免队列表无限增长
     */
    void purgeExpiredSuccess();
}
