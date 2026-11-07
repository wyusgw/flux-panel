package com.admin.common.interceptor;

import com.admin.common.exception.GlobalExceptionHandler;
import com.admin.common.lang.R;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockServletContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 接口出错时 HTTP 状态码要跟 R 里的 code 一致，响应体不变
 */
class HttpStatusAdviceTest {

    @RestController
    static class StubController {
        @PostMapping("/api/v1/stub/ok")
        public R ok() {
            return R.ok();
        }

        @PostMapping("/api/v1/stub/business")
        public R business() {
            return R.err("余额不足");
        }

        @PostMapping("/api/v1/stub/forbidden")
        public R forbidden() {
            return R.err(403, "权限不足");
        }

        @PostMapping("/api/v1/stub/boom")
        public R boom() {
            throw new IllegalStateException("boom");
        }

        @GetMapping("/api/v1/stub/get")
        public R getError() {
            return R.err("鉴权失败");
        }

        @PostMapping("/api/v1/telegram/webhook/abc")
        public R telegram() {
            return R.err("忽略");
        }

        @PostMapping("/api/v1/stub/body")
        public R body(@org.springframework.web.bind.annotation.RequestBody java.util.Map<String, Object> body) {
            return R.ok();
        }

        @PostMapping("/api/v1/stub/plain")
        public String plain() {
            return "fail";
        }
    }

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        AnnotationConfigWebApplicationContext context = new AnnotationConfigWebApplicationContext();
        context.setServletContext(new MockServletContext());
        context.register(Config.class, GlobalExceptionHandler.class, HttpStatusAdvice.class, StubController.class);
        context.refresh();
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
    }

    @EnableWebMvc
    @org.springframework.context.annotation.Configuration
    static class Config {
    }

    @Test
    void successStaysOk() throws Exception {
        mvc.perform(post("/api/v1/stub/ok")).andExpect(status().isOk()).andExpect(jsonPath("$.code").value(0));
    }

    @Test
    void businessErrorBecomes400AndBodyKeepsCode() throws Exception {
        mvc.perform(post("/api/v1/stub/business"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(-1))
                .andExpect(jsonPath("$.msg").value("余额不足"));
    }

    @Test
    void explicitHttpCodeIsUsed() throws Exception {
        mvc.perform(post("/api/v1/stub/forbidden")).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value(403));
    }

    @Test
    void uncaughtExceptionBecomes500() throws Exception {
        mvc.perform(post("/api/v1/stub/boom")).andExpect(status().isInternalServerError()).andExpect(jsonPath("$.code").value(-2));
    }

    @Test
    void getErrorsAreCoveredToo() throws Exception {
        mvc.perform(get("/api/v1/stub/get")).andExpect(status().isBadRequest());
    }

    @Test
    void wrongMethodBecomes405WithAllowHeader() throws Exception {
        mvc.perform(get("/api/v1/stub/ok"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Allow", "POST"))
                .andExpect(jsonPath("$.code").value(405));
    }

    @Test
    void malformedJsonBecomes400() throws Exception {
        mvc.perform(post("/api/v1/stub/body").contentType("application/json").content("{bad"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400));
    }

    @Test
    void telegramWebhookAlwaysAnswers200() throws Exception {
        mvc.perform(post("/api/v1/telegram/webhook/abc")).andExpect(status().isOk());
    }

    @Test
    void plainTextResponsesAreUntouched() throws Exception {
        mvc.perform(post("/api/v1/stub/plain")).andExpect(status().isOk());
    }

    @Test
    void codeMapping() {
        assertEquals(200, HttpStatusAdvice.httpStatusOf(0));
        assertEquals(400, HttpStatusAdvice.httpStatusOf(-1));
        assertEquals(500, HttpStatusAdvice.httpStatusOf(-2));
        assertEquals(401, HttpStatusAdvice.httpStatusOf(401));
        assertEquals(429, HttpStatusAdvice.httpStatusOf(429));
        assertEquals(400, HttpStatusAdvice.httpStatusOf(12345));
        assertEquals(400, HttpStatusAdvice.httpStatusOf(1));
    }
}
