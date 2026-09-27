package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.lang.R;
import com.admin.service.DashboardService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

/**
 * <p>
 * 管理员仪表盘聚合统计控制器
 * </p>
 *
 * @author QAQ
 * @since 2026-09-27
 */
@RestController
@CrossOrigin
@RequestMapping("/api/v1/dashboard")
public class DashboardController {

    @Autowired
    private DashboardService dashboardService;

    @LogAnnotation
    @RequireRole
    @PostMapping("/flow-stats")
    public R getFlowStats() {
        return dashboardService.getFlowStats();
    }
}
