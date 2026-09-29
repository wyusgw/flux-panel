package com.admin.service.impl;

import com.admin.entity.TaskErrorLog;
import com.admin.entity.ViteConfig;
import com.admin.mapper.TaskErrorLogMapper;
import com.admin.service.TaskErrorLogService;
import com.admin.service.ViteConfigService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.List;

/**
 * <p>
 * 任务队列报错日志服务实现类
 * </p>
 *
 * @author QAQ
 * @since 2026-09-29
 */
@Slf4j
@Service
public class TaskErrorLogServiceImpl extends ServiceImpl<TaskErrorLogMapper, TaskErrorLog> implements TaskErrorLogService {

    /** 报错日志默认保留天数，可在站点设置（error_log_retention_days）中修改 */
    private static final int DEFAULT_RETENTION_DAYS = 7;
    private static final String CONFIG_RETENTION_DAYS = "error_log_retention_days";
    private static final long DAY_MS = 24L * 60 * 60 * 1000;

    private static final int MAX_ERROR_LENGTH = 500;

    @Resource
    private ViteConfigService viteConfigService;

    @Override
    public void record(String taskType, String error) {
        try {
            TaskErrorLog entry = new TaskErrorLog();
            entry.setTaskType(taskType);
            String message = error != null ? error : "未知错误";
            entry.setError(message.length() > MAX_ERROR_LENGTH ? message.substring(0, MAX_ERROR_LENGTH) : message);
            entry.setCreatedTime(System.currentTimeMillis());
            this.save(entry);
        } catch (Exception e) {
            log.warn("登记任务队列报错日志失败: {}", e.getMessage());
        }
    }

    @Override
    public long countAll() {
        // 清理任务每天才跑一次，这里按保留天数过滤，保证「X日内报错数量」不含已超期但还没被清理的记录
        long cutoff = System.currentTimeMillis() - getRetentionDays() * DAY_MS;
        return this.count(new QueryWrapper<TaskErrorLog>().ge("created_time", cutoff));
    }

    @Override
    public List<TaskErrorLog> listRecent(int limit) {
        long cutoff = System.currentTimeMillis() - getRetentionDays() * DAY_MS;
        return this.list(new QueryWrapper<TaskErrorLog>().ge("created_time", cutoff)
                .orderByDesc("created_time").last("LIMIT " + limit));
    }

    @Override
    public void purgeExpired() {
        long cutoff = System.currentTimeMillis() - getRetentionDays() * DAY_MS;
        this.remove(new QueryWrapper<TaskErrorLog>().lt("created_time", cutoff));
    }

    @Override
    public int getRetentionDays() {
        ViteConfig config = viteConfigService.getOne(new QueryWrapper<ViteConfig>().eq("name", CONFIG_RETENTION_DAYS));
        String value = config != null ? config.getValue() : null;
        if (value == null || value.trim().isEmpty()) return DEFAULT_RETENTION_DAYS;
        try {
            int days = Integer.parseInt(value.trim());
            return days > 0 ? days : DEFAULT_RETENTION_DAYS;
        } catch (NumberFormatException e) {
            return DEFAULT_RETENTION_DAYS;
        }
    }
}
