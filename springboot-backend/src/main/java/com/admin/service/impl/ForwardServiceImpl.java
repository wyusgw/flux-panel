package com.admin.service.impl;

import com.admin.common.dto.ForwardDto;
import com.admin.common.dto.ForwardUpdateDto;
import com.admin.common.dto.ForwardWithTunnelDto;
import com.admin.common.dto.GostDto;
import com.admin.common.lang.R;
import com.admin.common.utils.GostUtil;
import com.admin.common.utils.JwtUtil;
import com.admin.common.utils.TunnelResolver;
import com.admin.common.utils.WebSocketServer;
import com.admin.entity.*;
import com.admin.mapper.ForwardMapper;
import com.admin.service.*;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.alibaba.fastjson.JSONObject;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.stream.Collectors;

/**
 * <p>
 * 端口转发服务实现类
 * </p>
 *
 * @author QAQ
 * @since 2025-06-03
 */
@Slf4j
@Service
public class ForwardServiceImpl extends ServiceImpl<ForwardMapper, Forward> implements ForwardService {

    // 常量定义
    private static final String GOST_SUCCESS_MSG = "OK";
    private static final String GOST_NOT_FOUND_MSG = "not found";
    private static final int ADMIN_ROLE_ID = 0;
    private static final int TUNNEL_TYPE_PORT_FORWARD = 1;
    private static final int TUNNEL_TYPE_TUNNEL_FORWARD = 2;
    private static final int FORWARD_STATUS_ACTIVE = 1;
    private static final int FORWARD_STATUS_PAUSED = 0;
    private static final int FORWARD_STATUS_ERROR = -1;
    private static final int TUNNEL_STATUS_ACTIVE = 1;

    private static final long BYTES_TO_GB = 1024L * 1024L * 1024L;

    @Resource
    @Lazy
    private TunnelService tunnelService;

    @Resource
    UserTunnelService userTunnelService;

    @Resource
    UserService userService;

    @Resource
    NodeService nodeService;

    @Resource
    @Lazy
    private DeviceGroupService deviceGroupService;

    @Resource
    @Lazy
    private PackagePlanService packagePlanService;

    @Resource
    @Lazy
    private SpeedLimitService speedLimitService;

    @Resource
    @Lazy
    private TunnelResolver tunnelResolver;

    @Resource
    @Lazy
    private TaskQueueService taskQueueService;


    @Override
    public R createForward(ForwardDto forwardDto) {
        // 1. 获取当前用户信息
        UserInfo currentUser = getCurrentUserInfo();

        // 1.1 校验隧道选择方式：显式隧道 或 入口/出口设备组，二选一
        R modeCheck = validateDeviceGroupSelection(forwardDto.getTunnelId(), forwardDto.getInDeviceGroupId(),
                forwardDto.getOutDeviceGroupId(), currentUser);
        if (modeCheck.getCode() != 0) {
            return modeCheck;
        }

        // 2. 解析隧道（显式指定隧道时查真实记录；设备组模式在内存中拼出等效对象，不落库）
        Tunnel tunnel = tunnelResolver.resolveTunnel(forwardDto.getTunnelId(), forwardDto.getInDeviceGroupId(), forwardDto.getOutDeviceGroupId());
        if (tunnel == null) {
            return R.err("隧道不存在");
        }
        if (tunnel.getStatus() != TUNNEL_STATUS_ACTIVE) {
            return R.err("隧道已禁用，无法创建转发");
        }

        // 3. 普通用户权限和限制检查
        UserTunnel userTunnel = tunnelResolver.resolveUserTunnel(currentUser.getUserId(), forwardDto.getTunnelId(), forwardDto.getInDeviceGroupId());
        UserPermissionResult permissionResult = checkUserPermissions(currentUser, tunnel, userTunnel, null);
        if (permissionResult.isHasError()) {
            return R.err(permissionResult.getErrorMessage());
        }

        // 4. 分配端口
        PortAllocation portAllocation = allocatePorts(tunnel, forwardDto.getInPort());
        if (portAllocation.isHasError()) {
            return R.err(portAllocation.getErrorMessage());
        }

        // 5. 创建并保存Forward对象
        Forward forward = createForwardEntity(forwardDto, currentUser, portAllocation);
        if (!this.save(forward)) {
            return R.err("端口转发创建失败");
        }

        // 6. 获取所需的节点信息
        NodeInfo nodeInfo = getRequiredNodes(tunnel);
        if (nodeInfo.isHasError()) {
            this.removeById(forward.getId());
            return R.err(nodeInfo.getErrorMessage());
        }

        // 7. 调用Gost服务创建转发
        R gostResult = createGostServices(forward, tunnel, permissionResult.getLimiter(), nodeInfo, permissionResult.getUserTunnel());

        if (gostResult.getCode() != 0) {
            if (isNodeOfflineFailure(gostResult)) {
                // 节点当前离线：规则本身正常保存，只是暂时无法把配置推送到节点，不应因此阻止创建。
                // 登记进同步重试队列，节点重新上线后会自动补推，无需再手动编辑保存。
                log.warn("转发 {} 创建成功，但目标节点当前离线，配置暂未同步：{}", forward.getId(), gostResult.getMsg());
                enqueueForwardSyncTask(forward, tunnel, gostResult.getMsg());
                return okWithMsg("转发规则已创建，但目标节点当前离线，已加入同步重试队列，节点上线后会自动补推配置");
            }
            this.removeById(forward.getId());
            return gostResult;
        }

        return R.ok();
    }

    /**
     * 判断 Gost 操作失败是否是因为目标节点当前离线/连接已断开（而非配置本身有问题）。
     */
    private boolean isNodeOfflineFailure(R gostResult) {
        if (gostResult == null || gostResult.getMsg() == null) return false;
        String msg = gostResult.getMsg();
        return msg.contains("不在线") || msg.contains("连接已断开");
    }

    /**
     * 构造一个 code=0、带自定义提示文案的成功响应（{@link R#ok(Object)} 是把参数存进 data 而非 msg，
     * 前端这里要读的是 msg，所以不能直接用它）
     */
    private R okWithMsg(String msg) {
        R result = R.ok();
        result.setMsg(msg);
        return result;
    }

    /**
     * 登记一条「转发同步」任务队列项：节点离线导致的 gost 配置推送失败时调用，
     * dedupKey 用转发ID，节点重新上线或定时兜底扫描时会自动重试推送
     */
    private void enqueueForwardSyncTask(Forward forward, Tunnel tunnel, String error) {
        List<Long> nodeIds = new ArrayList<>();
        if (tunnel.getInNodeId() != null) {
            nodeIds.add(tunnel.getInNodeId());
        }
        if (tunnel.getType() == TUNNEL_TYPE_TUNNEL_FORWARD && tunnel.getOutNodeId() != null) {
            nodeIds.add(tunnel.getOutNodeId());
        }
        JSONObject payload = new JSONObject();
        payload.put("forwardId", forward.getId());
        payload.put("summary", "转发规则「" + forward.getName() + "」");
        taskQueueService.enqueue("FORWARD_SYNC", String.valueOf(forward.getId()), payload.toJSONString(), nodeIds, error);
    }

    @Override
    public R getAllForwards() {
        UserInfo currentUser = getCurrentUserInfo();

        List<ForwardWithTunnelDto> forwardList;
        if (currentUser.getRoleId() != ADMIN_ROLE_ID) {
            forwardList = baseMapper.selectForwardsWithTunnelByUserId(currentUser.getUserId());
        } else {
            forwardList = baseMapper.selectAllForwardsWithTunnel();
        }

        return R.ok(forwardList);
    }

