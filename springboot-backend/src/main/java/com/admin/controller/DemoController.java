package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.lang.R;
import com.admin.common.utils.DemoArea;
import com.admin.entity.User;
import com.admin.service.DemoChangeService;
import com.admin.service.UserService;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.annotation.Resource;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 演示账号的权限分配。全部需要管理员角色，且不在只读白名单里，演示账号自己调用不了
 */
@RestController
@RequestMapping("/api/v1/demo")
public class DemoController {

    private static final java.util.regex.Pattern RESTORE_TIME = java.util.regex.Pattern.compile("^([01]\\d|2[0-3]):[0-5]\\d$");

    @Resource
    private UserService userService;

    @Resource
    private DemoChangeService demoChangeService;

    @RequireRole
    @PostMapping("/permission")
    public R permission(@RequestBody Map<String, Object> params) {
        User user = demoUser(params);
        if (user == null) {
            return R.err("演示账号不存在");
        }
        List<Map<String, String>> options = new ArrayList<>();
        for (DemoArea area : demoChangeService.activeAreas()) {
            Map<String, String> option = new LinkedHashMap<>();
            option.put("code", area.getCode());
            option.put("label", area.getLabel());
            options.add(option);
        }
        Map<String, Object> pending = demoChangeService.pending(user.getId());
        Object earliest = pending.get("earliest");
        Map<String, Object> result = new HashMap<>();
        result.put("options", options);
        result.put("areas", DemoArea.parse(user.getDemoAreas()));
        result.put("restoreTime", user.getDemoRestoreTime());
        result.put("pendingCount", pending.get("count"));
        result.put("nextRestoreTime", earliest != null && user.getDemoRestoreTime() != null
                ? DemoChangeService.nextRestoreMillis(user.getDemoRestoreTime(), ((Number) earliest).longValue(), java.time.LocalDateTime.now())
                : null);
        return R.ok(result);
    }

    @RequireRole
    @PostMapping("/updatePermission")
    @SuppressWarnings("unchecked")
    public R updatePermission(@RequestBody Map<String, Object> params) {
        User user = demoUser(params);
        if (user == null) {
            return R.err("演示账号不存在");
        }
        // 不传或为空表示不自动恢复
        Object restoreTimeParam = params.get("restoreTime");
        String restoreTime = restoreTimeParam == null || restoreTimeParam.toString().isEmpty() ? null : restoreTimeParam.toString();
        if (restoreTime != null && !RESTORE_TIME.matcher(restoreTime).matches()) {
            return R.err(400, "恢复时间格式应为 HH:mm");
        }
        List<String> areas = params.get("areas") instanceof List ? (List<String>) params.get("areas") : new ArrayList<>();
        userService.update(new UpdateWrapper<User>().eq("id", user.getId())
                .set("demo_areas", DemoArea.join(areas))
                .set("demo_restore_time", restoreTime));
        return R.ok();
    }

    @RequireRole
    @PostMapping("/restore")
    public R restore(@RequestBody Map<String, Object> params) {
        User user = demoUser(params);
        if (user == null) {
            return R.err("演示账号不存在");
        }
        demoChangeService.restore(user.getId());
        return R.ok();
    }

    @RequireRole
    @PostMapping("/commit")
    public R commit(@RequestBody Map<String, Object> params) {
        User user = demoUser(params);
        if (user == null) {
            return R.err("演示账号不存在");
        }
        demoChangeService.commit(user.getId());
        return R.ok();
    }

    private User demoUser(Map<String, Object> params) {
        Object id = params.get("id");
        if (id == null) {
            return null;
        }
        User user = userService.getById(Long.valueOf(id.toString()));
        return user != null && Integer.valueOf(1).equals(user.getDemoMode()) ? user : null;
    }
}
