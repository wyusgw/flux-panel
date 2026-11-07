package com.admin.common.exception;

/**
 * 未授权异常类，默认对应 401；没带 Token 时用 403 + "Not logged in"
 */
public class UnauthorizedException extends RuntimeException {

    private final int code;

    public UnauthorizedException(String message) {
        this(401, message);
    }

    public UnauthorizedException(int code, String message) {
        super(message);
        this.code = code;
    }

    public UnauthorizedException(String message, Throwable cause) {
        super(message, cause);
        this.code = 401;
    }

    public int getCode() {
        return code;
    }
}
