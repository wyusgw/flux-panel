package com.admin.common.exception;

/**
 * 演示管理员发起修改类请求时抛出，由全局异常处理器转成 code=403 的响应
 */
public class ReadOnlyException extends RuntimeException {

    public ReadOnlyException(String message) {
        super(message);
    }
}