    @Override
    public R updateForward(ForwardUpdateDto forwardUpdateDto) {
        // 1. 获取当前用户信息
        UserInfo currentUser = getCurrentUserInfo();
        if (currentUser.getRoleId() != ADMIN_ROLE_ID) {
            User user = userService.getById(currentUser.getUserId());
            if (user == null) return R.err("用户不存在");
            if (user.getStatus() == 0) return R.err("用户已到期或被禁用");
        }

        // 1.1 校验隧道选择方式：显式隧道 或 入口/出口设备组，二选一
        R modeCheck = validateDeviceGroupSelection(forwardUpdateDto.getTunnelId(), forwardUpdateDto.getInDeviceGroupId(),
                forwardUpdateDto.getOutDeviceGroupId(), currentUser);
        if (modeCheck.getCode() != 0) {
            return modeCheck;
        }

        // 2. 检查转发是否存在
        Forward existForward = validateForwardExists(forwardUpdateDto.getId(), currentUser);
        if (existForward == null) {
            return R.err("转发不存在");
        }

        // 3. 检查隧道是否存在和可用
        Tunnel tunnel = tunnelResolver.resolveTunnel(forwardUpdateDto.getTunnelId(), forwardUpdateDto.getInDeviceGroupId(), forwardUpdateDto.getOutDeviceGroupId());
        if (tunnel == null) {
            return R.err("隧道不存在");
        }
        if (tunnel.getStatus() != TUNNEL_STATUS_ACTIVE) {
            return R.err("隧道已禁用，无法更新转发");
        }
        boolean tunnelChanged = isTunnelChanged(existForward, forwardUpdateDto);

        // 4. 解析新隧道选择对应的UserTunnel（即使隧道未变化也需要，用于权限检查和构建服务名称）
        UserTunnel userTunnel;
        if (currentUser.getRoleId() == ADMIN_ROLE_ID) {
            // 管理员用户通过forward记录获取原始的用户ID，用于构建正确的服务名称
            userTunnel = tunnelResolver.resolveUserTunnel(existForward.getUserId(), forwardUpdateDto.getTunnelId(), forwardUpdateDto.getInDeviceGroupId());
        } else {
            userTunnel = tunnelResolver.resolveUserTunnel(currentUser.getUserId(), forwardUpdateDto.getTunnelId(), forwardUpdateDto.getInDeviceGroupId());
        }

        // 5. 检查权限和限制
        UserPermissionResult permissionResult = null;
        if (tunnelChanged) {
            if (currentUser.getRoleId() == ADMIN_ROLE_ID) {
                // 管理员操作自己的转发时，不需要检查权限限制
                if (Objects.equals(currentUser.getUserId(), existForward.getUserId())) {
                    permissionResult = UserPermissionResult.success(null, null);
                } else {
                    // 管理员操作用户转发时，需要检查原用户是否有新隧道权限
                    // 获取原转发用户的信息
                    User originalUser = userService.getById(existForward.getUserId());
                    if (originalUser == null) {
                        return R.err("用户不存在");
                    }

                    // 检查原用户是否有新隧道权限
                    if (userTunnel == null) {
                        return R.err("用户没有该隧道权限");
                    }

                    if (userTunnel.getStatus() != 1) {
                        return R.err("隧道被禁用");
                    }

                    // 检查原用户的转发数量限制（账号级别，套餐决定的总量上限）
                    R quotaCheckResult = checkForwardQuota(existForward.getUserId(), originalUser, forwardUpdateDto.getId());
                    if (quotaCheckResult.getCode() != 0) {
                        return R.err("用户" + quotaCheckResult.getMsg());
                    }

                    permissionResult = UserPermissionResult.success(null, userTunnel);
                }
            } else {
                // 普通用户检查自己的权限
                permissionResult = checkUserPermissions(currentUser, tunnel, userTunnel, forwardUpdateDto.getId());
                if (permissionResult.isHasError()) {
                    return R.err(permissionResult.getErrorMessage());
                }
            }
        }

        if (currentUser.getRoleId() != ADMIN_ROLE_ID && userTunnel == null) {
            return R.err("你没有该隧道权限");
        }

        // 6. 更新Forward对象
        Forward updatedForward = updateForwardEntity(forwardUpdateDto, existForward, tunnel);

        // 7. 获取所需的节点信息
        NodeInfo nodeInfo = getRequiredNodes(tunnel);
        if (nodeInfo.isHasError()) {
            return R.err(nodeInfo.getErrorMessage());
        }

        // 8. 调用Gost服务更新转发
        R gostResult;
        if (tunnelChanged) {
            // 隧道变化时：先删除原配置，再创建新配置
            gostResult = updateGostServicesWithTunnelChange(existForward, updatedForward, tunnel, permissionResult != null ? permissionResult.getLimiter() : null, nodeInfo, userTunnel);
        } else {
            // 隧道未变化时：直接更新配置
            gostResult = updateGostServices(updatedForward, tunnel, permissionResult != null ? permissionResult.getLimiter() : null, nodeInfo, userTunnel);
        }

        if (gostResult.getCode() != 0) {
            if (isNodeOfflineFailure(gostResult)) {
                // 节点当前离线：更新内容正常保存，只是暂时无法把配置推送到节点，不应因此阻止保存。
                // 隧道未发生变化的情况下才登记重试队列（隧道变更+离线的场景更复杂，暂不自动重试，走原有手动兜底）。
                log.warn("转发 {} 更新成功，但目标节点当前离线，配置暂未同步：{}", updatedForward.getId(), gostResult.getMsg());
                updatedForward.setStatus(1);
                boolean savedOffline = this.updateById(updatedForward);
                if (savedOffline && !tunnelChanged) {
                    enqueueForwardSyncTask(updatedForward, tunnel, gostResult.getMsg());
                }
                return savedOffline
                        ? okWithMsg("端口转发已更新，但目标节点当前离线，已加入同步重试队列，节点上线后会自动补推配置")
                        : R.err("端口转发更新失败");
            }
            return gostResult;
        }
        updatedForward.setStatus(1);
        // 9. 保存更新
        boolean result = this.updateById(updatedForward);
        return result ? R.ok("端口转发更新成功") : R.err("端口转发更新失败");
    }

    @Override
    public R deleteForward(Long id) {
        // 1. 获取当前用户信息
        UserInfo currentUser = getCurrentUserInfo();

        // 2. 检查转发是否存在
        Forward forward = validateForwardExists(id, currentUser);
        if (forward == null) {
            return R.err("端口转发不存在");
        }

        // 3. 获取隧道信息
        Tunnel tunnel = tunnelResolver.resolveTunnel(forward);
        if (tunnel == null) {
            return R.err("隧道不存在");
        }

        // 4. 权限检查（仅普通用户需要）
        UserTunnel userTunnel = null;
        if (currentUser.getRoleId() != ADMIN_ROLE_ID) {
            userTunnel = tunnelResolver.resolveUserTunnel(currentUser.getUserId(), forward);
            if (userTunnel == null) {
                return R.err("你没有该隧道权限");
            }
        } else {
            // 管理员删除用户记录时，需要获取对应的UserTunnel用于构建正确的服务名称
            userTunnel = tunnelResolver.resolveUserTunnel(forward.getUserId(), forward);
        }

        // 5. 获取所需的节点信息
        NodeInfo nodeInfo = getRequiredNodes(tunnel);
        if (nodeInfo.isHasError()) {
            return R.err(nodeInfo.getErrorMessage());
        }

        // 6. 调用Gost服务删除转发
        R gostResult = deleteGostServices(forward, tunnel, nodeInfo, userTunnel);
        if (gostResult.getCode() != 0) {
            return gostResult;
        }

        // 7. 删除转发记录
        boolean result = this.removeById(id);
        if (result) {
            taskQueueService.removeByTypeAndKey("FORWARD_SYNC", String.valueOf(id));
            return R.ok("端口转发删除成功");
        } else {
            return R.err("端口转发删除失败");
        }
    }

    @Override
    public R pauseForward(Long id) {
        return changeForwardStatus(id, FORWARD_STATUS_PAUSED, "暂停", "PauseService");
    }

    @Override
    public R resumeForward(Long id) {
        return changeForwardStatus(id, FORWARD_STATUS_ACTIVE, "恢复", "ResumeService");
    }

    @Override
    public R forceDeleteForward(Long id) {
        // 1. 获取当前用户信息
        UserInfo currentUser = getCurrentUserInfo();

        // 2. 检查转发是否存在且用户有权限操作
        Forward forward = validateForwardExists(id, currentUser);
        if (forward == null) {
            return R.err("端口转发不存在");
        }

        // 3. 直接删除转发记录，跳过GOST服务删除
        boolean result = this.removeById(id);
        if (result) {
            taskQueueService.removeByTypeAndKey("FORWARD_SYNC", String.valueOf(id));
            return R.ok("端口转发强制删除成功");
        } else {
            return R.err("端口转发强制删除失败");
        }
    }

