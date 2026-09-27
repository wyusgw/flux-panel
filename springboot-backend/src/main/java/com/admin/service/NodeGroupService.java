package com.admin.service;

import com.admin.common.dto.NodeGroupDto;
import com.admin.common.dto.NodeGroupUpdateDto;
import com.admin.common.lang.R;
import com.admin.entity.NodeGroup;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.List;
import java.util.Map;

/**
 * <p>
 *  节点组服务类
 * </p>
 *
 * @author QAQ
 * @since 2026-09-27
 */
public interface NodeGroupService extends IService<NodeGroup> {

    R createNodeGroup(NodeGroupDto nodeGroupDto);

    R getAllNodeGroups();

    /**
     * 获取节点组的 id+名称列表，供节点归属、套餐等下拉框使用
     */
    R listNames();

    R updateNodeGroup(NodeGroupUpdateDto nodeGroupUpdateDto);

    R deleteNodeGroup(Long id);

    /**
     * 批量删除节点组
     * @param ids 节点组ID列表
     */
    R batchDeleteNodeGroup(List<Long> ids);

    /**
     * 更新节点组排序
     * @param groups 排序数据，每项包含 id 与 sort
     */
    R reorderNodeGroups(List<Map<String, Object>> groups);
}
