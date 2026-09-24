package com.admin.service;

import com.admin.common.dto.SingleTunnelGroupDto;
import com.admin.common.dto.SingleTunnelGroupUpdateDto;
import com.admin.common.lang.R;
import com.admin.entity.SingleTunnelGroup;
import com.baomidou.mybatisplus.extension.service.IService;

/**
 * <p>
 * 单端组服务类：普通用户自己建立、用来给自己的单端隧道设备分组分类，每个用户只能操作自己建立的单端组
 * </p>
 *
 * @author QAQ
 * @since 2026-09-24
 */
public interface SingleTunnelGroupService extends IService<SingleTunnelGroup> {

    R createMyGroup(Integer userId, SingleTunnelGroupDto dto);

    /**
     * 获取当前用户自己名下的单端组列表（附带每组的设备数量）
     */
    R listMyGroups(Integer userId);

    R updateMyGroup(Integer userId, SingleTunnelGroupUpdateDto dto);

    R deleteMyGroup(Integer userId, Long id);

    /**
     * 校验某个单端组ID确实属于该用户，供设备组服务在保存单端隧道设备时校验所选分组的归属
     */
    boolean isOwnedByUser(Long groupId, Integer userId);
}