    /**
     * 改变转发状态（暂停/恢复）
     */
    private R changeForwardStatus(Long id, int targetStatus, String operation, String gostMethod) {
        // 1. 获取当前用户信息
        UserInfo currentUser = getCurrentUserInfo();

        if (currentUser.getRoleId() != ADMIN_ROLE_ID) {
            User user = userService.getById(currentUser.getUserId());
            if (user == null) return R.err("用户不存在");
            if (user.getStatus() == 0) return R.err("用户已到期或被禁用");
        }


        // 2. 检查转发是否存在
        Forward forward = validateForwardExists(id, currentUser);
        if (forward == null) {
            return R.err("转发不存在");
        }

        // 3. 获取隧道信息
        Tunnel tunnel = tunnelResolver.resolveTunnel(forward);
        if (tunnel == null) {
            return R.err("隧道不存在");
        }

        // 4. 恢复服务时需要额外检查
        UserTunnel userTunnel = null;
        if (targetStatus == FORWARD_STATUS_ACTIVE) {
            if (tunnel.getStatus() != TUNNEL_STATUS_ACTIVE) {
                return R.err("隧道已禁用，无法恢复服务");
            }

            // 普通用户需要检查流量和账户状态
            if (currentUser.getRoleId() != ADMIN_ROLE_ID) {
                R flowCheckResult = checkUserFlowLimits(currentUser.getUserId(), forward);
                if (flowCheckResult.getCode() != 0) {
                    return flowCheckResult;
                }

                userTunnel = tunnelResolver.resolveUserTunnel(currentUser.getUserId(), forward);
                if (userTunnel == null) {
                    return R.err("你没有该隧道权限");
                }

                if (userTunnel.getStatus() != 1) {
                    return R.err("隧道被禁用");
                }
            }
        }

        // 5. 权限检查（仅普通用户需要）
        if (currentUser.getRoleId() != ADMIN_ROLE_ID && userTunnel == null) {
            userTunnel = tunnelResolver.resolveUserTunnel(currentUser.getUserId(), forward);
            if (userTunnel == null) {
                return R.err("你没有该隧道权限");
            }
        }

        // 6. 确保获取UserTunnel用于构建服务名称（包括管理员用户）
        if (userTunnel == null) {
            // 通过forward记录获取原始的用户ID来查找UserTunnel
            userTunnel = tunnelResolver.resolveUserTunnel(forward.getUserId(), forward);
        }

        // 7. 获取所需的节点信息
        NodeInfo nodeInfo = getRequiredNodes(tunnel);
        if (nodeInfo.isHasError()) {
            return R.err(nodeInfo.getErrorMessage());
        }

        // 8. 调用Gost服务
        String serviceName = buildServiceName(forward.getId(), forward.getUserId(), userTunnel);
        GostDto gostResult;

        if ("PauseService".equals(gostMethod)) {
            gostResult = GostUtil.PauseService(nodeInfo.getInNode().getId(), serviceName);

            // 隧道转发需要同时暂停远端服务
            if (tunnel.getType() == TUNNEL_TYPE_TUNNEL_FORWARD && nodeInfo.getOutNode() != null) {
                GostDto remoteResult = GostUtil.PauseRemoteService(nodeInfo.getOutNode().getId(), serviceName);
                if (!isGostOperationSuccess(remoteResult)) {
                    return R.err(operation + "远端服务失败：" + remoteResult.getMsg());
                }
            }
        } else {
            gostResult = GostUtil.ResumeService(nodeInfo.getInNode().getId(), serviceName);

            // 隧道转发需要同时恢复远端服务
            if (tunnel.getType() == TUNNEL_TYPE_TUNNEL_FORWARD && nodeInfo.getOutNode() != null) {
                GostDto remoteResult = GostUtil.ResumeRemoteService(nodeInfo.getOutNode().getId(), serviceName);
                if (!isGostOperationSuccess(remoteResult)) {
                    return R.err(operation + "远端服务失败：" + remoteResult.getMsg());
                }
            }
        }

        if (!isGostOperationSuccess(gostResult)) {
            return R.err(operation + "服务失败：" + gostResult.getMsg());
        }

        // 9. 更新转发状态
        forward.setStatus(targetStatus);
        forward.setUpdatedTime(System.currentTimeMillis());
        boolean result = this.updateById(forward);

        return result ? R.ok("服务已" + operation) : R.err("更新状态失败");
    }

    @Override
    public R diagnoseForward(Long id) {
        // 1. 获取当前用户信息
        UserInfo currentUser = getCurrentUserInfo();

        // 2. 检查转发是否存在且用户有权限访问
        Forward forward = validateForwardExists(id, currentUser);
        if (forward == null) {
            return R.err("转发不存在");
        }

        // 3. 获取隧道信息
        Tunnel tunnel = tunnelResolver.resolveTunnel(forward);
        if (tunnel == null) {
            return R.err("隧道不存在");
        }

        // 4. 获取入口节点信息
        Node inNode = nodeService.getNodeById(tunnel.getInNodeId());
        if (inNode == null) {
            return R.err("入口节点不存在");
        }


        List<DiagnosisResult> results = new ArrayList<>();
        String[] remoteAddresses = forward.getRemoteAddr().split(",");
        // 6. 根据隧道类型执行不同的诊断策略
        if (tunnel.getType() == TUNNEL_TYPE_PORT_FORWARD) {
            // 端口转发：入口节点直接TCP ping目标地址
            for (String remoteAddress : remoteAddresses) {
                // 提取IP和端口
                String targetIp = extractIpFromAddress(remoteAddress);
                int targetPort = extractPortFromAddress(remoteAddress);
                if (targetIp == null || targetPort == -1) {
                    return R.err("无法解析目标地址: " + remoteAddress);
                }

                DiagnosisResult result = performTcpPingDiagnosis(inNode, targetIp, targetPort, "转发->目标", "inbound", forward.getInDeviceGroupId());
                results.add(result);
            }
        } else {
            // 隧道转发：入口TCP ping出口，出口TCP ping目标
            Node outNode = nodeService.getNodeById(tunnel.getOutNodeId());
            if (outNode == null) {
                return R.err("出口节点不存在");
            }

            // 入口TCP ping出口（使用转发的出口端口）
            DiagnosisResult inToOutResult = performTcpPingDiagnosis(inNode, outNode.getServerIp(), forward.getOutPort(), "入口->出口", "inbound", forward.getInDeviceGroupId());
            results.add(inToOutResult);

            // 出口TCP ping目标
            for (String remoteAddress : remoteAddresses) {
                // 提取IP和端口
                String targetIp = extractIpFromAddress(remoteAddress);
                int targetPort = extractPortFromAddress(remoteAddress);
                if (targetIp == null || targetPort == -1) {
                    return R.err("无法解析目标地址: " + remoteAddress);
                }
                DiagnosisResult outToTargetResult = performTcpPingDiagnosis(outNode, targetIp, targetPort, "出口->目标", "outbound", forward.getOutDeviceGroupId());
                results.add(outToTargetResult);
            }

        }

        // 7. 构建诊断报告
        long dispatchFailedCount = results.stream().filter(DiagnosisResult::isDispatchFailed).count();
        long recoveredCount = results.stream().filter(DiagnosisResult::isRecovered).count();
        Map<String, Object> dispatchStats = new HashMap<>();
        dispatchStats.put("sent", results.size());
        dispatchStats.put("failed", dispatchFailedCount);
        dispatchStats.put("recovered", recoveredCount);

        Map<String, Object> diagnosisReport = new HashMap<>();
        diagnosisReport.put("forwardId", id);
        diagnosisReport.put("forwardName", forward.getName());
        diagnosisReport.put("tunnelType", tunnel.getType() == TUNNEL_TYPE_PORT_FORWARD ? "端口转发" : "隧道转发");
        diagnosisReport.put("results", results);
        diagnosisReport.put("dispatchStats", dispatchStats);
        diagnosisReport.put("timestamp", System.currentTimeMillis());

        return R.ok(diagnosisReport);
    }

    @Override
    public R updateForwardOrder(Map<String, Object> params) {
        try {
            // 1. 获取当前用户信息
            UserInfo currentUser = getCurrentUserInfo();

            // 2. 验证参数
            if (!params.containsKey("forwards")) {
                return R.err("缺少forwards参数");
            }

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> forwardsList = (List<Map<String, Object>>) params.get("forwards");
            if (forwardsList == null || forwardsList.isEmpty()) {
                return R.err("forwards参数不能为空");
            }

            // 3. 验证用户权限（只能更新自己的转发）
            if (currentUser.getRoleId() != ADMIN_ROLE_ID) {
                // 普通用户只能更新自己的转发
                List<Long> forwardIds = forwardsList.stream()
                        .map(item -> Long.valueOf(item.get("id").toString()))
                        .collect(Collectors.toList());

                // 检查所有转发是否属于当前用户
                QueryWrapper<Forward> queryWrapper = new QueryWrapper<>();
                queryWrapper.in("id", forwardIds);
                queryWrapper.eq("user_id", currentUser.getUserId());

                long count = this.count(queryWrapper);
                if (count != forwardIds.size()) {
                    return R.err("只能更新自己的转发排序");
                }
            }

            // 4. 批量更新排序
            List<Forward> forwardsToUpdate = new ArrayList<>();
            for (Map<String, Object> forwardData : forwardsList) {
                Long id = Long.valueOf(forwardData.get("id").toString());
                Integer inx = Integer.valueOf(forwardData.get("inx").toString());

                Forward forward = new Forward();
                forward.setId(id);
                forward.setInx(inx);
                forwardsToUpdate.add(forward);
            }

            // 5. 执行批量更新
            boolean success = this.updateBatchById(forwardsToUpdate);
            if (success) {
                log.info("用户 {} 更新了 {} 个转发的排序", currentUser.getUserName(), forwardsToUpdate.size());
                return R.ok("排序更新成功");
            } else {
                return R.err("排序更新失败");
            }

        } catch (Exception e) {
            log.error("更新转发排序失败", e);
            return R.err("更新排序时发生错误: " + e.getMessage());
        }
    }

    /**
     * 从地址字符串中提取IP地址
     * 支持格式: ip:port, [ipv6]:port, domain:port
     */
    private String extractIpFromAddress(String address) {
        if (address == null || address.trim().isEmpty()) {
            return null;
        }

        address = address.trim();

        // IPv6格式: [ipv6]:port
        if (address.startsWith("[")) {
            int closeBracket = address.indexOf(']');
            if (closeBracket > 1) {
                return address.substring(1, closeBracket);
            }
        }

        // IPv4或域名格式: ip:port 或 domain:port
        int lastColon = address.lastIndexOf(':');
        if (lastColon > 0) {
            return address.substring(0, lastColon);
        }

        // 如果没有端口，直接返回地址
        return address;
    }

