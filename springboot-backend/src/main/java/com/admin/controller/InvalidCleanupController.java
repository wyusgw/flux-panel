package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.lang.R;
import com.admin.service.InvalidCleanupService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.annotation.Resource;

@RestController
@RequestMapping("/api/v1/cleanup")
public class InvalidCleanupController {

    @Resource
    private InvalidCleanupService invalidCleanupService;

    @RequireRole
    @PostMapping("/invalidUsers")
    public R invalidUsers() {
        return invalidCleanupService.previewInvalidUsers();
    }

    @RequireRole
    @PostMapping("/cleanInvalidUsers")
    public R cleanInvalidUsers() {
        return invalidCleanupService.cleanInvalidUsers();
    }

    @RequireRole
    @PostMapping("/invalidForwards")
    public R invalidForwards() {
        return invalidCleanupService.previewInvalidForwards();
    }

    @RequireRole
    @PostMapping("/cleanInvalidForwards")
    public R cleanInvalidForwards() {
        return invalidCleanupService.cleanInvalidForwards();
    }
}
