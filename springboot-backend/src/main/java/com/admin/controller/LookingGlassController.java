package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.dto.LookingGlassRequestDto;
import com.admin.common.lang.R;
import com.admin.common.utils.JwtUtil;
import com.admin.service.LookingGlassService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * <p>
 * Looking Glass 网络诊断前端控制器：仅需登录，站点开关与节点可见性校验均在服务层完成
 * </p>
 *
 * @author QAQ
 * @since 2026-09-27
 */
@RestController
@RequestMapping("/api/v1/looking-glass")
@CrossOrigin
public class LookingGlassController extends BaseController {

    @Autowired
    private LookingGlassService lookingGlassService;

    @LogAnnotation
    @PostMapping("/run")
    public R run(@Validated @RequestBody LookingGlassRequestDto dto) {
        Integer userId = JwtUtil.getUserIdFromToken();
        Integer roleId = JwtUtil.getRoleIdFromToken();
        return lookingGlassService.run(userId, roleId, dto);
    }
}