    /**
     * 从地址字符串中提取端口号
     * 支持格式: ip:port, [ipv6]:port, domain:port
     */
    private int extractPortFromAddress(String address) {
        if (address == null || address.trim().isEmpty()) {
            return -1;
        }

        address = address.trim();

        // IPv6格式: [ipv6]:port
        if (address.startsWith("[")) {
            int closeBracket = address.indexOf(']');
            if (closeBracket > 1 && closeBracket + 1 < address.length() && address.charAt(closeBracket + 1) == ':') {
                String portStr = address.substring(closeBracket + 2);
                try {
                    return Integer.parseInt(portStr);
                } catch (NumberFormatException e) {
                    return -1;
                }
            }
        }

        // IPv4或域名格式: ip:port 或 domain:port
        int lastColon = address.lastIndexOf(':');
        if (lastColon > 0 && lastColon + 1 < address.length()) {
            String portStr = address.substring(lastColon + 1);
            try {
                return Integer.parseInt(portStr);
            } catch (NumberFormatException e) {
                return -1;
            }
        }

        // 如果没有端口，返回-1表示无法解析
        return -1;
    }

    /**
     * 执行TCP ping诊断
     *
     * @param node        执行TCP ping的节点
     * @param targetIp    目标IP地址
     * @param port        目标端口
     * @param description 诊断描述
     * @return 诊断结果
     */
    private DiagnosisResult performTcpPingDiagnosis(Node node, String targetIp, int port, String description, String leg, Long groupId) {
        try {
            // 构建TCP ping请求数据
            JSONObject tcpPingData = new JSONObject();
            tcpPingData.put("ip", targetIp);
            tcpPingData.put("port", port);
            tcpPingData.put("count", 2);
            tcpPingData.put("timeout", 3000); // 5秒超时

            // 发送TCP ping命令到节点
            GostDto gostResult = WebSocketServer.send_msg(node.getId(), tcpPingData, "TcpPing");

            DiagnosisResult result = new DiagnosisResult();
            result.setNodeId(node.getId());
            result.setNodeName(node.getName());
            result.setGroupId(groupId);
            result.setLeg(leg);
            result.setTargetIp(targetIp);
            result.setTargetPort(port);
            result.setDescription(description);
            result.setTimestamp(System.currentTimeMillis());
            result.setRecovered(gostResult != null && "OK".equals(gostResult.getMsg()));
            result.setDispatchFailed(!result.isRecovered() && isDispatchFailure(gostResult != null ? gostResult.getMsg() : null));

            if (result.isRecovered()) {
                // 尝试解析TCP ping响应数据
                try {
                    if (gostResult.getData() != null) {
                        JSONObject tcpPingResponse = (JSONObject) gostResult.getData();
                        boolean success = tcpPingResponse.getBooleanValue("success");

                        result.setSuccess(success);
                        result.setAttempts(parsePingAttempts(tcpPingResponse));
                        if (success) {
                            result.setMessage("TCP连接成功");
                            result.setAverageTime(tcpPingResponse.getDoubleValue("averageTime"));
                            result.setPacketLoss(tcpPingResponse.getDoubleValue("packetLoss"));
                        } else {
                            result.setMessage(tcpPingResponse.getString("errorMessage"));
                            result.setAverageTime(-1.0);
                            result.setPacketLoss(100.0);
                        }
                    } else {
                        // 没有详细数据，使用默认值
                        result.setSuccess(true);
                        result.setMessage("TCP连接成功");
                        result.setAverageTime(0.0);
                        result.setPacketLoss(0.0);
                    }
                } catch (Exception e) {
                    // 解析响应数据失败，但TCP ping命令本身成功了
                    result.setSuccess(true);
                    result.setMessage("TCP连接成功，但无法解析详细数据");
                    result.setAverageTime(0.0);
                    result.setPacketLoss(0.0);
                }
            } else {
                result.setSuccess(false);
                result.setMessage(gostResult != null ? gostResult.getMsg() : "节点无响应");
                result.setAverageTime(-1.0);
                result.setPacketLoss(100.0);
            }

            return result;
        } catch (Exception e) {
            DiagnosisResult result = new DiagnosisResult();
            result.setNodeId(node.getId());
            result.setNodeName(node.getName());
            result.setGroupId(groupId);
            result.setLeg(leg);
            result.setTargetIp(targetIp);
            result.setTargetPort(port);
            result.setDescription(description);
            result.setSuccess(false);
            result.setMessage("诊断执行异常: " + e.getMessage());
            result.setTimestamp(System.currentTimeMillis());
            result.setAverageTime(-1.0);
            result.setPacketLoss(100.0);
            result.setDispatchFailed(true);
            return result;
        }
    }

    /**
     * 判断消息是否连节点都没能送达（节点离线/连接已断开/发送本身异常），
     * 区别于"消息已送达节点，但等待响应超时"（不计入发送失败，也不计入回收成功）
     */
    private boolean isDispatchFailure(String msg) {
        if (msg == null) return true;
        return msg.contains("不在线") || msg.contains("连接已断开") || msg.startsWith("发送消息失败");
    }

    /**
     * 解析 TCP ping 响应中的逐次连接尝试明细（attempts 字段），供前端逐行展示；
     * 旧版节点 Agent 未返回该字段时返回空列表，前端回退为只显示汇总结果
     */
    private List<Map<String, Object>> parsePingAttempts(JSONObject tcpPingResponse) {
        List<Map<String, Object>> attempts = new ArrayList<>();
        com.alibaba.fastjson.JSONArray rawAttempts = tcpPingResponse.getJSONArray("attempts");
        if (rawAttempts == null) {
            return attempts;
        }
        for (int i = 0; i < rawAttempts.size(); i++) {
            JSONObject attempt = rawAttempts.getJSONObject(i);
            Map<String, Object> item = new HashMap<>();
            item.put("seq", attempt.getIntValue("seq"));
            item.put("success", attempt.getBooleanValue("success"));
            item.put("timeMs", attempt.getDoubleValue("timeMs"));
            item.put("error", attempt.getString("error"));
            attempts.add(item);
        }
        return attempts;
    }

    /**
     * 获取当前用户信息
     */
    private UserInfo getCurrentUserInfo() {
        Integer userId = JwtUtil.getUserIdFromToken();
        Integer roleId = JwtUtil.getRoleIdFromToken();
        String userName = JwtUtil.getNameFromToken();
        return new UserInfo(userId, roleId, userName);
    }

    /**
     * 验证转发是否存在且用户有权限访问
     */
    private Forward validateForwardExists(Long forwardId, UserInfo currentUser) {
        Forward forward = this.getById(forwardId);
        if (forward == null) {
            return null;
        }

        // 普通用户只能操作自己的转发
        if (currentUser.getRoleId() != ADMIN_ROLE_ID &&
                !Objects.equals(currentUser.getUserId(), forward.getUserId())) {
            return null;
        }

        return forward;
    }

    /**
     * 获取所需的节点信息
     */
    private NodeInfo getRequiredNodes(Tunnel tunnel) {
        Node inNode = nodeService.getNodeById(tunnel.getInNodeId());
        if (inNode == null) {
            return NodeInfo.error("入口节点不存在");
        }

        Node outNode = null;
        if (tunnel.getType() == TUNNEL_TYPE_TUNNEL_FORWARD) {
            outNode = nodeService.getNodeById(tunnel.getOutNodeId());
            if (outNode == null) {
                return NodeInfo.error("出口节点不存在");
            }
        }

        return NodeInfo.success(inNode, outNode);
    }

    /**
     * 校验隧道选择方式：显式隧道 或 入口/出口设备组，二选一；设备组模式下校验设备组存在性与可见性。
     * 不创建/复用任何 Tunnel/UserTunnel 记录——设备组模式转发始终以 {@link TunnelResolver}
     * 在内存中拼出的等效对象驱动，不在此处落库。
     */
    private R validateDeviceGroupSelection(Integer explicitTunnelId, Long inDeviceGroupId, Long outDeviceGroupId,
                                            UserInfo currentUser) {
        if (explicitTunnelId != null) {
            return R.ok();
        }
        if (inDeviceGroupId == null) {
            return R.err("请指定隧道或入口设备组");
        }

        DeviceGroup inGroup = deviceGroupService.getById(inDeviceGroupId);
        if (inGroup == null) {
            return R.err("入口设备组不存在");
        }

        DeviceGroup outGroup = null;
        if (outDeviceGroupId != null) {
            outGroup = deviceGroupService.getById(outDeviceGroupId);
            if (outGroup == null) {
                return R.err("出口设备组不存在");
            }
        }

        if (currentUser.getRoleId() != ADMIN_ROLE_ID) {
            R visibilityCheck = checkDeviceGroupVisibility(inGroup, currentUser.getUserId());
            if (visibilityCheck.getCode() != 0) {
                return visibilityCheck;
            }
            if (outGroup != null) {
                visibilityCheck = checkDeviceGroupVisibility(outGroup, currentUser.getUserId());
                if (visibilityCheck.getCode() != 0) {
                    return visibilityCheck;
                }
            }
        }

        return R.ok();
    }

