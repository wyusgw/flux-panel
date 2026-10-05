package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * 节点状态页的周期流量：当前周期（默认每月 1 日 0 点开始）内节点网卡的上行/下行累计字节数。
 * last_raw_* 是上一次上报的网卡累计值，用来算两次上报之间的增量。
 */
@Data
@TableName("node_traffic_cycle")
public class NodeTrafficCycle implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private Long nodeId;

    /** 当前周期的起点（毫秒时间戳） */
    private Long cycleStart;

    private Long upBytes;

    private Long downBytes;

    private Long lastRawUp;

    private Long lastRawDown;

    private Long updatedTime;
}
