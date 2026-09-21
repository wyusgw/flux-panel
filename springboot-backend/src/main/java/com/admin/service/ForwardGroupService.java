package com.admin.service;

import com.admin.common.dto.ForwardGroupDto;
import com.admin.common.dto.ForwardGroupUpdateDto;
import com.admin.common.lang.R;
import com.admin.entity.ForwardGroup;
import com.baomidou.mybatisplus.extension.service.IService;

public interface ForwardGroupService extends IService<ForwardGroup> {

    R createForwardGroup(ForwardGroupDto forwardGroupDto);

    R getAllForwardGroups();

    R updateForwardGroup(ForwardGroupUpdateDto forwardGroupUpdateDto);

    R deleteForwardGroup(Long id);
}
