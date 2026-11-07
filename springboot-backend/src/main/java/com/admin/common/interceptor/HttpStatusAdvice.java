package com.admin.common.interceptor;

import com.admin.common.lang.R;
import org.springframework.core.MethodParameter;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

/**
 * 统一让 HTTP 状态码反映 R 里的错误码，响应体保持不变（前端仍然读 code / msg）。
 * 0 → 200；400、401、403、429、500 等 HTTP 状态码原样使用；-1（业务错误）→ 400；-2（未捕获异常）→ 500。
 * Telegram 的回调不改：它收到非 2xx 会反复重试
 */
@ControllerAdvice
@Order(HttpStatusAdvice.ORDER)
public class HttpStatusAdvice implements ResponseBodyAdvice<Object> {

    /** 要排在 DemoMaskAdvice 后面，它打码失败时会换成新的错误响应 */
    public static final int ORDER = 100;

    private static final String TELEGRAM_WEBHOOK_PREFIX = "/api/v1/telegram/webhook";

    static int httpStatusOf(int code) {
        if (code == 0) {
            return HttpStatus.OK.value();
        }
        if (code == -2) {
            return HttpStatus.INTERNAL_SERVER_ERROR.value();
        }
        if (code >= 400 && code <= 599 && HttpStatus.resolve(code) != null) {
            return code;
        }
        return HttpStatus.BAD_REQUEST.value();
    }

    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        return true;
    }

    @Override
    public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType selectedContentType,
                                  Class<? extends HttpMessageConverter<?>> selectedConverterType,
                                  ServerHttpRequest request, ServerHttpResponse response) {
        if (!(body instanceof R)) {
            return body;
        }
        if (request instanceof ServletServerHttpRequest
                && ((ServletServerHttpRequest) request).getServletRequest().getRequestURI().startsWith(TELEGRAM_WEBHOOK_PREFIX)) {
            return body;
        }
        int status = httpStatusOf(((R) body).getCode());
        if (status != HttpStatus.OK.value()) {
            response.setStatusCode(HttpStatus.resolve(status));
        }
        return body;
    }
}
