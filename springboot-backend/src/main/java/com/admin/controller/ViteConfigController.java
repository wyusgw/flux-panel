package com.admin.controller;


import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.lang.R;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import javax.servlet.http.HttpServletRequest;

/**
 * <p>
 *  网站配置控制器
 * </p>
 *
 * @author QAQ
 * @since 2025-07-24
 */
@RestController
@CrossOrigin
@RequestMapping("/api/v1/config")
public class ViteConfigController extends BaseController {

    /** 后端构建日期（YYYYMMDD），每次发布新版本时更新此常量 */
    private static final String BACKEND_VERSION = "20260927";

    /**
     * 获取后端信息（构建版本、当前服务器时间等），供前端「主页 - 后端信息」面板展示
     */
    @LogAnnotation
    @PostMapping("/backendInfo")
    public R getBackendInfo() {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("time", System.currentTimeMillis() / 1000);
        info.put("version", BACKEND_VERSION);
        return R.ok(info);
    }

    /**
     * 获取所有网站配置
     * 前端无需权限即可访问，用于获取网站基本信息
     */
    @LogAnnotation
    @PostMapping("/list")
    public R getConfigs() {
        return viteConfigService.getConfigs();
    }

    /**
     * 根据配置名获取配置值
     * 前端无需权限即可访问，用于获取特定配置
     */
    @LogAnnotation
    @PostMapping("/get")
    public R getConfigByName(@RequestBody Map<String, Object> params) {
        String name = params.get("name").toString();
        return viteConfigService.getConfigByName(name);
    }

    /**
     * 批量更新网站配置
     * 需要管理员权限
     */
    @LogAnnotation
    @RequireRole
    @PostMapping("/update")
    public R updateConfigs(@RequestBody Map<String, String> configMap, HttpServletRequest request) {
        Set<String> demoAreas = demoAreas(request);
        return demoAreas != null ? viteConfigService.updateConfigsAsDemo(configMap, demoAreas) : viteConfigService.updateConfigs(configMap);
    }

    /**
     * 更新单个配置项
     * 需要管理员权限
     */
    @LogAnnotation
    @RequireRole
    @PostMapping("/updateSingle")
    public R updateConfig(@RequestBody Map<String, Object> params, HttpServletRequest request) {
        String name = params.get("name").toString();
        String value = params.get("value").toString();
        Set<String> demoAreas = demoAreas(request);
        return demoAreas != null
                ? viteConfigService.updateConfigsAsDemo(java.util.Collections.singletonMap(name, value), demoAreas)
                : viteConfigService.updateConfig(name, value);
    }

    @SuppressWarnings("unchecked")
    private static Set<String> demoAreas(HttpServletRequest request) {
        return (Set<String>) request.getAttribute(com.admin.common.interceptor.ReadOnlyInterceptor.DEMO_AREAS_ATTRIBUTE);
    }

}
