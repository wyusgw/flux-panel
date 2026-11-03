package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * <p>
 * 节点在线数量的定时采样记录（每 5 分钟一条），供管理员仪表盘「节点在线」曲线图使用。
 * 节点状态本身只有当前值，没有历史，所以由定时任务周期性记下当时的在线数与节点总数，默认保留 31 天。
 * </p>
 */
@Data
@TableName("node_online_history")
public class NodeOnlineHistory implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /** 采样时间（毫秒时间戳） */
    private Long sampleTime;

    /** 采样时在线节点数 */
    private Integer onlineCount;

    /** 采样时节点总数 */
    private Integer totalCount;
}
