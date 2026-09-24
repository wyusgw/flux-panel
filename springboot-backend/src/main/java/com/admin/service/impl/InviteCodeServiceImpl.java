package com.admin.service.impl;

import com.admin.common.dto.InviteCodeBatchDto;
import com.admin.common.lang.R;
import com.admin.entity.InviteCode;
import com.admin.mapper.InviteCodeMapper;
import com.admin.service.InviteCodeService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class InviteCodeServiceImpl extends ServiceImpl<InviteCodeMapper, InviteCode> implements InviteCodeService {

    private static final String ERROR_NOT_FOUND = "邀请码不存在";
    private static final String ERROR_CREATE_FAILED = "邀请码创建失败";

    @Override
    public R batchCreate(InviteCodeBatchDto dto) {
        Set<String> uniqueCodes = new HashSet<>();
        for (String raw : dto.getCodes()) {
            String code = raw.trim();
            if (StringUtils.isNotBlank(code)) {
                uniqueCodes.add(code);
            }
        }
        if (uniqueCodes.isEmpty()) {
            return R.err("邀请代码不能为空");
        }

        long existCount = this.count(new QueryWrapper<InviteCode>().in("code", uniqueCodes));
        if (existCount > 0) {
            return R.err("存在重复的邀请代码，请检查后重试");
        }

        long currentTime = System.currentTimeMillis();
        List<InviteCode> toCreate = new ArrayList<>();
        for (String code : uniqueCodes) {
            InviteCode inviteCode = new InviteCode();
            inviteCode.setCode(code);
            inviteCode.setUsesRemaining(dto.getUsesRemaining());
            inviteCode.setCreatedTime(currentTime);
            inviteCode.setUpdatedTime(currentTime);
            inviteCode.setStatus(1);
            toCreate.add(inviteCode);
        }

        boolean result = this.saveBatch(toCreate);
        return result ? R.ok() : R.err(ERROR_CREATE_FAILED);
    }

    @Override
    public R getAllInviteCodes() {
        List<InviteCode> codes = this.list(new QueryWrapper<InviteCode>().orderByDesc("created_time"));
        return R.ok(codes);
    }

    @Override
    public R deleteInviteCode(Long id) {
        InviteCode inviteCode = this.getById(id);
        if (inviteCode == null) {
            return R.err(ERROR_NOT_FOUND);
        }
        boolean result = this.removeById(id);
        return result ? R.ok("删除成功") : R.err("删除失败");
    }

    @Override
    public InviteCode validateInviteCode(String code) {
        if (StringUtils.isBlank(code)) {
            return null;
        }
        InviteCode inviteCode = this.getOne(new QueryWrapper<InviteCode>().eq("code", code.trim()));
        if (inviteCode == null) {
            return null;
        }
        if (inviteCode.getUsesRemaining() == null || inviteCode.getUsesRemaining() <= 0) {
            return null;
        }
        return inviteCode;
    }

    @Override
    public boolean consumeInviteCode(Long id) {
        // 原子扣减剩余次数，避免并发重复使用
        return this.update(new UpdateWrapper<InviteCode>()
                .eq("id", id)
                .gt("uses_remaining", 0)
                .setSql("uses_remaining = uses_remaining - 1"));
    }
}
