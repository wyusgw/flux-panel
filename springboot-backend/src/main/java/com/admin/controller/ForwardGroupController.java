package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.dto.ForwardGroupDto;
import com.admin.common.dto.ForwardGroupUpdateDto;
import com.admin.common.lang.R;
import com.admin.service.ForwardGroupService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * <p>
 * 转发规则分组前端控制器
 * </p>
 *
 * @author QAQ
 * @since 2026-09-21
 */
@RestController
@RequestMapping("/api/v1/forward-group")
@CrossOrigin
public class ForwardGroupController extends BaseController {

    @Autowired
    private ForwardGroupService forwardGroupService;

    @LogAnnotation
    @PostMapping("/create")
    public R create(@Validated @RequestBody ForwardGroupDto forwardGroupDto) {
        return forwardGroupService.createForwardGroup(forwardGroupDto);
    }

    @LogAnnotation
    @PostMapping("/list")
    public R list() {
        return forwardGroupService.getAllForwardGroups();
    }

    @LogAnnotation
    @PostMapping("/update")
    public R update(@Validated @RequestBody ForwardGroupUpdateDto forwardGroupUpdateDto) {
        return forwardGroupService.updateForwardGroup(forwardGroupUpdateDto);
    }

    @LogAnnotation
    @PostMapping("/delete")
    public R delete(@RequestBody Map<String, Object> params) {
        Long id = Long.valueOf(params.get("id").toString());
        return forwardGroupService.deleteForwardGroup(id);
    }
}
