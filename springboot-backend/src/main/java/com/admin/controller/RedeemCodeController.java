package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.annotation.RequireRole;
import com.admin.common.dto.RedeemCodeBatchDto;
import com.admin.common.lang.R;
import com.admin.service.RedeemCodeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * <p>
 * 兑换码前端控制器
 * </p>
 *
 * @author QAQ
 * @since 2026-09-21
 */
@RestController
@RequestMapping("/api/v1/redeem-code")
@CrossOrigin
public class RedeemCodeController extends BaseController {

    @Autowired
    private RedeemCodeService redeemCodeService;

    @LogAnnotation
    @RequireRole
    @PostMapping("/batch-create")
    public R batchCreate(@Validated @RequestBody RedeemCodeBatchDto dto) {
        return redeemCodeService.batchCreate(dto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/list")
    public R list() {
        return redeemCodeService.getAllRedeemCodes();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/delete")
    public R delete(@RequestBody Map<String, Object> params) {
        Long id = Long.valueOf(params.get("id").toString());
        return redeemCodeService.deleteRedeemCode(id);
    }
}
