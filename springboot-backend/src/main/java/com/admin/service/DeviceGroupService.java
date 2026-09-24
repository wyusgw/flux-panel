package com.admin.service;

import com.admin.common.dto.DeviceGroupDto;
import com.admin.common.dto.DeviceGroupUpdateDto;
import com.admin.common.lang.R;
import com.admin.entity.DeviceGroup;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.List;
import java.util.Map;

public interface DeviceGroupService extends IService<DeviceGroup> {

    R createDeviceGroup(DeviceGroupDto deviceGroupDto);

    /**
     * 获取设备组列表：管理员查看全部；普通用户仅查看对自己可见（未绑定用户组或与自身用户组一致）的设备组
     */
    R getAllDeviceGroups();

    R updateDeviceGroup(DeviceGroupUpdateDto deviceGroupUpdateDto);

    R deleteDeviceGroup(Long id);

    /**
     * 批量删除设备组（同单个删除一样，会尝试一并清理不再被引用的节点）
     * @param ids 设备组ID列表
     */
    R batchDeleteDeviceGroup(List<Long> ids);

    /**
     * 更新设备组排序
     * @param groups 排序数据，每项包含 id 与 sort
     */
    R reorderDeviceGroups(List<Map<String, Object>> groups);

    /**
     * 批量保存设备组的离线通知覆盖设置（推送通知页「设备组覆盖设置」表格的保存按钮）。
     * 每项包含 id、offlineGraceEnabled、offlineGraceSeconds、offlineRetainEnabled、offlineRetainSeconds，
     * 只更新这 4 个字段，不影响设备组的其余配置。
     */
    R updateOfflineConfig(List<Map<String, Object>> groups);
}
