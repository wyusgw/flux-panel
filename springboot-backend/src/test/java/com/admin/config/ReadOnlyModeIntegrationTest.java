package com.admin.config;

import com.admin.common.exception.GlobalExceptionHandler;
import com.admin.common.interceptor.DemoMaskAdvice;
import com.admin.common.lang.R;
import com.admin.common.utils.JwtUtil;
import com.admin.entity.Node;
import com.admin.entity.User;
import com.admin.mapper.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockServletContext;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;

import java.util.Collections;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 真实走一遍配置注册、JWT 拦截、演示拦截、异常处理和响应打码，只有控制器和数据库是替身
 */
class ReadOnlyModeIntegrationTest {

    private final UserMapper userMapper = mock(UserMapper.class);
    private MockMvc mvc;

    @RestController
    static class StubController {
        @PostMapping("/api/v1/config/update")
        public R update() {
            return R.ok();
        }

        @PostMapping("/api/v1/node/list")
        public R nodes() {
            Node node = new Node();
            node.setId(3L);
            node.setName("HK-1");
            node.setSecret("NODE-SECRET");
            node.setServerIp("203.0.113.9");
            return R.ok(Collections.singletonList(node));
        }

        @PostMapping("/api/v1/user/package")
        public R ownProfile() {
            java.util.Map<String, Object> userInfo = new java.util.HashMap<>();
            userInfo.put("id", 7);
            userInfo.put("user", "demo");
            userInfo.put("walletBalance", 66);
            java.util.Map<String, Object> forward = new java.util.HashMap<>();
            forward.put("remoteAddr", "203.0.113.9:443");
            java.util.Map<String, Object> data = new java.util.HashMap<>();
            data.put("userInfo", userInfo);
            data.put("forwards", Collections.singletonList(forward));
            return R.ok(data);
        }

        @PostMapping("/api/v1/user/list")
        public R otherUsers() {
            User other = new User();
            other.setId(9L);
            other.setUser("alice");
            User self = new User();
            self.setId(7L);
            self.setUser("name");
            return R.ok(java.util.Arrays.asList(other, self));
        }

        @PostMapping("/api/v1/user/login")
        public R login() {
            return R.ok();
        }
    }

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(JwtUtil.class, "SECRET_KEY", "test-secret");
        AnnotationConfigWebApplicationContext context = new AnnotationConfigWebApplicationContext();
        context.setServletContext(new MockServletContext());
        context.addBeanFactoryPostProcessor(factory -> {
            factory.registerSingleton("userMapper", userMapper);
            factory.registerSingleton("demoChangeService", mock(com.admin.service.DemoChangeService.class));
            factory.registerSingleton("jdbcTemplate", mock(org.springframework.jdbc.core.JdbcTemplate.class));
        });
        context.register(WebMvcConfig.class, GlobalExceptionHandler.class, DemoMaskAdvice.class, com.admin.common.interceptor.DemoWriteGuard.class, StubController.class);
        context.refresh();
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
    }

    private String login(int roleId, int demoMode) {
        User user = new User();
        user.setId(7L);
        user.setUser("name");
        user.setRoleId(roleId);
        user.setDemoMode(demoMode);
        user.setStatus(1);
        when(userMapper.selectById(any())).thenReturn(user);
        return JwtUtil.generateToken(user);
    }

    @Test
    void demoAdminSeesMaskedData() throws Exception {
        mvc.perform(post("/api/v1/node/list").header("Authorization", login(0, 1)))
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data[0].name").value("HK-1"))
                .andExpect(jsonPath("$.data[0].secret").value("***"))
                .andExpect(jsonPath("$.data[0].serverIp").value("***"));
    }

    @Test
    void demoAdminSeesOwnProfileButEverythingElseStaysMasked() throws Exception {
        String token = login(0, 1);
        mvc.perform(post("/api/v1/user/package").header("Authorization", token))
                .andExpect(jsonPath("$.data.userInfo.user").value("demo"))
                .andExpect(jsonPath("$.data.userInfo.walletBalance").value(66))
                .andExpect(jsonPath("$.data.forwards[0].remoteAddr").value("***"));
        mvc.perform(post("/api/v1/user/list").header("Authorization", token))
                .andExpect(jsonPath("$.data[0].user").value("用户9"))
                .andExpect(jsonPath("$.data[1].user").value("name"));
    }

    @Test
    void demoAdminWriteIsRejectedWithCode403() throws Exception {
        mvc.perform(post("/api/v1/config/update").header("Authorization", login(0, 1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(403))
                .andExpect(jsonPath("$.msg").value("禁止编辑"));
    }

    @Test
    void realAdminSeesEverythingAndCanWrite() throws Exception {
        String token = login(0, 0);
        mvc.perform(post("/api/v1/node/list").header("Authorization", token))
                .andExpect(jsonPath("$.data[0].secret").value("NODE-SECRET"))
                .andExpect(jsonPath("$.data[0].serverIp").value("203.0.113.9"));
        mvc.perform(post("/api/v1/config/update").header("Authorization", token))
                .andExpect(jsonPath("$.code").value(0));
    }

    @Test
    void turnedOffDemoTokenGetsLoggedOutWithRecognizedMessage() throws Exception {
        String token = login(0, 1);
        login(1, 0);
        mvc.perform(post("/api/v1/node/list").header("Authorization", token))
                .andExpect(jsonPath("$.code").value(401))
                .andExpect(jsonPath("$.msg").value("无效的token或token已过期"));
    }

    @Test
    void loginStaysOpen() throws Exception {
        mvc.perform(post("/api/v1/user/login")).andExpect(jsonPath("$.code").value(0));
    }

    @Test
    void anonymousCannotReachProtectedEndpoints() throws Exception {
        mvc.perform(post("/api/v1/node/list")).andExpect(jsonPath("$.code").value(401));
    }
}
