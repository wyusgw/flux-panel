package com.admin.common.interceptor;

import com.admin.common.lang.R;
import com.alibaba.fastjson.JSON;
import org.springframework.http.HttpStatus;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.UrlPathHelper;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 没带 Token 访问需要登录的接口，统一返回 HTTP 403 + {"code":403,"msg":"Not logged in"}。
 * 放在过滤器里是因为拦截器之前 Spring 会先找处理方法：GET 访问只支持 POST 的接口、访问不存在的路径，
 * 拦截器根本轮不到执行，没带 Token 会得到 405 / 404 而不是未登录。过滤器在最前面，GET 和 POST 一致
 */
public class LoginRequiredFilter extends OncePerRequestFilter {

    public static final int NOT_LOGGED_IN_CODE = 403;
    public static final String NOT_LOGGED_IN_MSG = "Not logged in";

    /** 不需要登录的接口，和 JWT 拦截器的放行列表是同一份 */
    public static final String[] PUBLIC_PATHS = {
            "/api/v1/openApi/**",
            "/api/v1/config/get",
            "/api/v1/config/list",
            "/api/v1/user/login",
            "/api/v1/user/register",
            "/api/v1/captcha/**",
            "/api/v1/recharge/notify/**",
            "/api/v1/telegram/webhook/**"
    };

    private static final AntPathMatcher MATCHER = new AntPathMatcher();
    private static final UrlPathHelper PATH_HELPER = new UrlPathHelper();

    static boolean isPublic(String path) {
        for (String pattern : PUBLIC_PATHS) {
            if (MATCHER.match(pattern, path)) {
                return true;
            }
        }
        return false;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        // 去掉 ;参数、解码、合并重复的斜杠后再匹配，和 Spring 匹配路径的结果一致
        String path = PATH_HELPER.getPathWithinApplication(request).replaceAll("/{2,}", "/");
        if (path.length() > 1 && path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        boolean needLogin = path.startsWith("/api/") && !isPublic(path)
                // 预检请求不带 Token，放给后面的跨域处理
                && !"OPTIONS".equalsIgnoreCase(request.getMethod());
        if (needLogin && !StringUtils.hasText(request.getHeader("Authorization"))) {
            response.setStatus(HttpStatus.FORBIDDEN.value());
            response.setContentType("application/json;charset=UTF-8");
            response.getOutputStream().write(
                    JSON.toJSONString(R.err(NOT_LOGGED_IN_CODE, NOT_LOGGED_IN_MSG)).getBytes(StandardCharsets.UTF_8));
            return;
        }
        chain.doFilter(request, response);
    }
}
