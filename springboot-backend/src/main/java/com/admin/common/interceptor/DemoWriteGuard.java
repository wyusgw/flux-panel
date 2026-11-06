package com.admin.common.interceptor;

import com.admin.common.exception.ReadOnlyException;
import com.admin.common.utils.DemoDataMasker;
import com.admin.common.utils.HttpContextUtils;
import com.alibaba.fastjson2.JSON;
import org.springframework.beans.BeanWrapper;
import org.springframework.beans.BeanWrapperImpl;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;

import javax.servlet.http.HttpServletRequest;
import java.beans.PropertyDescriptor;
import java.lang.reflect.Type;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 演示账号保存时的底线，勾选了哪个区域都一样：
 * 1. 打码写回：演示账号读到的 IP、地址、用户名等是打码的，保存时换回数据库里的真实值，换不了就拒绝。
 * 2. 提权：不能把账号设为管理员或改演示开关，不能碰管理员账号，不能改任何人的密码和余额，
 *    否则公开的演示账号可以接管整个面板或给自己发钱。
 */
@ControllerAdvice
public class DemoWriteGuard extends RequestBodyAdviceAdapter {

    private static final Pattern MASKED_USER_NAME = Pattern.compile("^用户(\\d+|\\*\\*\\*)$");
    private static final String USER_CREATE = "/api/v1/user/create";
    private static final String USER_UPDATE = "/api/v1/user/update";
    private static final String USER_DELETE = "/api/v1/user/delete";

    private final JdbcTemplate jdbc;

    public DemoWriteGuard(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public boolean supports(MethodParameter methodParameter, Type targetType, Class<? extends HttpMessageConverter<?>> converterType) {
        return true;
    }

    @Override
    public Object afterBodyRead(Object body, HttpInputMessage inputMessage, MethodParameter parameter, Type targetType,
                                Class<? extends HttpMessageConverter<?>> converterType) {
        HttpServletRequest request = HttpContextUtils.getHttpServletRequest();
        Object table = request.getAttribute(ReadOnlyInterceptor.DEMO_TABLE_ATTRIBUTE);
        if (table != null) {
            apply(request.getRequestURI(), (String) table, body);
        }
        return body;
    }

    void apply(String uri, String table, Object body) {
        if (USER_DELETE.equals(uri) && body instanceof Map) {
            rejectIfAdmin(((Map<?, ?>) body).get("id"));
        }
        if (!(body instanceof Map) && !(body instanceof List)) {
            BeanWrapper bean = new BeanWrapperImpl(body);
            if (USER_CREATE.equals(uri)) {
                bean.setPropertyValue("admin", Boolean.FALSE);
                bean.setPropertyValue("demoMode", 0);
                bean.setPropertyValue("walletBalance", BigDecimal.ZERO);
            }
            if (USER_UPDATE.equals(uri)) {
                rejectIfAdmin(bean.getPropertyValue("id"));
                bean.setPropertyValue("admin", null);
                bean.setPropertyValue("demoMode", null);
                bean.setPropertyValue("pwd", null);
            }
            restoreMaskedValues(bean, table, USER_UPDATE.equals(uri));
        }
        // 其余位置（嵌套对象、Map）还有打码内容就拒绝，宁可保存失败也不写坏真实数据
        if (JSON.toJSONString(body).contains(DemoDataMasker.MASK)) {
            throw new ReadOnlyException("内容包含隐藏信息，不能保存");
        }
    }

    private void rejectIfAdmin(Object userId) {
        if (userId == null) {
            throw new ReadOnlyException("禁止编辑");
        }
        List<Integer> roles = jdbc.queryForList("SELECT role_id FROM `user` WHERE id = ?", Integer.class, userId.toString());
        if (roles.isEmpty() || roles.get(0) == 0) {
            throw new ReadOnlyException("禁止编辑");
        }
    }

    private void restoreMaskedValues(BeanWrapper bean, String table, boolean keepWalletBalance) {
        Map<String, Object> row = null;
        if (bean.isReadableProperty("id") && bean.getPropertyValue("id") != null) {
            List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM `" + table + "` WHERE id = ?", bean.getPropertyValue("id").toString());
            row = rows.isEmpty() ? null : rows.get(0);
        }
        for (PropertyDescriptor property : bean.getPropertyDescriptors()) {
            String name = property.getName();
            if (!bean.isWritableProperty(name) || !bean.isReadableProperty(name)) {
                continue;
            }
            Object value = bean.getPropertyValue(name);
            boolean masked = value instanceof String
                    && (((String) value).contains(DemoDataMasker.MASK) || MASKED_USER_NAME.matcher((String) value).matches());
            boolean wallet = keepWalletBalance && "walletBalance".equals(name);
            if (!masked && !wallet) {
                continue;
            }
            String column = name.replaceAll("([A-Z])", "_$1").toLowerCase();
            if (row == null || !row.containsKey(column)) {
                throw new ReadOnlyException("内容包含隐藏信息，不能保存");
            }
            bean.setPropertyValue(name, row.get(column));
        }
    }
}
