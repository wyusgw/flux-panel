package com.admin.service;

import com.admin.common.dto.UserGroupDto;
import com.admin.common.dto.UserGroupUpdateDto;
import com.admin.common.lang.R;
import com.admin.entity.UserGroup;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.List;
import java.util.Map;

/**
 * <p>
 *  用户组服务类
 * </p>
 *
 * @author QAQ
 * @since 2026-09-21
 */
public interface UserGroupService extends IService<UserGroup> {

    R createUserGroup(UserGroupDto userGroupDto);

    R getAllUserGroups();

    /**
     * 获取用户组的 id+名称列表（不含用户数等管理统计信息），供普通用户在节点状态等页面展示用户组名称
     */
    R listNames();

    R updateUserGroup(UserGroupUpdateDto userGroupUpdateDto);

    R deleteUserGroup(Long id);

    /**
     * 批量删除用户组
     * @param ids 用户组ID列表
     */
    R batchDeleteUserGroup(List<Long> ids);

    /**
     * 更新用户组排序
     * @param groups 排序数据，每项包含 id 与 sort
     */
    R reorderUserGroups(List<Map<String, Object>> groups);
}
