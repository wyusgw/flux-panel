package com.admin.controller;


import com.admin.common.aop.LogAnnotation;
import com.admin.common.lang.R;
import javax.servlet.http.HttpServletResponse;

import com.admin.common.utils.Md5Util;
import com.admin.entity.User;
import com.admin.entity.UserTunnel;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.springframework.web.bind.annotation.*;

import com.admin.common.utils.HttpContextUtils;
import com.admin.common.utils.LoginAttemptLimiter;

import java.util.Objects;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/openApi")
public class OpenApiController extends BaseController {

    @javax.annotation.Resource
    private LoginAttemptLimiter loginAttemptLimiter;

    @LogAnnotation
    @GetMapping("/subStore")
    public Object create(
            @RequestParam("user") String user,
            @RequestParam("pwd") String pwd,
            @RequestParam(value = "tunnel", required = false, defaultValue = "-1") String tunnel,
            HttpServletResponse response) {
        JSONObject result = new JSONObject();
        result.put("upload", 0);
        result.put("download", 0);
        result.put("total", 0);
        result.put("expire", 0);
        // 校验 user 是否为空
        if (user == null || user.isEmpty()) {
            return R.err("用户不能为空");
        }
        if (pwd == null || pwd.isEmpty()) {
            return R.err("密码不能为空");
        }

        // 这个接口没有验证码，和登录共用尝试次数限制，否则可以绕过验证码猜密码
        String clientIp = LoginAttemptLimiter.clientIp(HttpContextUtils.getHttpServletRequest());
        String attemptKey = userService.loginAttemptKey(user);
        if (loginAttemptLimiter.isBlocked(attemptKey, clientIp)) {
            return R.err(429, LoginAttemptLimiter.TOO_MANY_ATTEMPTS);
        }

        User userInfo = userService.getOne(new QueryWrapper<User>().eq("user", user));
        if (userInfo == null) {
            loginAttemptLimiter.recordFailure(attemptKey, clientIp);
            return R.err("鉴权失败");
        }

        String pwdMd5 = Md5Util.md5(pwd);
        if (!Objects.equals(pwdMd5, userInfo.getPwd())) {
            loginAttemptLimiter.recordFailure(attemptKey, clientIp);
            return R.err("鉴权失败");
        }
        loginAttemptLimiter.recordSuccess(attemptKey, clientIp);

        final long GIGA = 1024L * 1024L * 1024L;
        String headerValue;

        if ("-1".equals(tunnel)) {
            // 没有到期时间、流量为空的账号（如未购买套餐）按 0 返回，不能因为空值出错
            headerValue = buildSubscriptionHeader(
                    orZero(userInfo.getOutFlow()),
                    orZero(userInfo.getInFlow()),
                    orZero(userInfo.getFlow()) * GIGA,
                    orZero(userInfo.getExpTime()) / 1000
            );
        } else {
            UserTunnel tunnelInfo = userTunnelService.getById(tunnel);
            if (tunnelInfo == null) return R.err("隧道不存在");
            if (!tunnelInfo.getUserId().toString().equals(userInfo.getId().toString())) return R.err("隧道不存在");
            headerValue = buildSubscriptionHeader(
                    orZero(tunnelInfo.getOutFlow()),
                    orZero(tunnelInfo.getInFlow()),
                    orZero(tunnelInfo.getFlow()) * GIGA,
                    orZero(tunnelInfo.getExpTime()) / 1000
            );
        }

        response.setHeader("subscription-userinfo", headerValue);
        return headerValue;
    }



    private static long orZero(Number value) {
        return value == null ? 0L : value.longValue();
    }

    private String buildSubscriptionHeader(long upload, long download, long total, long expire) {
        return String.format("upload=%d; download=%d; total=%d; expire=%d", download, upload, total, expire);
    }


}
