package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.lang.R;
import com.admin.common.utils.JwtUtil;
import com.admin.common.utils.MenuPermission;
import com.admin.entity.User;
import com.admin.entity.ViteConfig;
import com.admin.service.UserService;
import com.admin.service.ViteConfigService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
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
import java.util.Objects;

/**
 * 账号的页面权限分配。只有全权限管理员能分配，否则拿到用户管理的受限管理员可以给自己或别人加权限
 */
@RestController
@RequestMapping("/api/v1/menuPermission")
public class MenuPermissionController {

    private static final int ADMIN_ROLE = 0;

    @Resource
    private UserService userService;

    @Resource
    private ViteConfigService viteConfigService;

    /** 当前账号能使用的页面，null 表示全部 */
    @PostMapping("/mine")
    public R mine() {
        User me = userService.getById(JwtUtil.getUserIdFromToken());
        Map<String, Object> result = new HashMap<>();
        result.put("permissions", me == null || me.getMenuPermissions() == null ? null : MenuPermission.parse(me.getMenuPermissions()));
        return R.ok(result);
    }

    @RequireRole
    @PostMapping("/get")
    public R get(@RequestBody Map<String, Object> params) {
        if (!isFullAdmin()) {
            return R.err(403, "只有全权限管理员可以分配权限");
        }
        User target = target(params);
        if (target == null) {
            return R.err("用户不存在");
        }
        List<MenuPermission.Page> pages = MenuPermission.pagesForRole(isAdmin(target));
        List<Map<String, String>> options = new ArrayList<>();
        List<String> selected = new ArrayList<>();
        for (MenuPermission.Page page : pages) {
            if (!page.isFeatureEnabled(this::configValue)) {
                continue;
            }
            Map<String, String> option = new LinkedHashMap<>();
            option.put("code", page.getCode());
            option.put("label", page.getLabel());
            options.add(option);
            if (target.getMenuPermissions() == null || MenuPermission.parse(target.getMenuPermissions()).contains(page.getCode())) {
                selected.add(page.getCode());
            }
        }
        Map<String, Object> result = new HashMap<>();
        result.put("options", options);
        result.put("selected", selected);
        result.put("admin", isAdmin(target));
        return R.ok(result);
    }

    @RequireRole
    @PostMapping("/update")
    @SuppressWarnings("unchecked")
    public R update(@RequestBody Map<String, Object> params) {
        if (!isFullAdmin()) {
            return R.err(403, "只有全权限管理员可以分配权限");
        }
        User target = target(params);
        if (target == null) {
            return R.err("用户不存在");
        }
        if (Objects.equals(target.getId().intValue(), JwtUtil.getUserIdFromToken())) {
            return R.err("不能修改自己的权限");
        }
        List<String> selected = params.get("selected") instanceof List ? (List<String>) params.get("selected") : new ArrayList<>();
        String merged = MenuPermission.merge(selected, target.getMenuPermissions(), isAdmin(target), this::configValue);
        userService.update(new UpdateWrapper<User>().eq("id", target.getId()).set("menu_permissions", merged));
        return R.ok();
    }

    private boolean isFullAdmin() {
        User me = userService.getById(JwtUtil.getUserIdFromToken());
        return me != null && isAdmin(me) && me.getMenuPermissions() == null;
    }

    private static boolean isAdmin(User user) {
        return Integer.valueOf(ADMIN_ROLE).equals(user.getRoleId());
    }

    private User target(Map<String, Object> params) {
        Object id = params.get("id");
        return id == null ? null : userService.getById(Long.valueOf(id.toString()));
    }

    private String configValue(String name) {
        ViteConfig config = viteConfigService.getOne(new QueryWrapper<ViteConfig>().eq("name", name));
        return config == null ? null : config.getValue();
    }
}
