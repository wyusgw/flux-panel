package com.admin.service.impl;

import com.admin.common.dto.NodeGroupDto;
import com.admin.common.dto.NodeGroupUpdateDto;
import com.admin.common.lang.R;
import com.admin.entity.NodeGroup;
import com.admin.entity.NodeGroupRelation;
import com.admin.mapper.NodeGroupMapper;
import com.admin.mapper.NodeGroupRelationMapper;
import com.admin.service.NodeGroupService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * <p>
 * 节点组服务实现类
 * </p>
 *
 * @author QAQ
 * @since 2026-09-27
 */
@Service
public class NodeGroupServiceImpl extends ServiceImpl<NodeGroupMapper, NodeGroup> implements NodeGroupService {

    private static final String ERROR_GROUP_NOT_FOUND = "节点组不存在";
    private static final String ERROR_CREATE_FAILED = "节点组创建失败";
    private static final String ERROR_UPDATE_FAILED = "节点组更新失败";
    private static final String SUCCESS_UPDATE_MSG = "节点组更新成功";
    private static final String SUCCESS_DELETE_MSG = "节点组删除成功";

    @Resource
    private NodeGroupRelationMapper nodeGroupRelationMapper;

    @Override
    public R createNodeGroup(NodeGroupDto nodeGroupDto) {
        NodeGroup nodeGroup = new NodeGroup();
        BeanUtils.copyProperties(nodeGroupDto, nodeGroup);

        long currentTime = System.currentTimeMillis();
        nodeGroup.setCreatedTime(currentTime);
        nodeGroup.setUpdatedTime(currentTime);
        nodeGroup.setStatus(1);
        if (nodeGroup.getSort() == null) {
            nodeGroup.setSort(0);
        }

        boolean result = this.save(nodeGroup);
        return result ? R.ok() : R.err(ERROR_CREATE_FAILED);
    }

    @Override
    public R getAllNodeGroups() {
        List<NodeGroup> groups = this.list();

        // 统计每个节点组下挂了多少个节点
        Map<Long, Long> nodeCountMap = new HashMap<>();
        for (NodeGroup group : groups) {
            long count = nodeGroupRelationMapper.selectCount(
                    new QueryWrapper<NodeGroupRelation>().eq("node_group_id", group.getId()));
            nodeCountMap.put(group.getId(), count);
        }

        List<Map<String, Object>> result = groups.stream().map(group -> {
            Map<String, Object> item = new HashMap<>();
            item.put("id", group.getId());
            item.put("name", group.getName());
            item.put("sort", group.getSort());
            item.put("nodeCount", nodeCountMap.getOrDefault(group.getId(), 0L));
            return item;
        }).collect(java.util.stream.Collectors.toList());

        return R.ok(result);
    }

    @Override
    public R listNames() {
        List<NodeGroup> groups = this.list();
        List<Map<String, Object>> result = groups.stream().map(group -> {
            Map<String, Object> item = new HashMap<>();
            item.put("id", group.getId());
            item.put("name", group.getName());
            return item;
        }).collect(java.util.stream.Collectors.toList());
        return R.ok(result);
    }

    @Override
    public R updateNodeGroup(NodeGroupUpdateDto nodeGroupUpdateDto) {
        NodeGroup nodeGroup = this.getById(nodeGroupUpdateDto.getId());
        if (nodeGroup == null) {
            return R.err(ERROR_GROUP_NOT_FOUND);
        }

        nodeGroup.setName(nodeGroupUpdateDto.getName());
        nodeGroup.setUpdatedTime(System.currentTimeMillis());

        boolean result = this.updateById(nodeGroup);
        return result ? R.ok(SUCCESS_UPDATE_MSG) : R.err(ERROR_UPDATE_FAILED);
    }

    @Override
    public R deleteNodeGroup(Long id) {
        NodeGroup nodeGroup = this.getById(id);
        if (nodeGroup == null) {
            return R.err(ERROR_GROUP_NOT_FOUND);
        }

        boolean result = this.removeById(id);
        if (result) {
            nodeGroupRelationMapper.delete(new QueryWrapper<NodeGroupRelation>().eq("node_group_id", id));
        }
        return result ? R.ok(SUCCESS_DELETE_MSG) : R.err("节点组删除失败");
    }

    @Override
    public R batchDeleteNodeGroup(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return R.err("请选择要删除的节点组");
        }

        boolean result = this.removeByIds(ids);
        if (result) {
            nodeGroupRelationMapper.delete(new QueryWrapper<NodeGroupRelation>().in("node_group_id", ids));
        }
        return result ? R.ok(SUCCESS_DELETE_MSG) : R.err("节点组删除失败");
    }

    @Override
    public R reorderNodeGroups(List<Map<String, Object>> groups) {
        if (groups == null || groups.isEmpty()) {
            return R.err("排序数据不能为空");
        }

        List<NodeGroup> toUpdate = new java.util.ArrayList<>();
        for (Map<String, Object> item : groups) {
            NodeGroup nodeGroup = new NodeGroup();
            nodeGroup.setId(Long.valueOf(item.get("id").toString()));
            nodeGroup.setSort(Integer.valueOf(item.get("sort").toString()));
            toUpdate.add(nodeGroup);
        }

        boolean result = this.updateBatchById(toUpdate);
        return result ? R.ok("排序更新成功") : R.err("排序更新失败");
    }
}
