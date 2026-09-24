package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.annotation.RequireRole;
import com.admin.common.dto.InviteCodeBatchDto;
import com.admin.common.lang.R;
import com.admin.service.InviteCodeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * <p>
 * 邀请码（注册码）前端控制器
 * </p>
 *
 * @author QAQ
 * @since 2026-09-24
 */
@RestController
@RequestMapping("/api/v1/invite-code")
@CrossOrigin
public class InviteCodeController extends BaseController {

    @Autowired
    private InviteCodeService inviteCodeService;

    @LogAnnotation
    @RequireRole
    @PostMapping("/batch-create")
    public R batchCreate(@Validated @RequestBody InviteCodeBatchDto dto) {
        return inviteCodeService.batchCreate(dto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/list")
    public R list() {
        return inviteCodeService.getAllInviteCodes();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/delete")
    public R delete(@RequestBody Map<String, Object> params) {
        Long id = Long.valueOf(params.get("id").toString());
        return inviteCodeService.deleteInviteCode(id);
    }
}
