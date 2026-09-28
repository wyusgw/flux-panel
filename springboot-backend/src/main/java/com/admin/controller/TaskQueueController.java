package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.annotation.RequireRole;
import com.admin.common.lang.R;
import com.admin.common.utils.TaskMetricsService;
import com.admin.service.TaskQueueService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * <p>
 * 通用任务重试队列前端控制器（转发同步、Telegram 通知发送等异步任务失败后的重试队列）
 * </p>
 *
 * @author QAQ
 * @since 2026-09-24
 */
@RestController
@RequestMapping("/api/v1/task-queue")
@CrossOrigin
public class TaskQueueController extends BaseController {

    @Autowired
    private TaskQueueService taskQueueService;

    @Autowired
    private TaskMetricsService taskMetricsService;

    @LogAnnotation
    @RequireRole
    @PostMapping("/list")
    public R list() {
        return taskQueueService.listAll();
    }

    /**
     * 转发同步 / Telegram 通知的处理量统计（近一小时、24 小时内），区别于 /list 只登记失败重试任务，
     * 这里的数字覆盖所有成功+失败的处理次数
     */
    @LogAnnotation
    @RequireRole
    @PostMapping("/metrics")
    public R metrics() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("successLastHour", taskMetricsService.successInLastHour());
        result.put("failureLastHour", taskMetricsService.failureInLastHour());
        result.put("successLast24h", taskMetricsService.successInLast24h());
        result.put("failureLast24h", taskMetricsService.failureInLast24h());
        return R.ok(result);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/health")
    public R health() {
        return taskQueueService.getHealth();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/retry")
    public R retry(@RequestBody Map<String, Object> params) {
        Long id = Long.valueOf(params.get("id").toString());
        return taskQueueService.retryOne(id);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/delete")
    public R delete(@RequestBody Map<String, Object> params) {
        Long id = Long.valueOf(params.get("id").toString());
        boolean result = taskQueueService.removeById(id);
        return result ? R.ok("删除成功") : R.err("删除失败");
    }
}
