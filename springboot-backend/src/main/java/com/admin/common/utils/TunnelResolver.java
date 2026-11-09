package com.admin.common.utils;

import com.admin.entity.DeviceGroup;
import com.admin.entity.Forward;
import com.admin.entity.Node;
import com.admin.entity.Tunnel;
import com.admin.entity.User;
import com.admin.entity.UserTunnel;
import com.admin.service.DeviceGroupService;
import com.admin.service.NodeService;
import com.admin.service.TunnelService;
import com.admin.service.UserService;
import com.admin.service.UserTunnelService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 转发规则的隧道/用户隧道解析器。
 * <p>
 * 转发规则有两种入口方式：选择既有的 Tunnel（旧版），或直接选择入口/出口设备组。
 * 设备组模式不会创建任何 Tunnel/UserTunnel 记录——本类为这种模式在内存中拼出
 * 与真实 Tunnel/UserTunnel 形状一致、但不落库的等效对象，使既有的转发管线
 * （端口分配、限额检查、gost 配置生成等）可以在两种模式下复用同一套逻辑。
 * </p>
 */
@Component
public class TunnelResolver {

    /**
     * 设备组模式下拼出的合成 UserTunnel 固定使用该 id（UserTunnel 为正整数自增列，
     * -1 保证不会与任何真实记录冲突）。也是 gost 服务名中第三段的取值来源，
     * 与代表"管理员转发，完全跳过限额检查"的 "0" 语义不同——它表示
     * "没有隧道级授权可查，但仍需检查账号自身额度"。
     */
    public static final int DEVICE_GROUP_USER_TUNNEL_ID = -1;

    @Resource
    private TunnelService tunnelService;

    @Resource
    private DeviceGroupService deviceGroupService;

    @Resource
    private UserTunnelService userTunnelService;

    @Resource
    private UserService userService;

    @Resource
    private NodeService nodeService;

    /**
     * 解析转发规则对应的 Tunnel：旧版模式查真实记录；设备组模式在内存中拼出等效对象。
     */
    public Tunnel resolveTunnel(Forward forward) {
        if (forward == null) return null;
        Tunnel tunnel = resolveTunnel(forward.getTunnelId(), forward.getInDeviceGroupId(), forward.getOutDeviceGroupId());
        // 已有规则的备用出口以创建/更新时记录的为准（暂停、恢复、删除、重新推送都按它），
        // 不随出口设备组之后的故障转移组设置变化
        if (tunnel != null && forward.getTunnelId() == null && tunnel.getOutNodeId() != null) {
            applyBackups(tunnel, ExitFailover.parse(forward.getBackupOutNodeIds()));
        }
        return tunnel;
    }

    /**
     * 基于原始字段（而非已落库的 Forward）解析 Tunnel，供创建/更新转发时、
     * Forward 尚未落库前的校验复用。
     */
    public Tunnel resolveTunnel(Integer tunnelId, Long inDeviceGroupId, Long outDeviceGroupId) {
        if (tunnelId != null) {
            return tunnelService.getById(tunnelId);
        }
        return buildSyntheticTunnel(inDeviceGroupId, outDeviceGroupId);
    }

    /**
     * 直接根据入口/出口设备组ID拼出内存中的等效 Tunnel（不落库），供创建转发前的校验复用。
     * inIp/outIp 的取值规则与 TunnelServiceImpl 创建真实隧道时一致：
     * inIp 取入口节点的 ip；outIp 端口转发（无出口组）取入口节点的 serverIp（自环），
     * 隧道转发（有出口组）取出口节点的 serverIp。
     */
    public Tunnel buildSyntheticTunnel(Long inDeviceGroupId, Long outDeviceGroupId) {
        if (inDeviceGroupId == null) return null;
        DeviceGroup inGroup = deviceGroupService.getById(inDeviceGroupId);
        if (inGroup == null) return null;

        Node inNode = nodeService.getById(inGroup.getNodeId());
        if (inNode == null) return null;

        DeviceGroup outGroup = null;
        Node outNode = null;
        if (outDeviceGroupId != null) {
            outGroup = deviceGroupService.getById(outDeviceGroupId);
            if (outGroup == null) return null;
            outNode = nodeService.getById(outGroup.getNodeId());
            if (outNode == null) return null;
        }

        Tunnel tunnel = new Tunnel();
        tunnel.setInNodeId(inGroup.getNodeId());
        tunnel.setInIp(inNode.getIp());
        tunnel.setOutNodeId(outGroup != null ? outGroup.getNodeId() : null);
        tunnel.setOutIp(outNode != null ? outNode.getServerIp() : inNode.getServerIp());
        tunnel.setType(outGroup != null ? 2 : 1); // 2-隧道转发，1-端口转发
        // 协议由出口设备组自身配置决定（未配置或未选择时默认 tls）；仅端口转发（无出口组）时该值不会被实际用到
        tunnel.setProtocol(outGroup != null && outGroup.getProtocol() != null && !outGroup.getProtocol().trim().isEmpty() ? outGroup.getProtocol() : "tls");
        tunnel.setTcpListenAddr("0.0.0.0");
        tunnel.setUdpListenAddr("0.0.0.0");
        tunnel.setUdpSourceInOut(inGroup.getUdpSourceInOut() != null && inGroup.getUdpSourceInOut() == 1);
        tunnel.setFlow(2);
        tunnel.setTrafficRatio(inGroup.getRatio() != null ? inGroup.getRatio() : BigDecimal.ONE);
        tunnel.setStatus(1);
        if (outGroup != null) {
            applyBackups(tunnel, resolveBackupNodeIds(outGroup, inGroup.getNodeId(), outGroup.getNodeId()));
        }
        return tunnel;
    }

