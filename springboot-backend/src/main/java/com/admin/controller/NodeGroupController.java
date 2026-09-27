package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.annotation.RequireRole;
import com.admin.common.dto.NodeGroupDto;
import com.admin.common.dto.NodeGroupUpdateDto;
import com.admin.common.lang.R;
import com.admin.service.NodeGroupService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * <p>
 * 节点组前端控制器
 * </p>
 *
 * @author QAQ
 * @since 2026-09-27
 */
@RestController
@RequestMapping("/api/v1/node-group")
@CrossOrigin
public class NodeGroupController extends BaseController {

    @Autowired
    private NodeGroupService nodeGroupService;

    @LogAnnotation
    @RequireRole
    @PostMapping("/create")
    public R create(@Validated @RequestBody NodeGroupDto nodeGroupDto) {
        return nodeGroupService.createNodeGroup(nodeGroupDto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/list")
    public R list() {
        return nodeGroupService.getAllNodeGroups();
    }

    /**
     * 仅返回 id+名称，不含节点数等管理统计信息，供普通用户在节点状态等页面展示节点组名称
     */
    @LogAnnotation
    @PostMapping("/names")
    public R names() {
        return nodeGroupService.listNames();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/update")
    public R update(@Validated @RequestBody NodeGroupUpdateDto nodeGroupUpdateDto) {
        return nodeGroupService.updateNodeGroup(nodeGroupUpdateDto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/delete")
    public R delete(@RequestBody Map<String, Object> params) {
        Long id = Long.valueOf(params.get("id").toString());
        return nodeGroupService.deleteNodeGroup(id);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/batch-delete")
    public R batchDelete(@RequestBody Map<String, Object> params) {
        @SuppressWarnings("unchecked")
        List<Object> rawIds = (List<Object>) params.get("ids");
        List<Long> ids = rawIds == null ? null : rawIds.stream().map(id -> Long.valueOf(id.toString())).collect(java.util.stream.Collectors.toList());
        return nodeGroupService.batchDeleteNodeGroup(ids);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/reorder")
    public R reorder(@RequestBody Map<String, Object> params) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> groups = (List<Map<String, Object>>) params.get("groups");
        return nodeGroupService.reorderNodeGroups(groups);
    }
}