    /**
     * 校验普通用户是否有权限使用该设备组：
     * 单端隧道用户自建设备组（ownerUserId 非空）——拥有者本人始终可用，其余用户仅当该设备组标记为公开共享才可用；
     * 管理员建立的设备组——未绑定用户组则所有人可用，否则需与自身用户组一致
     */
    private R checkDeviceGroupVisibility(DeviceGroup group, Integer userId) {
        if (group.getOwnerUserId() != null) {
            if (group.getOwnerUserId().equals(userId.longValue())) {
                return R.ok();
            }
            if (group.getShared() != null && group.getShared() == 1) {
                return R.ok();
            }
            return R.err("无权限使用设备组：" + group.getName());
        }
        if (group.getUserGroupId() == null) {
            return R.ok();
        }
        User user = userService.getById(userId);
        if (user == null || user.getGroupId() == null || !user.getGroupId().equals(group.getUserGroupId())) {
            return R.err("无权限使用设备组：" + group.getName());
        }
        return R.ok();
    }

    /**
     * 检查用户权限和限制
     */
    private UserPermissionResult checkUserPermissions(UserInfo currentUser, Tunnel tunnel, UserTunnel userTunnel, Long excludeForwardId) {
        if (currentUser.getRoleId() == ADMIN_ROLE_ID) {
            return UserPermissionResult.success(null, null);
        }

        // 获取用户信息（流量/到期时间/转发数量等额度统一由账号自身的套餐控制，
        // 不再额外维护一套隧道级别的额度——避免账号层与隧道层两套限制重复配置、互相打架）
        User userInfo = userService.getById(currentUser.getUserId());
        if (userInfo.getExpTime() != null && userInfo.getExpTime() <= System.currentTimeMillis()) {
            return UserPermissionResult.error("当前账号已到期");
        }

        // 检查用户隧道权限
        if (userTunnel == null) {
            return UserPermissionResult.error("你没有该隧道权限");
        }

        if (userTunnel.getStatus() != 1) {
            return UserPermissionResult.error("隧道被禁用");
        }

        // 流量限制检查
        if (userInfo.getFlow() <= 0) {
            return UserPermissionResult.error("用户总流量已用完");
        }

        // 转发数量限制检查
        R quotaCheckResult = checkForwardQuota(currentUser.getUserId(), userInfo, excludeForwardId);
        if (quotaCheckResult.getCode() != 0) {
            return UserPermissionResult.error(quotaCheckResult.getMsg());
        }

        return UserPermissionResult.success(null, userTunnel);
    }

    /**
     * 检查用户转发数量限制（账号级别，套餐决定的总量上限）
     */
    private R checkForwardQuota(Integer userId, User userInfo, Long excludeForwardId) {
        QueryWrapper<Forward> userQuery = new QueryWrapper<Forward>().eq("user_id", userId);
        if (excludeForwardId != null) {
            userQuery.ne("id", excludeForwardId);
        }
        long userForwardCount = this.count(userQuery);
        if (userForwardCount >= userInfo.getNum()) {
            return R.err("用户总转发数量已达上限，当前限制：" + userInfo.getNum() + "个");
        }

        return R.ok();
    }

    /**
     * 检查用户流量限制
     */
    private R checkUserFlowLimits(Integer userId, Forward forward) {
        User userInfo = userService.getById(userId);
        if (userInfo.getExpTime() != null && userInfo.getExpTime() <= System.currentTimeMillis()) {
            return R.err("当前账号已到期");
        }

        UserTunnel userTunnel = tunnelResolver.resolveUserTunnel(userId, forward);
        if (userTunnel == null) {
            return R.err("你没有该隧道权限");
        }

        // 检查用户总流量限制（账号级别，套餐决定的总量上限）
        if (userInfo.getFlow() * BYTES_TO_GB <= userInfo.getInFlow() + userInfo.getOutFlow()) {
            return R.err("用户总流量已用完，无法恢复服务");
        }

        return R.ok();
    }

    /**
     * 分配端口
     */
    private PortAllocation allocatePorts(Tunnel tunnel, Integer specifiedInPort) {
        return allocatePorts(tunnel, specifiedInPort, null);
    }

    /**
     * 分配端口
     */
    private PortAllocation allocatePorts(Tunnel tunnel, Integer specifiedInPort, Long excludeForwardId) {
        Integer inPort;

        if (specifiedInPort != null) {
            // 用户指定了入口端口，需要检查是否可用
            if (!isInPortAvailable(tunnel, specifiedInPort, excludeForwardId)) {
                return PortAllocation.error("指定的入口端口 " + specifiedInPort + " 已被占用或不在允许范围内");
            }
            inPort = specifiedInPort;
        } else {
            // 用户未指定端口时自动分配
            inPort = allocateInPort(tunnel, excludeForwardId);
            if (inPort == null) {
                return PortAllocation.error("隧道入口端口已满，无法分配新端口");
            }
        }

        Integer outPort = null;
        if (tunnel.getType() == TUNNEL_TYPE_TUNNEL_FORWARD) {
            outPort = allocateOutPort(tunnel, excludeForwardId);
            if (outPort == null) {
                return PortAllocation.error("隧道出口端口已满，无法分配新端口");
            }
        }

        return PortAllocation.success(inPort, outPort);
    }

    /**
     * 创建Forward实体对象
     */
    private Forward createForwardEntity(ForwardDto forwardDto, UserInfo currentUser, PortAllocation portAllocation) {
        Forward forward = new Forward();
        // 先复制DTO的属性，再设置其他属性，避免被覆盖
        BeanUtils.copyProperties(forwardDto, forward);
        forward.setStatus(FORWARD_STATUS_ACTIVE);
        forward.setInPort(portAllocation.getInPort());
        forward.setOutPort(portAllocation.getOutPort());
        forward.setUserId(currentUser.getUserId());
        forward.setUserName(currentUser.getUserName());
        forward.setCreatedTime(System.currentTimeMillis());
        forward.setUpdatedTime(System.currentTimeMillis());
        return forward;
    }

    /**
     * 更新Forward实体对象
     */
    private Forward updateForwardEntity(ForwardUpdateDto forwardUpdateDto, Forward existForward, Tunnel tunnel) {
        Forward forward = new Forward();
        BeanUtils.copyProperties(forwardUpdateDto, forward);

        // 处理端口分配逻辑
        boolean tunnelChanged = isTunnelSelectionChanged(existForward.getTunnelId(), existForward.getInDeviceGroupId(), existForward.getOutDeviceGroupId(),
                forwardUpdateDto.getTunnelId(), forwardUpdateDto.getInDeviceGroupId(), forwardUpdateDto.getOutDeviceGroupId());
        boolean inPortChanged = forwardUpdateDto.getInPort() != null &&
                !Objects.equals(forwardUpdateDto.getInPort(), existForward.getInPort());

        if (tunnelChanged || inPortChanged) {
            // 隧道变化或入口端口变化时需要重新分配
            Integer specifiedInPort = forwardUpdateDto.getInPort();
            // 如果没有指定新端口但隧道未变化，保持原端口
            if (specifiedInPort == null && !tunnelChanged) {
                specifiedInPort = existForward.getInPort();
            }

            PortAllocation portAllocation = allocatePorts(tunnel, specifiedInPort, forwardUpdateDto.getId());
            if (portAllocation.isHasError()) {
                throw new RuntimeException(portAllocation.getErrorMessage());
            }
            forward.setInPort(portAllocation.getInPort());
            forward.setOutPort(portAllocation.getOutPort());
        } else {
            // 隧道和端口都未变化，保持原端口
            forward.setInPort(existForward.getInPort());
            forward.setOutPort(existForward.getOutPort());
        }

        forward.setUpdatedTime(System.currentTimeMillis());
        return forward;
    }

    /**
     * 创建Gost服务
     */
    private R createGostServices(Forward forward, Tunnel tunnel, Integer limiter, NodeInfo nodeInfo, UserTunnel userTunnel) {
        String serviceName = buildServiceName(forward.getId(), forward.getUserId(), userTunnel);

        // 隧道转发需要创建链和远程服务
        if (tunnel.getType() == TUNNEL_TYPE_TUNNEL_FORWARD) {
            R chainResult = createChainService(nodeInfo.getInNode(), serviceName, tunnel.getOutIp(), forward.getOutPort(), tunnel.getProtocol(), tunnel.getInterfaceName());
            if (chainResult.getCode() != 0) {
                GostUtil.DeleteChains(nodeInfo.getInNode().getId(), serviceName);
                return chainResult;
            }

            R remoteResult = createRemoteService(nodeInfo.getOutNode(), serviceName, forward, tunnel.getProtocol(), forward.getInterfaceName());
            if (remoteResult.getCode() != 0) {
                GostUtil.DeleteChains(nodeInfo.getInNode().getId(), serviceName);
                GostUtil.DeleteRemoteService(nodeInfo.getOutNode().getId(), serviceName);
                return remoteResult;
            }
        }

        String interfaceName = null;
        // 创建主服务
        if (tunnel.getType() != TUNNEL_TYPE_TUNNEL_FORWARD) { // 不是隧道转发服务才会存在网络接口
            interfaceName = forward.getInterfaceName();
        }


        R serviceResult = createMainService(nodeInfo.getInNode(), serviceName, forward, limiter, tunnel.getType(), tunnel, forward.getStrategy(), interfaceName);
        if (serviceResult.getCode() != 0) {
            GostUtil.DeleteChains(nodeInfo.getInNode().getId(), serviceName);
            if (nodeInfo.getOutNode() != null) {
                GostUtil.DeleteRemoteService(nodeInfo.getOutNode().getId(), serviceName);
            }
            return serviceResult;
        }
        return R.ok();
    }