    /**
     * 按出口设备组的「故障转移组」解析备用出口节点：沿着 failoverGroupId 依次往下找，
     * 最多 {@link ExitFailover#MAX_BACKUPS} 个；遇到没配置、已被删除、不是出口类型、节点不存在、
     * 循环引用，或与入口节点、前面已选的出口是同一个节点时，该项和之后的都不要。
     */
    List<Long> resolveBackupNodeIds(DeviceGroup outGroup, Long inNodeId, Long primaryNodeId) {
        List<Long> result = new ArrayList<>();
        Set<Long> visitedGroups = new HashSet<>();
        Set<Long> usedNodes = new HashSet<>();
        usedNodes.add(primaryNodeId);
        if (inNodeId != null) {
            usedNodes.add(inNodeId);
        }
        visitedGroups.add(outGroup.getId());
        Long nextId = outGroup.getFailoverGroupId();
        while (nextId != null && nextId > 0 && result.size() < ExitFailover.MAX_BACKUPS) {
            if (!visitedGroups.add(nextId)) {
                break;
            }
            DeviceGroup backup = deviceGroupService.getById(nextId);
            if (backup == null || backup.getNodeId() == null
                    || !("outbound".equals(backup.getDirection()) || "both".equals(backup.getDirection()))) {
                break;
            }
            if (nodeService.getById(backup.getNodeId()) == null || !usedNodes.add(backup.getNodeId())) {
                break;
            }
            result.add(backup.getNodeId());
            nextId = backup.getFailoverGroupId();
        }
        return result;
    }

    /** 把备用出口节点 ID 按优先级写进隧道（连同各自的连接地址）；节点已不存在的跳过 */
    private void applyBackups(Tunnel tunnel, List<Long> backupNodeIds) {
        List<Long> ids = new ArrayList<>();
        List<String> ips = new ArrayList<>();
        for (Long nodeId : backupNodeIds) {
            if (nodeId == null || nodeId.equals(tunnel.getOutNodeId()) || ids.contains(nodeId)) {
                continue;
            }
            Node node = nodeService.getById(nodeId);
            if (node == null || node.getServerIp() == null || node.getServerIp().isEmpty()) {
                continue;
            }
            ids.add(nodeId);
            ips.add(node.getServerIp());
        }
        tunnel.setBackupOutNodeIds(ids);
        tunnel.setBackupOutIps(ips);
    }

    /**
     * 解析转发规则拥有者对该转发的用户隧道授权：旧版模式查真实记录；
     * 设备组模式在内存中拼出以账号自身额度为准的等效对象（id 固定为 -1）。
     * 管理员（无需授权）返回 null，与既有语义保持一致。
     */
    public UserTunnel resolveUserTunnel(Integer userId, Forward forward) {
        if (forward == null || userId == null) return null;
        return resolveUserTunnel(userId, forward.getTunnelId(), forward.getInDeviceGroupId());
    }

    /**
     * 基于原始字段（而非已落库的 Forward）解析用户隧道授权，供创建/更新转发时、
     * Forward 尚未落库前的校验复用。
     */
    public UserTunnel resolveUserTunnel(Integer userId, Integer tunnelId, Long inDeviceGroupId) {
        if (userId == null) return null;
        if (tunnelId != null) {
            return userTunnelService.getOne(new QueryWrapper<UserTunnel>()
                    .eq("user_id", userId)
                    .eq("tunnel_id", tunnelId));
        }
        if (inDeviceGroupId == null) return null;

        User user = userService.getById(userId);
        if (user == null) return null;

        UserTunnel synthetic = new UserTunnel();
        synthetic.setId(DEVICE_GROUP_USER_TUNNEL_ID);
        synthetic.setUserId(userId);
        synthetic.setTunnelId(null);
        synthetic.setFlow(user.getFlow());
        synthetic.setInFlow(user.getInFlow());
        synthetic.setOutFlow(user.getOutFlow());
        synthetic.setExpTime(user.getExpTime());
        synthetic.setFlowResetTime(user.getFlowResetTime());
        synthetic.setNum(user.getNum());
        synthetic.setStatus(1);
        synthetic.setSpeedId(null);
        return synthetic;
    }

    /**
     * 拼接 gost 服务名："forwardId_userId_userTunnelId"，userTunnelId 为 null 时使用 "0"
     * （管理员转发的既有约定），设备组模式普通用户转发使用 {@link #DEVICE_GROUP_USER_TUNNEL_ID}。
     */
    public String buildServiceName(Long forwardId, Integer userId, Integer userTunnelId) {
        return forwardId + "_" + userId + "_" + (userTunnelId != null ? userTunnelId : 0);
    }
}
