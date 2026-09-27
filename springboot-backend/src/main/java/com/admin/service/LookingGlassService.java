package com.admin.service;

import com.admin.common.dto.LookingGlassRequestDto;
import com.admin.common.lang.R;

/**
 * <p>
 * Looking Glass 网络诊断服务：从指定节点发起 TCP ping 或 traceroute
 * </p>
 *
 * @author QAQ
 * @since 2026-09-27
 */
public interface LookingGlassService {

    R run(Integer userId, Integer roleId, LookingGlassRequestDto dto);
}
