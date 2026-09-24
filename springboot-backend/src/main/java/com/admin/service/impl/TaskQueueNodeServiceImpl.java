package com.admin.service.impl;

import com.admin.entity.TaskQueueNode;
import com.admin.mapper.TaskQueueNodeMapper;
import com.admin.service.TaskQueueNodeService;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.stereotype.Service;

@Service
public class TaskQueueNodeServiceImpl extends ServiceImpl<TaskQueueNodeMapper, TaskQueueNode> implements TaskQueueNodeService {
}
