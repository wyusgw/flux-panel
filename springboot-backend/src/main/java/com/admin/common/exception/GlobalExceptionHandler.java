package com.admin.common.exception;

import com.admin.common.lang.R;
import lombok.extern.slf4j.Slf4j;
import org.apache.catalina.connector.ClientAbortException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindingResult;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.validation.ObjectError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    //

    // 实体校验异常捕获
    //@ResponseStatus(HttpStatus.BAD_REQUEST)
    @ExceptionHandler(value = MethodArgumentNotValidException.class)
    public R MethodArgumentNotValidException(MethodArgumentNotValidException e) {
        BindingResult result = e.getBindingResult();
        ObjectError objectError = result.getAllErrors().stream().findFirst().get();
        log.info("实体校验异常：----------------{}", objectError.getDefaultMessage());
        return R.err(400, objectError.getDefaultMessage());
    }

    // 未授权异常捕获
    @ExceptionHandler(value = UnauthorizedException.class)
    public R handleUnauthorizedException(UnauthorizedException e) {
        log.info("未授权异常：----------------{}", e.getMessage());
        return R.err(e.getCode(), e.getMessage());
    }

    @ExceptionHandler(value = ReadOnlyException.class)
    public R handleReadOnlyException(ReadOnlyException e) {
        return R.err(403, e.getMessage());
    }

    // 请求方式不对（例如 GET 访问只支持 POST 的接口）：405，并带上 Allow 头
    @ExceptionHandler(value = HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<R> handleMethodNotSupported(HttpRequestMethodNotSupportedException e) {
        log.info("请求方式不支持：----------------{}", e.getMessage());
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(405);
        if (e.getSupportedHttpMethods() != null) {
            HttpHeaders headers = new HttpHeaders();
            headers.setAllow(e.getSupportedHttpMethods());
            builder.headers(headers);
        }
        return builder.body(R.err(405, e.getMessage()));
    }

    @ExceptionHandler(value = HttpMediaTypeNotSupportedException.class)
    public R handleMediaTypeNotSupported(HttpMediaTypeNotSupportedException e) {
        return R.err(415, e.getMessage());
    }

    // 请求体不是合法 JSON、缺少参数、参数类型不对：都是调用方的问题，400
    @ExceptionHandler(value = {HttpMessageNotReadableException.class, MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class})
    public R handleBadRequest(Exception e) {
        log.info("请求参数错误：----------------{}", e.getMessage());
        return R.err(400, e.getMessage());
    }

    @ExceptionHandler(value = Exception.class)
    public R Exception(Exception e){
        log.info("异常：----------------{}", e.getMessage());
        return R.err(-2, e.getMessage());
    }

}