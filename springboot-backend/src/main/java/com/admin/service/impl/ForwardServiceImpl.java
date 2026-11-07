package com.admin.service.impl;

import com.admin.common.dto.ForwardDto;
import com.admin.common.dto.ForwardUpdateDto;
import com.admin.common.dto.ForwardWithTunnelDto;
import com.admin.common.dto.GostDto;
import com.admin.common.dto.TcpPingDiagnosisResult;
import com.admin.common.lang.R;
import com.admin.common.utils.GostUtil;
import com.admin.common.utils.JwtUtil;
import com.admin.common.utils.TcpPingDiagnosisUtil;
import com.admin.common.utils.TunnelResolver;
import com.admin.common.utils.WebSocketServer;
import com.admin.entity.*;
import com.admin.mapper.ForwardMapper;
import com.admin.service.*;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.alibaba.fastjson.JSONObject;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import javax.annotation.Resource;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
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
    /** 无套餐、流量用完、账号到期导致不能创建或修改规则时返回的状态码 */
    private static final int RULE_SERVICE_BLOCKED_CODE = 403;

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

    /**
     * 端口分配 -> 落库 这段临界区的互斥锁：避免并发创建/更新转发规则时，
     * 两个请求都在对方尚未提交端口占用记录前查到"端口空闲"，进而对同一物理端口
     * 各自向节点下发监听，导致 gost 侧出现 "address already in use"。
     */
    private final Object portAllocationLock = new Object();

    @Override
    public R createForward(ForwardDto forwardDto) {
        // 1. 获取当前用户信息
        UserInfo currentUser = getCurrentUserInfo();

        // 1.0 管理员可通过 userId 指定代哪个用户创建转发规则（用户管理页"管理转发规则"入口）；
        // 非管理员忽略该字段，规则归属始终是自己。管理员代用户创建时，规则的权限/额度校验按该用户
        // 自己的额度进行（与编辑他人转发时的既有规则一致），而不是套用管理员自身不受限的权限
        UserInfo effectiveUser = currentUser;
        if (currentUser.getRoleId() == ADMIN_ROLE_ID && forwardDto.getUserId() != null
                && !forwardDto.getUserId().equals(currentUser.getUserId())) {
            User targetUser = userService.getById(forwardDto.getUserId());
            if (targetUser == null) {
                return R.err("目标用户不存在");
            }
            effectiveUser = new UserInfo(targetUser.getId().intValue(), targetUser.getRoleId(), targetUser.getUser());
        }

        // 1.0.1 规则归属者没有套餐、流量用完或账号到期时不能创建规则；提前检查，避免先提示没有隧道权限
        if (effectiveUser.getRoleId() != ADMIN_ROLE_ID) {
            String blockReason = ruleServiceBlockReason(userService.getById(effectiveUser.getUserId()), System.currentTimeMillis());
            if (blockReason != null) {
                return R.err(RULE_SERVICE_BLOCKED_CODE, blockReason);
            }
        }

        // 1.1 校验隧道选择方式：显式隧道 或 入口/出口设备组，二选一（沿用发起请求者本人的身份校验，
        // 管理员可自由选择任意设备组，不受目标用户所在用户组限制）
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

        // 3. 权限和限制检查（按规则归属者 effectiveUser 校验，管理员创建自己的规则时两者相同）
        UserTunnel userTunnel = tunnelResolver.resolveUserTunnel(effectiveUser.getUserId(), forwardDto.getTunnelId(), forwardDto.getInDeviceGroupId());
        UserPermissionResult permissionResult = checkUserPermissions(effectiveUser, tunnel, userTunnel, null);
        if (permissionResult.isHasError()) {
            return R.err(permissionResult.getErrorMessage());
        }

        // 4~5. 分配端口并落库：加锁保证"查端口是否空闲"与"落库占用该端口"是原子的，
        // 否则并发的两个创建/更新请求可能都读到端口空闲，各自往同一物理端口下发监听
        Forward forward;
        synchronized (portAllocationLock) {
            // 4. 分配端口
            PortAllocation portAllocation = allocatePorts(tunnel, forwardDto.getInPort());
            if (portAllocation.isHasError()) {
                return R.err(portAllocation.getErrorMessage());
            }

            // 5. 创建并保存Forward对象（归属 effectiveUser，即目标用户）
            forward = createForwardEntity(forwardDto, effectiveUser, portAllocation);
            if (!this.save(forward)) {
                return R.err("端口转发创建失败");
            }
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
            // 更新成功后规则会被设为运行中并重新下发，不拦截的话流量用完被暂停的规则改一下就恢复了。
            // 只拦普通用户本人：隧道变更时 TunnelServiceImpl 会以管理员身份批量同步规则，不能被个别用户卡住
            String blockReason = ruleServiceBlockReason(user, System.currentTimeMillis());
            if (blockReason != null) {
                return R.err(RULE_SERVICE_BLOCKED_CODE, blockReason);
            }
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

        // 6~9. 更新Forward对象、下发Gost配置、落库：与创建共用同一把锁，避免并发的创建/更新
        // 请求都读到目标端口空闲、各自往同一物理端口下发监听（见 portAllocationLock 上的说明）
        synchronized (portAllocationLock) {
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

        // 2.1 规则被暂停/异常时，转发本身没在运行，诊断没有意义，拒绝执行
        // （前端按钮已经据此禁用，这里是防止绕过前端直接调接口）
        if (forward.getStatus() == null || forward.getStatus() != FORWARD_STATUS_ACTIVE) {
            return R.err("转发规则未处于正常状态，暂不能诊断");
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

        // 5. 按隧道类型生成要诊断的目标，按「站点设置·诊断连接次数」逐个执行
        List<TcpPingDiagnosisUtil.Probe> probes;
        try {
            probes = buildDiagnosisProbes(forward, tunnel, inNode);
        } catch (IllegalArgumentException e) {
            return R.err(e.getMessage());
        }
        List<TcpPingDiagnosisResult> results = new ArrayList<>();
        for (TcpPingDiagnosisUtil.Probe probe : probes) {
            results.add(TcpPingDiagnosisUtil.run(probe));
        }

        // 7. 构建诊断报告
        // 面板反馈按连接尝试统计：入口端反馈与出口端反馈的连接明细合计
        Map<String, Object> dispatchStats = TcpPingDiagnosisUtil.buildDispatchStats(results);

        Map<String, Object> diagnosisReport = new HashMap<>();
        diagnosisReport.put("forwardId", id);
        diagnosisReport.put("forwardName", forward.getName());
        diagnosisReport.put("tunnelType", tunnel.getType() == TUNNEL_TYPE_PORT_FORWARD ? "端口转发" : "隧道转发");
        diagnosisReport.put("results", results);
        diagnosisReport.put("dispatchStats", dispatchStats);
        diagnosisReport.put("timestamp", System.currentTimeMillis());

        return R.ok(diagnosisReport);
    }

    /**
     * 诊断详情：用户点开某一段的详细结果时，只对这一段重新测试，连接次数使用「站点设置·诊断详情连接次数」，
     * 与首次诊断的次数分开。目标必须是该转发规则本来要诊断的那几个（段类型 + 地址 + 端口），防止借此让节点测任意地址
     */
    @Override
    public R diagnoseForwardDetail(Long id, String leg, String targetIp, Integer targetPort) {
        UserInfo currentUser = getCurrentUserInfo();
        Forward forward = validateForwardExists(id, currentUser);
        if (forward == null) {
            return R.err("转发不存在");
        }
        if (forward.getStatus() == null || forward.getStatus() != FORWARD_STATUS_ACTIVE) {
            return R.err("转发规则未处于正常状态，暂不能诊断");
        }
        Tunnel tunnel = tunnelResolver.resolveTunnel(forward);
        if (tunnel == null) {
            return R.err("隧道不存在");
        }
        Node inNode = nodeService.getNodeById(tunnel.getInNodeId());
        if (inNode == null) {
            return R.err("入口节点不存在");
        }
        List<TcpPingDiagnosisUtil.Probe> probes;
        try {
            probes = buildDiagnosisProbes(forward, tunnel, inNode);
        } catch (IllegalArgumentException e) {
            return R.err(e.getMessage());
        }
        TcpPingDiagnosisUtil.Probe probe = TcpPingDiagnosisUtil.findProbe(probes, leg, targetIp, targetPort);
        if (probe == null) {
            return R.err("诊断目标不属于该转发规则");
        }
        return R.ok(TcpPingDiagnosisUtil.run(probe, TcpPingDiagnosisUtil.getDetailPingCount()));
    }

    /**
     * 生成转发规则要诊断的目标：端口转发是入口节点直接测目标地址；隧道转发是入口测出口、出口测目标地址。
     * 地址无法解析、出口节点不存在时抛 IllegalArgumentException，消息即返回给前端的原因
     */
    private List<TcpPingDiagnosisUtil.Probe> buildDiagnosisProbes(Forward forward, Tunnel tunnel, Node inNode) {
        List<TcpPingDiagnosisUtil.Probe> probes = new ArrayList<>();
        String[] remoteAddresses = forward.getRemoteAddr().split(",");
        if (tunnel.getType() == TUNNEL_TYPE_PORT_FORWARD) {
            // 端口转发：入口节点直接TCP ping目标地址
            for (String remoteAddress : remoteAddresses) {
                String targetIp = extractIpFromAddress(remoteAddress);
                int targetPort = extractPortFromAddress(remoteAddress);
                if (targetIp == null || targetPort == -1) {
                    throw new IllegalArgumentException("无法解析目标地址: " + remoteAddress);
                }
                probes.add(new TcpPingDiagnosisUtil.Probe(inNode, targetIp, targetPort, "转发->目标", "inbound", forward.getInDeviceGroupId()));
            }
        } else {
            // 隧道转发：入口TCP ping出口，出口TCP ping目标
            Node outNode = nodeService.getNodeById(tunnel.getOutNodeId());
            if (outNode == null) {
                throw new IllegalArgumentException("出口节点不存在");
            }
            // 入口TCP ping出口（使用转发的出口端口）
            probes.add(new TcpPingDiagnosisUtil.Probe(inNode, outNode.getServerIp(), forward.getOutPort(), "入口->出口", "inbound", forward.getInDeviceGroupId()));
            for (String remoteAddress : remoteAddresses) {
                String targetIp = extractIpFromAddress(remoteAddress);
                int targetPort = extractPortFromAddress(remoteAddress);
                if (targetIp == null || targetPort == -1) {
                    throw new IllegalArgumentException("无法解析目标地址: " + remoteAddress);
                }
                probes.add(new TcpPingDiagnosisUtil.Probe(outNode, targetIp, targetPort, "出口->目标", "outbound", forward.getOutDeviceGroupId()));
            }
        }
        return probes;
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
        List<Long> allowedUserGroupIds = deviceGroupService.getUserGroupIds(group.getId());
        if (allowedUserGroupIds.isEmpty()) {
            return R.ok();
        }
        User user = userService.getById(userId);
        if (user == null || user.getGroupId() == null || !allowedUserGroupIds.contains(user.getGroupId())) {
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
        // 账号到期、无套餐、流量用完已由 ruleServiceBlockReason 在创建和更新入口拦截
        User userInfo = userService.getById(currentUser.getUserId());

        // 检查用户隧道权限
        if (userTunnel == null) {
            return UserPermissionResult.error("你没有该隧道权限");
        }

        if (userTunnel.getStatus() != 1) {
            return UserPermissionResult.error("隧道被禁用");
        }

        // 转发数量限制检查
        R quotaCheckResult = checkForwardQuota(currentUser.getUserId(), userInfo, excludeForwardId);
        if (quotaCheckResult.getCode() != 0) {
            return UserPermissionResult.error(quotaCheckResult.getMsg());
        }

        return UserPermissionResult.success(null, userTunnel);
    }

    /**
     * 规则归属者当前能否使用转发服务，不能时返回原因，能用时返回 null。
     * 无套餐按「没有流量配额」判断：管理员在用户管理里手动设置了流量的无套餐用户仍可使用。
     */
    static String ruleServiceBlockReason(User user, long now) {
        if (user == null) {
            return "用户不存在";
        }
        if (user.getExpTime() != null && user.getExpTime() <= now) {
            return "当前账号已到期";
        }
        if (Integer.valueOf(0).equals(user.getStatus())) {
            return "用户已被禁用";
        }
        long flowLimit = user.getFlow() == null ? 0L : user.getFlow();
        if (flowLimit <= 0) {
            return user.getPackageId() == null ? "用户未购买套餐" : "用户流量已用完";
        }
        long used = (user.getInFlow() == null ? 0L : user.getInFlow()) + (user.getOutFlow() == null ? 0L : user.getOutFlow());
        return used >= flowLimit * BYTES_TO_GB ? "用户流量已用完" : null;
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
        String blockReason = ruleServiceBlockReason(userService.getById(userId), System.currentTimeMillis());
        if (blockReason != null) {
            return R.err(RULE_SERVICE_BLOCKED_CODE, blockReason);
        }

        UserTunnel userTunnel = tunnelResolver.resolveUserTunnel(userId, forward);
        if (userTunnel == null) {
            return R.err("你没有该隧道权限");
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
        GostDto result = GostUtil.AddRemoteService(outNode.getId(), serviceName, forward.getOutPort(), forward.getRemoteAddr(), protocol, forward.getStrategy(), forward.getWeights(), interfaceName);
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
        GostDto result = GostUtil.AddService(inNode.getId(), serviceName, forward.getInPort(), effectiveLimiter, forward.getRemoteAddr(), tunnelType, tunnel, strategy, forward.getWeights(), interfaceName, climiter, forward.getAcceptProxyProtocol(), forward.getSendProxyProtocol());
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
        GostDto createResult = GostUtil.UpdateRemoteService(outNode.getId(), serviceName, forward.getOutPort(), forward.getRemoteAddr(), protocol, forward.getStrategy(), forward.getWeights(), interfaceName);
        if (createResult.getMsg().contains(GOST_NOT_FOUND_MSG)) {
            createResult = GostUtil.AddRemoteService(outNode.getId(), serviceName, forward.getOutPort(), forward.getRemoteAddr(), protocol, forward.getStrategy(), forward.getWeights(), interfaceName);
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
        GostDto result = GostUtil.UpdateService(inNode.getId(), serviceName, forward.getInPort(), effectiveLimiter, forward.getRemoteAddr(), tunnelType, tunnel, strategy, forward.getWeights(), interfaceName, climiter, forward.getAcceptProxyProtocol(), forward.getSendProxyProtocol());

        if (result.getMsg().contains(GOST_NOT_FOUND_MSG)) {
            result = GostUtil.AddService(inNode.getId(), serviceName, forward.getInPort(), effectiveLimiter, forward.getRemoteAddr(), tunnelType, tunnel, strategy, forward.getWeights(), interfaceName, climiter, forward.getAcceptProxyProtocol(), forward.getSendProxyProtocol());
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

    /** 限速刷新要逐条规则往节点发消息（节点离线时每条最多等 10 秒），放在单独的单线程里按顺序跑，不占公共线程池 */
    private static final ExecutorService limitRefreshExecutor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "forward-limit-refresh");
        thread.setDaemon(true);
        return thread;
    });

    @Override
    public void refreshLimitsAfterCommit(Collection<Integer> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return;
        }
        List<Integer> ids = new ArrayList<>(new LinkedHashSet<>(userIds));
        Runnable task = () -> limitRefreshExecutor.execute(() -> refreshLimitsForUsers(ids));
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    task.run();
                }
            });
        } else {
            task.run();
        }
    }

    /**
     * 只处理正在运行（状态正常）的规则：已暂停或异常的规则服务不在运行，等它们恢复、保存时会按最新的套餐限速重新下发
     */
    private void refreshLimitsForUsers(List<Integer> userIds) {
        List<Forward> forwards = this.list(new QueryWrapper<Forward>()
                .in("user_id", userIds)
                .eq("status", FORWARD_STATUS_ACTIVE));
        log.info("套餐变化，刷新 {} 个用户名下 {} 条运行中规则的限速", userIds.size(), forwards.size());
        for (Forward forward : forwards) {
            try {
                refreshForwardLimits(forward);
            } catch (Exception e) {
                log.warn("刷新转发 {} 的限速失败: {}", forward.getId(), e.getMessage());
            }
        }
    }

    /**
     * 只更新入口节点上的主服务（限速器、连接限制器都挂在它上面），不动链和远程服务，
     * 也不会因为节点离线等原因把规则状态改成异常——离线的节点上线后，规则本身的同步重试机制会按最新配置补推
     */
    private void refreshForwardLimits(Forward forward) {
        Tunnel tunnel = tunnelResolver.resolveTunnel(forward);
        if (tunnel == null || tunnel.getStatus() == null || tunnel.getStatus() != TUNNEL_STATUS_ACTIVE) {
            return;
        }
        NodeInfo nodeInfo = getRequiredNodes(tunnel);
        if (nodeInfo.isHasError()) {
            return;
        }
        UserTunnel userTunnel = tunnelResolver.resolveUserTunnel(forward.getUserId(), forward);
        String serviceName = buildServiceName(forward.getId(), forward.getUserId(), userTunnel);
        String interfaceName = tunnel.getType() != TUNNEL_TYPE_TUNNEL_FORWARD ? forward.getInterfaceName() : null;
        R result = updateMainService(nodeInfo.getInNode(), serviceName, forward, null, tunnel.getType(), tunnel, forward.getStrategy(), interfaceName);
        if (result.getCode() != 0) {
            log.warn("刷新转发 {} 的限速失败: {}", forward.getId(), result.getMsg());
        }
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
        boolean paused = Objects.equals(forward.getStatus(), FORWARD_STATUS_PAUSED);
        R pushResult = updateGostServices(forward, tunnel, null, nodeInfo, userTunnel);
        if (!paused) {
            return pushResult;
        }
        return keepPausedAfterPush(forward, tunnel, buildServiceName(forward.getId(), forward.getUserId(), userTunnel), pushResult);
    }

    /**
     * 节点更新配置时会关闭旧服务再启动新服务，暂停状态随之丢失。已暂停的规则仍要同步配置，
     * 否则恢复时用的是旧配置，所以推送后立刻重新暂停；任何一步失败都返回错误，由队列继续重试。
     */
    R keepPausedAfterPush(Forward forward, Tunnel tunnel, String serviceName, R pushResult) {
        if (pushResult.getCode() != 0) {
            // 推送失败时规则被标成了异常，不还原的话下次重试就不再重新暂停，规则会恢复运行
            forward.setStatus(FORWARD_STATUS_PAUSED);
            restorePausedStatus(forward.getId());
            return pushResult;
        }
        GostDto pauseResult = pauseOnNode(tunnel.getInNodeId(), serviceName);
        if (!isGostOperationSuccess(pauseResult)) {
            return R.err("重新暂停服务失败：" + pauseResult.getMsg());
        }
        if (tunnel.getType() == TUNNEL_TYPE_TUNNEL_FORWARD) {
            GostDto remoteResult = pauseRemoteOnNode(tunnel.getOutNodeId(), serviceName);
            if (!isGostOperationSuccess(remoteResult)) {
                return R.err("重新暂停远端服务失败：" + remoteResult.getMsg());
            }
        }
        return pushResult;
    }

    void restorePausedStatus(Long forwardId) {
        this.update(null, new UpdateWrapper<Forward>().eq("id", forwardId).set("status", FORWARD_STATUS_PAUSED));
    }

    GostDto pauseOnNode(Long nodeId, String serviceName) {
        return GostUtil.PauseService(nodeId, serviceName);
    }

    GostDto pauseRemoteOnNode(Long nodeId, String serviceName) {
        return GostUtil.PauseRemoteService(nodeId, serviceName);
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

}