    /**
     * 更新Gost服务
     */
    private R updateGostServices(Forward forward, Tunnel tunnel, Integer limiter, NodeInfo nodeInfo, UserTunnel userTunnel) {
        String serviceName = buildServiceName(forward.getId(), forward.getUserId(), userTunnel);

        // 隧道转发需要更新链和远程服务
        if (tunnel.getType() == TUNNEL_TYPE_TUNNEL_FORWARD) {
            R chainResult = updateChainService(nodeInfo.getInNode(), serviceName, tunnel.getOutIp(), forward.getOutPort(), tunnel.getProtocol(), tunnel.getInterfaceName());
            if (chainResult.getCode() != 0) {
                updateForwardStatusToError(forward);
                return chainResult;
            }

            R remoteResult = updateRemoteService(nodeInfo.getOutNode(), serviceName, forward, tunnel.getProtocol(), forward.getInterfaceName());
            if (remoteResult.getCode() != 0) {
                updateForwardStatusToError(forward);
                return remoteResult;
            }
        }
        String interfaceName = null;
        // 创建主服务
        if (tunnel.getType() != TUNNEL_TYPE_TUNNEL_FORWARD) { // 不是隧道转发服务才会存在网络接口
            interfaceName = forward.getInterfaceName();
        }
        // 更新主服务
        R serviceResult = updateMainService(nodeInfo.getInNode(), serviceName, forward, limiter, tunnel.getType(), tunnel, forward.getStrategy(), interfaceName);
        if (serviceResult.getCode() != 0) {
            updateForwardStatusToError(forward);
            return serviceResult;
        }

        return R.ok();
    }

    /**
     * 隧道变化时更新Gost服务：先删除原配置，再创建新配置
     */
    private R updateGostServicesWithTunnelChange(Forward existForward, Forward updatedForward, Tunnel newTunnel, Integer limiter, NodeInfo nodeInfo, UserTunnel userTunnel) {
        // 1. 获取原隧道信息
        Tunnel oldTunnel = tunnelResolver.resolveTunnel(existForward);
        if (oldTunnel == null) {
            return R.err("原隧道不存在，无法删除旧配置");
        }

        // 2. 删除原有的Gost服务配置
        R deleteResult = deleteOldGostServices(existForward, oldTunnel);
        if (deleteResult.getCode() != 0) {
            // 删除失败时记录日志，但不影响后续创建（可能原配置已不存在）
            log.info("删除原隧道{}的Gost配置失败: {}", oldTunnel.getId(), deleteResult.getMsg());
        }

        // 3. 创建新的Gost服务配置
        R createResult = createGostServices(updatedForward, newTunnel, limiter, nodeInfo, userTunnel);
        if (createResult.getCode() != 0) {
            updateForwardStatusToError(updatedForward);
            return R.err("创建新隧道配置失败: " + createResult.getMsg());
        }

        return R.ok();
    }

    /**
     * 删除原有的Gost服务（隧道变化时专用）
     */
    private R deleteOldGostServices(Forward forward, Tunnel oldTunnel) {
        // 获取原隧道的用户隧道关系
        UserTunnel oldUserTunnel = tunnelResolver.resolveUserTunnel(forward.getUserId(), forward);
        String serviceName = buildServiceName(forward.getId(), forward.getUserId(), oldUserTunnel);

        // 获取原隧道的节点信息
        NodeInfo oldNodeInfo = getRequiredNodes(oldTunnel);

        // 删除主服务（使用原隧道的入口节点）
        if (!oldNodeInfo.isHasError() && oldNodeInfo.getInNode() != null) {
            GostDto serviceResult = GostUtil.DeleteService(oldNodeInfo.getInNode().getId(), serviceName);
            if (!isGostOperationSuccess(serviceResult)) {
                log.info("删除主服务失败: {}", serviceResult.getMsg());
            }
            if (resolveCLimiterId(forward) != null) {
                GostUtil.DeleteCLimiters(oldNodeInfo.getInNode().getId(), forward.getId());
            }
        }

        // 如果原隧道是隧道转发类型，需要删除链和远程服务
        if (oldTunnel.getType() == TUNNEL_TYPE_TUNNEL_FORWARD) {
            // 删除链服务
            if (!oldNodeInfo.isHasError() && oldNodeInfo.getInNode() != null) {
                GostDto chainResult = GostUtil.DeleteChains(oldNodeInfo.getInNode().getId(), serviceName);
                if (!isGostOperationSuccess(chainResult)) {
                    log.info("删除链服务失败: {}", chainResult.getMsg());
                }
            }

            // 删除远程服务（即使节点信息获取失败，也要尝试删除）
            Node outNode = null;
            if (!oldNodeInfo.isHasError()) {
                outNode = oldNodeInfo.getOutNode();
            } else {
                // 即使获取节点信息失败，也尝试直接获取出口节点来删除远程服务
                outNode = nodeService.getNodeById(oldTunnel.getOutNodeId());
            }

            if (outNode != null) {
                GostDto remoteResult = GostUtil.DeleteRemoteService(outNode.getId(), serviceName);
                if (!isGostOperationSuccess(remoteResult)) {
                    log.info("删除远程服务失败: {}", remoteResult.getMsg());
                }
            }
        }

        return R.ok();
    }

    /**
     * 删除Gost服务
     */
    private R deleteGostServices(Forward forward, Tunnel tunnel, NodeInfo nodeInfo, UserTunnel userTunnel) {
        String serviceName = buildServiceName(forward.getId(), forward.getUserId(), userTunnel);

        // 删除主服务
        GostDto serviceResult = GostUtil.DeleteService(nodeInfo.getInNode().getId(), serviceName);
        if (!isGostOperationSuccess(serviceResult)) {
            return R.err(serviceResult.getMsg());
        }

        // 清理连接数/IP限制器（如果存在，忽略不存在的错误）
        if (resolveCLimiterId(forward) != null) {
            GostUtil.DeleteCLimiters(nodeInfo.getInNode().getId(), forward.getId());
        }

        // 清理规则限速派生出的限速器（如果存在，忽略不存在的错误）
        GostUtil.DeleteLimiters(nodeInfo.getInNode().getId(), "fwd_" + forward.getId());

        // 隧道转发需要删除链和远程服务
        if (tunnel.getType() == TUNNEL_TYPE_TUNNEL_FORWARD) {
            GostDto chainResult = GostUtil.DeleteChains(nodeInfo.getInNode().getId(), serviceName);
            if (!isGostOperationSuccess(chainResult)) {
                return R.err(chainResult.getMsg());
            }

            if (nodeInfo.getOutNode() != null) {
                GostDto remoteResult = GostUtil.DeleteRemoteService(nodeInfo.getOutNode().getId(), serviceName);
                if (!isGostOperationSuccess(remoteResult)) {
                    return R.err(remoteResult.getMsg());
                }
            }
        }

        return R.ok();
    }

    /**
     * 创建链服务
     */
    private R createChainService(Node inNode, String serviceName, String outIp, Integer outPort, String protocol, String interfaceName) {
        String remoteAddr = outIp + ":" + outPort;
        if (outIp.contains(":")) {
            remoteAddr = "[" + outIp + "]:" + outPort;
        }
        GostDto result = GostUtil.AddChains(inNode.getId(), serviceName, remoteAddr, protocol, interfaceName);
        return isGostOperationSuccess(result) ? R.ok() : R.err(result.getMsg());
    }

    /**
     * 创建远程服务
     */
    private R createRemoteService(Node outNode, String serviceName, Forward forward, String protocol, String interfaceName) {
        GostDto result = GostUtil.AddRemoteService(outNode.getId(), serviceName, forward.getOutPort(), forward.getRemoteAddr(), protocol, forward.getStrategy(), interfaceName);
        return isGostOperationSuccess(result) ? R.ok() : R.err(result.getMsg());
    }

    /**
     * 创建主服务
     */
    private R createMainService(Node inNode, String serviceName, Forward forward, Integer limiter, Integer tunnelType, Tunnel tunnel, String strategy, String interfaceName) {
        Long climiter = resolveCLimiterId(forward);
        if (climiter != null) {
            GostDto climiterResult = GostUtil.AddCLimiters(inNode.getId(), climiter, forward.getConnLimit(), forward.getIpLimit());
            if (!isGostOperationSuccess(climiterResult)) {
                return R.err(climiterResult.getMsg());
            }
        }
        String effectiveLimiter = resolveEffectiveLimiterName(inNode, forward, limiter);
        GostDto result = GostUtil.AddService(inNode.getId(), serviceName, forward.getInPort(), effectiveLimiter, forward.getRemoteAddr(), tunnelType, tunnel, strategy, interfaceName, climiter, forward.getAcceptProxyProtocol(), forward.getSendProxyProtocol());
        return isGostOperationSuccess(result) ? R.ok() : R.err(result.getMsg());
    }

    /**
     * 根据规则的连接数/IP限制配置，决定是否需要连接限制器（复用转发规则自身ID作为限制器名称）
     */
    private Long resolveCLimiterId(Forward forward) {
        boolean hasConnLimit = forward.getConnLimit() != null && forward.getConnLimit() > 0;
        boolean hasIpLimit = forward.getIpLimit() != null && forward.getIpLimit() > 0;
        return (hasConnLimit || hasIpLimit) ? forward.getId() : null;
    }

