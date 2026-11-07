package com.admin.mapper;

import com.admin.entity.NodeGroup;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Insert;

/**
 * <p>
 *  节点组 Mapper 接口
 * </p>
 *
 * @author QAQ
 * @since 2026-09-27
 */
public interface NodeGroupMapper extends BaseMapper<NodeGroup> {

    /** 主键是自增的，insert 会忽略传入的 id；需要指定 ID 时用这个 */
    @Insert("INSERT INTO node_group (id, name, sort, created_time, updated_time, status) "
            + "VALUES (#{id}, #{name}, #{sort}, #{createdTime}, #{updatedTime}, #{status})")
    int insertWithId(NodeGroup group);
}
