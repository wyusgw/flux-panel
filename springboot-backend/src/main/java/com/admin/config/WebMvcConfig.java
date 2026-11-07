package com.admin.config;

import com.admin.common.interceptor.JwtInterceptor;
import com.admin.common.interceptor.LoginRequiredFilter;
import com.admin.common.interceptor.ReadOnlyInterceptor;
import com.admin.mapper.UserMapper;
import com.admin.service.DemoChangeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.core.Ordered;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;


@Configuration
@EnableWebMvc
public class WebMvcConfig implements WebMvcConfigurer {

    @Autowired
    @Lazy
    private UserMapper userMapper;

    @Autowired
    @Lazy
    private DemoChangeService demoChangeService;

    private CorsConfiguration buildConfig() {
        CorsConfiguration corsConfiguration = new CorsConfiguration();
        corsConfiguration.addAllowedOrigin("*");
        corsConfiguration.addAllowedHeader("*");
        corsConfiguration.addAllowedMethod("*");
        corsConfiguration.addExposedHeader("Authorization");
        return corsConfiguration;
    }

    @Bean
    public FilterRegistrationBean<CorsFilter> corsFilter() {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", buildConfig());
        FilterRegistrationBean<CorsFilter> registration = new FilterRegistrationBean<>(new CorsFilter(source));
        // 跨域头要在最前面加上，未登录的 403 响应浏览器才读得到
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return registration;
    }

    /** 没带 Token 访问需要登录的接口：GET / POST 都返回 403 Not logged in */
    @Bean
    public FilterRegistrationBean<LoginRequiredFilter> loginRequiredFilter() {
        FilterRegistrationBean<LoginRequiredFilter> registration = new FilterRegistrationBean<>(new LoginRequiredFilter());
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 1);
        return registration;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOrigins("*")
                .allowedMethods("GET", "POST", "DELETE", "PUT")
                .maxAge(3600);
    }

    /**
     * JWT拦截器
     */
    @Bean
    public JwtInterceptor jwtInterceptor() {
        return new JwtInterceptor();
    }

    /**
     * 添加JWT拦截器
     */
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 添加JWT拦截器，不拦截登录接口
        registry.addInterceptor(jwtInterceptor())
                .addPathPatterns("/api/**")
                .excludePathPatterns("/flow/**")
                .excludePathPatterns(LoginRequiredFilter.PUBLIC_PATHS);

        // 演示管理员：排在 JWT 校验之后，未登录的请求仍然先得到 401。
        // 登录和验证码要能用；支付回调、Telegram webhook、订阅接口是外部系统调用，不受限制
        registry.addInterceptor(new ReadOnlyInterceptor(userMapper, demoChangeService))
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/v1/openApi/**")
                .excludePathPatterns("/api/v1/user/login")
                .excludePathPatterns("/api/v1/captcha/**")
                .excludePathPatterns("/api/v1/recharge/notify/**")
                .excludePathPatterns("/api/v1/telegram/webhook/**");
    }
}
