package com.admin.service.impl;

/** 测试用：访问 UserServiceImpl 包内可见的 Token 生成方法 */
public final class UserServiceTokenAccess {
    private UserServiceTokenAccess() {
    }

    public static String newToken() {
        return UserServiceImpl.newSubscriptionToken();
    }
}
