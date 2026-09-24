package com.admin.service;

import com.admin.common.dto.InviteCodeBatchDto;
import com.admin.common.lang.R;
import com.admin.entity.InviteCode;
import com.baomidou.mybatisplus.extension.service.IService;

public interface InviteCodeService extends IService<InviteCode> {

    /**
     * 批量创建邀请码
     * @param dto 批量创建参数
     * @return 结果
     */
    R batchCreate(InviteCodeBatchDto dto);

    /**
     * 获取邀请码列表
     * @return 结果
     */
    R getAllInviteCodes();

    /**
     * 删除邀请码
     * @param id 邀请码ID
     * @return 结果
     */
    R deleteInviteCode(Long id);

    /**
     * 校验邀请码是否可用（存在且剩余次数大于0）
     * @param code 邀请码
     * @return 可用返回对应实体，否则返回 null
     */
    InviteCode validateInviteCode(String code);

    /**
     * 原子扣减邀请码剩余次数（注册成功后调用）
     * @param id 邀请码ID
     * @return 是否扣减成功
     */
    boolean consumeInviteCode(Long id);
}
