package com.admin.common.interceptor;

import com.admin.common.lang.R;
import com.admin.common.utils.DemoDataMasker;
import com.admin.common.utils.JwtUtil;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

import javax.servlet.http.HttpServletRequest;

/**
 * 演示管理员的所有接口响应在这里统一打码。打码失败时返回错误，绝不回退到原始数据
 */
@Slf4j
@ControllerAdvice
public class DemoMaskAdvice implements ResponseBodyAdvice<Object> {

    private static final String OWN_PROFILE_PATH = "/api/v1/user/package";
    private static final String OWN_PROFILE_FIELD = "userInfo";
    private static final String USER_LIST_PATH = "/api/v1/user/list";

    private final ObjectMapper objectMapper = Jackson2ObjectMapperBuilder.json().build();

    /** 用户管理列表里账号自己那一行显示真实用户名，其他用户继续打码 */
    private static void restoreOwnNameInUserList(HttpServletRequest request, JsonNode original, JsonNode masked) {
        if (!USER_LIST_PATH.equals(request.getRequestURI()) || !original.isArray()) {
            return;
        }
        long ownId = JwtUtil.getUserIdFromToken(request.getHeader("Authorization"));
        for (int i = 0; i < original.size(); i++) {
            JsonNode row = original.get(i);
            if (row.path("id").asLong(-1) == ownId) {
                ((ObjectNode) masked.get(i)).set("user", row.get("user"));
            }
        }
    }

    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        return true;
    }

    @Override
    public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType selectedContentType,
                                  Class<? extends HttpMessageConverter<?>> selectedConverterType,
                                  ServerHttpRequest request, ServerHttpResponse response) {
        if (!(request instanceof ServletServerHttpRequest)
                || ((ServletServerHttpRequest) request).getServletRequest().getAttribute(ReadOnlyInterceptor.DEMO_ATTRIBUTE) == null) {
            return body;
        }
        if (!(body instanceof R)) {
            return R.err(403, "禁止访问");
        }
        R result = (R) body;
        if (result.getData() == null) {
            return result;
        }
        try {
            JsonNode original = objectMapper.valueToTree(result.getData());
            JsonNode masked = DemoDataMasker.mask(original);
            // 个人中心的 userInfo 是账号本人的资料（用户名、余额等），访客用这个账号登录，本来就知道，不用打码
            if (OWN_PROFILE_PATH.equals(((ServletServerHttpRequest) request).getServletRequest().getRequestURI())
                    && masked.isObject() && original.has(OWN_PROFILE_FIELD)) {
                ((ObjectNode) masked).set(OWN_PROFILE_FIELD, original.get(OWN_PROFILE_FIELD));
            }
            restoreOwnNameInUserList(((ServletServerHttpRequest) request).getServletRequest(), original, masked);
            result.setData(masked);
            return result;
        } catch (Exception e) {
            log.error("演示数据打码失败", e);
            return R.err(500, "数据暂不可用");
        }
    }
}
