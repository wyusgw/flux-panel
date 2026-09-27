package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * <p>
 * 设备组与用户组的多对多关联：一个设备组可以同时对多个用户组可见
 * </p>
 *
 * @author QAQ
 * @since 2026-09-27
 */
@Data
@TableName("device_group_user_group_relation")
public class DeviceGroupUserGroupRelation implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private Long deviceGroupId;

    private Long userGroupId;

    private Long createdTime;
}
