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

    /**
     * 订阅流量查询。推荐用 token（个人中心复制的地址，每个账号一个，可重置，地址里不含密码）；
     * 原来的 user + pwd 方式继续可用，已经配置在客户端里的旧地址不受影响
     */
    @LogAnnotation
    @GetMapping("/subStore")
    public Object create(
            @RequestParam(value = "token", required = false) String token,
            @RequestParam(value = "user", required = false) String user,
            @RequestParam(value = "pwd", required = false) String pwd,
            @RequestParam(value = "tunnel", required = false, defaultValue = "-1") String tunnel,
            @RequestParam(value = "format", required = false) String format,
            HttpServletResponse response) {
        JSONObject result = new JSONObject();
        result.put("upload", 0);
        result.put("download", 0);
        result.put("total", 0);
        result.put("expire", 0);

        Object auth = token != null && !token.trim().isEmpty() ? authenticateByToken(token.trim()) : authenticateByPassword(user, pwd);
        if (auth instanceof R) {
            return auth;
        }
        User userInfo = (User) auth;

        SubscriptionUsage usage;
        if ("-1".equals(tunnel)) {
            // 没有到期时间、流量为空的账号（如未购买套餐）按 0 返回，不能因为空值出错
            usage = SubscriptionUsage.of(userInfo.getOutFlow(), userInfo.getInFlow(), userInfo.getFlow(), userInfo.getExpTime());
        } else {
            UserTunnel tunnelInfo = userTunnelService.getById(tunnel);
            if (tunnelInfo == null) return R.err("隧道不存在");
            if (!tunnelInfo.getUserId().toString().equals(userInfo.getId().toString())) return R.err("隧道不存在");
            usage = SubscriptionUsage.of(tunnelInfo.getOutFlow(), tunnelInfo.getInFlow(), tunnelInfo.getFlow(), tunnelInfo.getExpTime());
        }

        String headerValue = usage.header();
        // 响应头始终带上，Sub-Store、Clash 等客户端照常读取；format=json 时正文改为 JSON，否则正文与响应头相同
        response.setHeader("subscription-userinfo", headerValue);
        if ("json".equalsIgnoreCase(format)) {
            return usage.toMap();
        }
        return headerValue;
    }

    /**
     * 订阅流量：upload / download 沿用原来响应头的取值（upload 为入站流量 inFlow、download 为出站流量 outFlow），
     * total 为可用流量（GB 换算成字节），expire 为到期时间（Unix 秒）；JSON 和响应头用同一份数据，两者一致
     */
    static final class SubscriptionUsage {
        private static final long GIGA = 1024L * 1024L * 1024L;
        final long upload;
        final long download;
        final long total;
        final long expire;

        private SubscriptionUsage(long upload, long download, long total, long expire) {
            this.upload = upload;
            this.download = download;
            this.total = total;
            this.expire = expire;
        }

        static SubscriptionUsage of(Number outFlow, Number inFlow, Number flowGb, Number expTimeMs) {
            return new SubscriptionUsage(orZero(inFlow), orZero(outFlow), orZero(flowGb) * GIGA, orZero(expTimeMs) / 1000);
        }

        String header() {
            return String.format("upload=%d; download=%d; total=%d; expire=%d", upload, download, total, expire);
        }

        java.util.Map<String, Object> toMap() {
            java.util.Map<String, Object> map = new java.util.LinkedHashMap<>();
            map.put("upload", upload);
            map.put("download", download);
            map.put("total", total);
            map.put("expire", expire);
            return map;
        }
    }



    /** Token 是 128 位随机数，猜不出来；查不到一律按鉴权失败 */
    private Object authenticateByToken(String token) {
        if (!token.matches("[0-9a-f]{32}")) {
            return R.err("鉴权失败");
        }
        User userInfo = userService.getOne(new QueryWrapper<User>().eq("sub_token", token));
        return userInfo == null ? R.err("鉴权失败") : userInfo;
    }

    /** 旧的账号密码方式：没有验证码，和登录共用尝试次数限制，否则可以绕过验证码猜密码 */
    private Object authenticateByPassword(String user, String pwd) {
        if (user == null || user.isEmpty()) {
            return R.err("用户不能为空");
        }
        if (pwd == null || pwd.isEmpty()) {
            return R.err("密码不能为空");
        }

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
        return userInfo;
    }

    private static long orZero(Number value) {
        return value == null ? 0L : value.longValue();
    }



}