    /**
     * 综合规则限速、套餐用户限速两个来源，取非零最小值作为该转发规则的最终限速；
     * 均未设置（或均为0）时不下发限速器。
     * legacySpeedLimitId 对应的是已下线的"隧道权限限速规则"功能，调用方现在总是传 null，
     * 保留这个参数只是为了不再牵动上层一串方法签名，属于安全的死代码，不影响行为。
     * 派生限速器统一命名为 "fwd_{forwardId}"，与 SpeedLimit 的纯数字ID命名空间区分，避免冲突。
     */
    private String resolveEffectiveLimiterName(Node inNode, Forward forward, Integer legacySpeedLimitId) {
        List<Integer> candidates = new ArrayList<>();

        if (forward.getSpeedLimit() != null && forward.getSpeedLimit() > 0) {
            candidates.add(forward.getSpeedLimit());
        }

        if (forward.getUserId() != null) {
            User user = userService.getById(forward.getUserId());
            if (user != null && user.getPackageId() != null) {
                PackagePlan plan = packagePlanService.getById(user.getPackageId());
                if (plan != null && plan.getUserSpeedLimit() != null && plan.getUserSpeedLimit() > 0) {
                    candidates.add(plan.getUserSpeedLimit());
                }
            }
        }

        if (legacySpeedLimitId != null) {
            SpeedLimit legacy = speedLimitService.getById(legacySpeedLimitId);
            if (legacy != null && legacy.getSpeed() != null && legacy.getSpeed() > 0) {
                candidates.add(legacy.getSpeed());
            }
        }

        String limiterName = "fwd_" + forward.getId();

        if (candidates.isEmpty()) {
            // 无限速来源：清理可能存在的旧派生限速器（忽略不存在的错误）
            GostUtil.DeleteLimiters(inNode.getId(), limiterName);
            return null;
        }

        int effectiveMbps = Collections.min(candidates);
        String speedMBps = convertMbpsToMBps(effectiveMbps);

        GostDto result = GostUtil.UpdateLimiters(inNode.getId(), limiterName, speedMBps);
        if (result == null || (result.getMsg() != null && result.getMsg().contains(GOST_NOT_FOUND_MSG))) {
            GostUtil.AddLimiters(inNode.getId(), limiterName, speedMBps);
        }
        return limiterName;
    }

    /**
     * Mbps 转 MB/s（除以8，保留1位小数），与 SpeedLimitServiceImpl.convertBitsToMBps 保持一致
     */
    private String convertMbpsToMBps(Integer speedMbps) {
        double mbs = speedMbps / 8.0;
        BigDecimal bd = new BigDecimal(mbs).setScale(1, RoundingMode.HALF_UP);
        return bd.doubleValue() + "";
    }

    /**
     * 更新链服务
     */
    private R updateChainService(Node inNode, String serviceName, String outIp, Integer outPort, String protocol, String interfaceName) {
        // 创建新链
        String remoteAddr = outIp + ":" + outPort;
        if (outIp.contains(":")) {
            remoteAddr = "[" + outIp + "]:" + outPort;
        }
        GostDto createResult = GostUtil.UpdateChains(inNode.getId(), serviceName, remoteAddr, protocol, interfaceName);
        if (createResult.getMsg().contains(GOST_NOT_FOUND_MSG)) {
            createResult = GostUtil.AddChains(inNode.getId(), serviceName, remoteAddr, protocol, interfaceName);
        }
        return isGostOperationSuccess(createResult) ? R.ok() : R.err(createResult.getMsg());
    }

    /**
     * 更新远程服务
     */
    private R updateRemoteService(Node outNode, String serviceName, Forward forward, String protocol, String interfaceName) {
        // 创建新远程服务
        GostDto createResult = GostUtil.UpdateRemoteService(outNode.getId(), serviceName, forward.getOutPort(), forward.getRemoteAddr(), protocol, forward.getStrategy(), interfaceName);
        if (createResult.getMsg().contains(GOST_NOT_FOUND_MSG)) {
            createResult = GostUtil.AddRemoteService(outNode.getId(), serviceName, forward.getOutPort(), forward.getRemoteAddr(), protocol, forward.getStrategy(), interfaceName);
        }
        return isGostOperationSuccess(createResult) ? R.ok() : R.err(createResult.getMsg());
    }

    /**
     * 更新主服务
     */
    private R updateMainService(Node inNode, String serviceName, Forward forward, Integer limiter, Integer tunnelType, Tunnel tunnel, String strategy, String interfaceName) {
        Long climiter = resolveCLimiterId(forward);
        if (climiter != null) {
            GostDto climiterResult = GostUtil.UpdateCLimiters(inNode.getId(), climiter, forward.getConnLimit(), forward.getIpLimit());
            if (climiterResult.getMsg() != null && climiterResult.getMsg().contains(GOST_NOT_FOUND_MSG)) {
                climiterResult = GostUtil.AddCLimiters(inNode.getId(), climiter, forward.getConnLimit(), forward.getIpLimit());
            }
            if (!isGostOperationSuccess(climiterResult)) {
                return R.err(climiterResult.getMsg());
            }
        } else {
            // 限制已关闭，尝试清理可能存在的旧限制器（忽略不存在的错误）
            GostUtil.DeleteCLimiters(inNode.getId(), forward.getId());
        }

        String effectiveLimiter = resolveEffectiveLimiterName(inNode, forward, limiter);
        GostDto result = GostUtil.UpdateService(inNode.getId(), serviceName, forward.getInPort(), effectiveLimiter, forward.getRemoteAddr(), tunnelType, tunnel, strategy, interfaceName, climiter, forward.getAcceptProxyProtocol(), forward.getSendProxyProtocol());

        if (result.getMsg().contains(GOST_NOT_FOUND_MSG)) {
            result = GostUtil.AddService(inNode.getId(), serviceName, forward.getInPort(), effectiveLimiter, forward.getRemoteAddr(), tunnelType, tunnel, strategy, interfaceName, climiter, forward.getAcceptProxyProtocol(), forward.getSendProxyProtocol());
        }

        return isGostOperationSuccess(result) ? R.ok() : R.err(result.getMsg());
    }

    /**
     * 更新转发状态为错误
     */
    private void updateForwardStatusToError(Forward forward) {
        forward.setStatus(FORWARD_STATUS_ERROR);
        this.updateById(forward);
    }

    /**
     * 检查隧道选择是否发生变化（隧道模式与设备组模式统一比较：显式隧道ID + 入口/出口设备组ID）
     */
    private boolean isTunnelChanged(Forward existForward, ForwardUpdateDto updateDto) {
        return isTunnelSelectionChanged(existForward.getTunnelId(), existForward.getInDeviceGroupId(), existForward.getOutDeviceGroupId(),
                updateDto.getTunnelId(), updateDto.getInDeviceGroupId(), updateDto.getOutDeviceGroupId());
    }

    private boolean isTunnelSelectionChanged(Integer oldTunnelId, Long oldInGroupId, Long oldOutGroupId,
                                              Integer newTunnelId, Long newInGroupId, Long newOutGroupId) {
        return !Objects.equals(oldTunnelId, newTunnelId)
                || !Objects.equals(oldInGroupId, newInGroupId)
                || !Objects.equals(oldOutGroupId, newOutGroupId);
    }

    /**
     * 检查Gost操作是否成功
     */
    private boolean isGostOperationSuccess(GostDto gostResult) {
        return Objects.equals(gostResult.getMsg(), GOST_SUCCESS_MSG);
    }


    /**
     * 检查指定的入口端口是否可用（可排除指定的转发ID）
     */
    private boolean isInPortAvailable(Tunnel tunnel, Integer port, Long excludeForwardId) {
        // 获取入口节点信息
        Node inNode = nodeService.getNodeById(tunnel.getInNodeId());
        if (inNode == null) {
            return false;
        }

        // 检查端口是否在节点允许的范围内
        if (port < inNode.getPortSta() || port > inNode.getPortEnd()) {
            return false;
        }

        // 获取该节点上所有已被占用的端口（包括作为入口和出口使用的端口）
        Set<Integer> usedPorts = getAllUsedPortsOnNode(tunnel.getInNodeId(), excludeForwardId);

        // 检查端口是否已被占用（在节点级别检查，考虑入口和出口端口）
        return !usedPorts.contains(port);
    }

    /**
     * 为隧道分配一个可用的入口端口（可排除指定的转发ID）
     */
    private Integer allocateInPort(Tunnel tunnel, Long excludeForwardId) {
        return allocatePortForNode(tunnel.getInNodeId(), excludeForwardId);
    }

    /**
     * 为隧道分配一个可用的出口端口（可排除指定的转发ID）
     */
    private Integer allocateOutPort(Tunnel tunnel, Long excludeForwardId) {
        return allocatePortForNode(tunnel.getOutNodeId(), excludeForwardId);
    }

