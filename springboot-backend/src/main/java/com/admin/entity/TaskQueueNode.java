package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * <p>
 * task_queue 记录与节点的关联：节点重新上线时，据此找出所有与该节点相关、待重试的任务，
 * 而不必关心这条任务具体是什么类型
 * </p>
 *
 * @author QAQ
 * @since 2026-09-24
 */
@Data
@TableName("task_queue_node")
public class TaskQueueNode implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private Long taskQueueId;

    private Long nodeId;
}