    /**
     * 为指定节点分配一个可用端口（通用方法）
     *
     * @param nodeId           节点ID
     * @param excludeForwardId 要排除的转发ID
     * @return 可用端口号，如果没有可用端口则返回null
     */
    private Integer allocatePortForNode(Long nodeId, Long excludeForwardId) {
        // 获取节点信息
        Node node = nodeService.getNodeById(nodeId);
        if (node == null) {
            return null;
        }

        // 获取该节点上所有已被占用的端口（包括作为入口和出口使用的端口）
        Set<Integer> usedPorts = getAllUsedPortsOnNode(nodeId, excludeForwardId);

        // 在节点端口范围内寻找未使用的端口
        for (int port = node.getPortSta(); port <= node.getPortEnd(); port++) {
            if (!usedPorts.contains(port)) {
                return port;
            }
        }
        return null;
    }

    /**
     * 获取指定节点上所有已被占用的端口（包括入口和出口端口）
     *
     * @param nodeId           节点ID
     * @param excludeForwardId 要排除的转发ID
     * @return 已占用的端口集合
     */
    private Set<Integer> getAllUsedPortsOnNode(Long nodeId, Long excludeForwardId) {
        Set<Integer> usedPorts = new HashSet<>();

        // 1. 收集该节点作为入口时占用的端口
        List<Tunnel> inTunnels = tunnelService.list(new QueryWrapper<Tunnel>().eq("in_node_id", nodeId));
        if (!inTunnels.isEmpty()) {
            Set<Long> inTunnelIds = inTunnels.stream()
                    .map(Tunnel::getId)
                    .collect(Collectors.toSet());

            QueryWrapper<Forward> inQueryWrapper = new QueryWrapper<Forward>().in("tunnel_id", inTunnelIds);
            if (excludeForwardId != null) {
                inQueryWrapper.ne("id", excludeForwardId);
            }

            List<Forward> inForwards = this.list(inQueryWrapper);
            for (Forward forward : inForwards) {
                if (forward.getInPort() != null) {
                    usedPorts.add(forward.getInPort());
                }
            }
        }

        // 2. 收集该节点作为出口时占用的端口
        List<Tunnel> outTunnels = tunnelService.list(new QueryWrapper<Tunnel>().eq("out_node_id", nodeId));
        if (!outTunnels.isEmpty()) {
            Set<Long> outTunnelIds = outTunnels.stream()
                    .map(Tunnel::getId)
                    .collect(Collectors.toSet());

            QueryWrapper<Forward> outQueryWrapper = new QueryWrapper<Forward>().in("tunnel_id", outTunnelIds);
            if (excludeForwardId != null) {
                outQueryWrapper.ne("id", excludeForwardId);
            }

            List<Forward> outForwards = this.list(outQueryWrapper);
            for (Forward forward : outForwards) {
                if (forward.getOutPort() != null) {
                    usedPorts.add(forward.getOutPort());
                }
            }
        }

        // 3. 收集该节点作为入口/出口设备组时占用的端口（设备组模式转发无 Tunnel 记录，需单独查询）
        List<DeviceGroup> groupsOnNode = deviceGroupService.list(new QueryWrapper<DeviceGroup>().eq("node_id", nodeId));
        if (!groupsOnNode.isEmpty()) {
            Set<Long> groupIds = groupsOnNode.stream()
                    .map(DeviceGroup::getId)
                    .collect(Collectors.toSet());

            QueryWrapper<Forward> groupQueryWrapper = new QueryWrapper<Forward>()
                    .and(w -> w.in("in_device_group_id", groupIds).or().in("out_device_group_id", groupIds));
            if (excludeForwardId != null) {
                groupQueryWrapper.ne("id", excludeForwardId);
            }

            List<Forward> groupForwards = this.list(groupQueryWrapper);
            for (Forward forward : groupForwards) {
                if (forward.getInDeviceGroupId() != null && groupIds.contains(forward.getInDeviceGroupId()) && forward.getInPort() != null) {
                    usedPorts.add(forward.getInPort());
                }
                if (forward.getOutDeviceGroupId() != null && groupIds.contains(forward.getOutDeviceGroupId()) && forward.getOutPort() != null) {
                    usedPorts.add(forward.getOutPort());
                }
            }
        }

        return usedPorts;
    }


    /**
     * 构建服务名称，优化后减少重复查询
     */
    private String buildServiceName(Long forwardId, Integer userId, UserTunnel userTunnel) {
        int userTunnelId = (userTunnel != null) ? userTunnel.getId() : 0;
        return forwardId + "_" + userId + "_" + userTunnelId;
    }


    public void updateForwardA(Forward forward) {
        Tunnel tunnel = tunnelResolver.resolveTunnel(forward);
        if (tunnel == null) {
            return;
        }
        UserTunnel userTunnel = tunnelResolver.resolveUserTunnel(forward.getUserId(), forward);
        NodeInfo nodeInfo = getRequiredNodes(tunnel);
        if (nodeInfo.isHasError()) {
            return;
        }
        // 隧道级别的管理员指派限速已移除，限速统一由规则限速 + 套餐用户限速两者取更严格值决定
        updateGostServices(forward, tunnel, null, nodeInfo, userTunnel);
    }

    @Override
    public R retrySyncForward(Long forwardId) {
        Forward forward = this.getById(forwardId);
        if (forward == null) {
            return R.err("转发规则不存在（可能已被删除）");
        }
        Tunnel tunnel = tunnelResolver.resolveTunnel(forward);
        if (tunnel == null) {
            return R.err("隧道不存在");
        }
        if (tunnel.getStatus() != TUNNEL_STATUS_ACTIVE) {
            return R.err("隧道已禁用");
        }
        UserTunnel userTunnel = tunnelResolver.resolveUserTunnel(forward.getUserId(), forward);
        NodeInfo nodeInfo = getRequiredNodes(tunnel);
        if (nodeInfo.isHasError()) {
            return R.err(nodeInfo.getErrorMessage());
        }
        return updateGostServices(forward, tunnel, null, nodeInfo, userTunnel);
    }


    // ========== 内部数据类 ==========

    /**
     * 用户信息封装类
     */
    @Data
    private static class UserInfo {
        private final Integer userId;
        private final Integer roleId;
        private final String userName;
    }

    /**
     * 用户权限检查结果
     */
    @Data
    private static class UserPermissionResult {
        private final boolean hasError;
        private final String errorMessage;
        private final Integer limiter;
        private final UserTunnel userTunnel;

        private UserPermissionResult(boolean hasError, String errorMessage, Integer limiter, UserTunnel userTunnel) {
            this.hasError = hasError;
            this.errorMessage = errorMessage;
            this.limiter = limiter;
            this.userTunnel = userTunnel;
        }

        public static UserPermissionResult success(Integer limiter, UserTunnel userTunnel) {
            return new UserPermissionResult(false, null, limiter, userTunnel);
        }

        public static UserPermissionResult error(String errorMessage) {
            return new UserPermissionResult(true, errorMessage, null, null);
        }
    }

    /**
     * 端口分配结果
     */
    @Data
    private static class PortAllocation {
        private final boolean hasError;
        private final String errorMessage;
        private final Integer inPort;
        private final Integer outPort;

        private PortAllocation(boolean hasError, String errorMessage, Integer inPort, Integer outPort) {
            this.hasError = hasError;
            this.errorMessage = errorMessage;
            this.inPort = inPort;
            this.outPort = outPort;
        }

        public static PortAllocation success(Integer inPort, Integer outPort) {
            return new PortAllocation(false, null, inPort, outPort);
        }

        public static PortAllocation error(String errorMessage) {
            return new PortAllocation(true, errorMessage, null, null);
        }
    }

    /**
     * 节点信息封装类
     */
    @Data
    private static class NodeInfo {
        private final boolean hasError;
        private final String errorMessage;
        private final Node inNode;
        private final Node outNode;

        private NodeInfo(boolean hasError, String errorMessage, Node inNode, Node outNode) {
            this.hasError = hasError;
            this.errorMessage = errorMessage;
            this.inNode = inNode;
            this.outNode = outNode;
        }

        public static NodeInfo success(Node inNode, Node outNode) {
            return new NodeInfo(false, null, inNode, outNode);
        }

        public static NodeInfo error(String errorMessage) {
            return new NodeInfo(true, errorMessage, null, null);
        }
    }

    /**
     * 诊断结果数据类
     */
    @Data
    public static class DiagnosisResult {
        private Long nodeId;
        private String nodeName;
        /** 该诊断段所属的设备组ID（旧版隧道模式无设备组概念时为空），供前端展示 GID */
        private Long groupId;
        /** inbound-入口诊断，outbound-出口诊断，供前端分区展示 */
        private String leg;
        private String targetIp;
        private Integer targetPort;
        private String description;
        private boolean success;
        private String message;
        private double averageTime;
        private double packetLoss;
        private long timestamp;
        /** 是否连消息都没能发送到节点（节点离线/连接已断开/发送异常），区别于"发送成功但目标不可达" */
        private boolean dispatchFailed;
        /** 是否成功收到节点回复（无论 ping 本身是否成功），用于统计"回收任务"数 */
        private boolean recovered;
        /** 每一次 TCP 连接尝试的明细：{seq, success, timeMs, error}，供前端逐行展示（类似 ping 输出） */
        private List<Map<String, Object>> attempts;
    }
}
