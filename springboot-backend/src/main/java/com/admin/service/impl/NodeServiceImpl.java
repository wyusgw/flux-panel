package com.admin.service.impl;

import cn.hutool.core.util.IdUtil;
import cn.hutool.core.util.StrUtil;
import com.admin.common.dto.GostDto;
import com.admin.common.dto.NodeDto;
import com.admin.common.dto.NodeUpdateDto;
import com.admin.common.lang.R;
import com.admin.common.utils.JwtUtil;
import com.admin.common.utils.WebSocketServer;
import com.admin.entity.DeviceGroup;
import com.admin.entity.DeviceGroupUserGroupRelation;
import com.admin.entity.Forward;
import com.admin.entity.Node;
import com.admin.entity.NodeGroupRelation;
import com.admin.entity.Tunnel;
import com.admin.entity.User;
import com.admin.entity.ViteConfig;
import com.admin.mapper.DeviceGroupMapper;
import com.admin.mapper.DeviceGroupUserGroupRelationMapper;
import com.admin.mapper.ForwardMapper;
import com.admin.mapper.NodeGroupRelationMapper;
import com.admin.mapper.NodeMapper;
import com.admin.mapper.TunnelMapper;
import com.admin.mapper.UserMapper;
import com.admin.service.NodeService;
import com.admin.service.TunnelService;
import com.admin.service.ViteConfigService;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.beans.BeanUtils;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;

/**
 * <p>
 * 节点服务实现类
 * 提供节点的增删改查功能，包括节点创建、更新、删除和查询操作
 * </p>
 *
 * @author QAQ
 * @since 2025-06-03
 */
@Service
public class NodeServiceImpl extends ServiceImpl<NodeMapper, Node> implements NodeService {

    // ========== 常量定义 ==========
    
    /** 节点默认状态：启用 */
    private static final int NODE_STATUS_ACTIVE = 0;
    
    /** 成功响应消息 */
    private static final String SUCCESS_CREATE_MSG = "节点创建成功";
    private static final String SUCCESS_UPDATE_MSG = "节点更新成功";
    private static final String SUCCESS_DELETE_MSG = "节点删除成功";
    
    /** 错误响应消息 */
    private static final String ERROR_CREATE_MSG = "节点创建失败";
    private static final String ERROR_UPDATE_MSG = "节点更新失败";
    private static final String ERROR_DELETE_MSG = "节点删除失败";
    private static final String ERROR_NODE_NOT_FOUND = "节点不存在";
    static final String ERROR_ADDRESS_REQUIRED = "除仅监控外，设备必须填写服务器 IP / 域名";
    
    /** 隧道使用检查相关消息 */
    private static final String ERROR_IN_NODE_IN_USE = "该节点还有 %d 个隧道作为入口节点在使用，请先删除相关隧道";
    private static final String ERROR_OUT_NODE_IN_USE = "该节点还有 %d 个隧道作为出口节点在使用，请先删除相关隧道";
    
    /** 端口范围验证相关消息 */
    private static final String ERROR_PORT_STA_REQUIRED = "起始端口不能为空";
    private static final String ERROR_PORT_END_REQUIRED = "结束端口不能为空";
    private static final String ERROR_PORT_RANGE_INVALID = "端口必须在1-65535范围内";
    private static final String ERROR_PORT_ORDER_INVALID = "结束端口不能小于起始端口";

    // ========== 依赖注入 ==========
    
    /** 发布版本和该版本 install.sh 的校验值，由发布流程写入镜像 */
    @Value("${RELEASE_TAG:}")
    private String releaseTag;

    @Value("${NODE_INSTALL_SHA256:}")
    private String installScriptSha256;

    @Resource
    private TunnelMapper tunnelMapper;

    @Resource
    private DeviceGroupMapper deviceGroupMapper;

    @Resource
    private NodeGroupRelationMapper nodeGroupRelationMapper;

    @Resource
    private DeviceGroupUserGroupRelationMapper deviceGroupUserGroupRelationMapper;

    @Resource
    private ForwardMapper forwardMapper;

    @Resource
    private UserMapper userMapper;

    @Resource
    @Lazy
    private TunnelService tunnelService;

    @Resource
    ViteConfigService viteConfigService;


    // ========== 公共接口实现 ==========

    /**
     * 创建新节点
     * 
     * @param nodeDto 节点创建数据传输对象
     * @return 创建结果响应
     */
    @Override
    public R createNode(NodeDto nodeDto) {
        Node node = buildNewNode(nodeDto);
        boolean result = this.save(node);
        if (result && nodeDto.getNodeGroupIds() != null) {
            syncNodeGroupRelations(node.getId(), nodeDto.getNodeGroupIds());
            node.setNodeGroupIds(nodeDto.getNodeGroupIds());
        }
        return result ? R.ok(node) : R.err(ERROR_CREATE_MSG);
    }



    /**
     * 获取所有节点列表
     * 注意：返回结果中会隐藏节点密钥信息
     * 
     * @return 包含所有节点的响应对象
     */
    @Override
    public R getAllNodes() {
        Integer roleId = JwtUtil.getRoleIdFromToken();
        boolean isAdmin = roleId != null && roleId == 0;

        List<Node> nodeList;
        if (isAdmin) {
            nodeList = this.list();
        } else {
            Integer userId = JwtUtil.getUserIdFromToken();
            User user = userId != null ? userMapper.selectById(userId) : null;
            if (user == null) {
                return R.ok(Collections.emptyList());
            }

            QueryWrapper<DeviceGroup> groupQuery = new QueryWrapper<DeviceGroup>()
                    .eq("hide_in_probe", 0);
            Long userGroupId = user.getGroupId();
            groupQuery.and(w -> {
                w.and(w2 -> w2.isNull("owner_user_id"));
                w.or().eq("owner_user_id", userId);
                w.or(w2 -> w2.isNotNull("owner_user_id").eq("shared", 1));
            });
            List<DeviceGroup> candidateGroups = deviceGroupMapper.selectList(groupQuery);

            // 管理员建立的设备组（owner_user_id 为空）按其绑定的用户组列表过滤：
            // 未绑定任何用户组表示对所有人可见，否则要求当前用户所在用户组在列表内；
            // 单端隧道设备组（owner_user_id 非空）已经按拥有者/共享条件过滤过，不受用户组限制
            List<Long> adminGroupIds = candidateGroups.stream()
                    .filter(g -> g.getOwnerUserId() == null)
                    .map(DeviceGroup::getId)
                    .collect(Collectors.toList());
            Map<Long, List<Long>> userGroupIdsByGroup = adminGroupIds.isEmpty() ? Collections.emptyMap()
                    : deviceGroupUserGroupRelationMapper.selectList(
                            new QueryWrapper<DeviceGroupUserGroupRelation>().in("device_group_id", adminGroupIds))
                        .stream()
                        .collect(Collectors.groupingBy(DeviceGroupUserGroupRelation::getDeviceGroupId,
                                Collectors.mapping(DeviceGroupUserGroupRelation::getUserGroupId, Collectors.toList())));

            Set<Long> visibleNodeIds = candidateGroups.stream()
                    .filter(g -> {
                        if (g.getOwnerUserId() != null) {
                            return true;
                        }
                        List<Long> allowed = userGroupIdsByGroup.getOrDefault(g.getId(), Collections.emptyList());
                        return allowed.isEmpty() || (userGroupId != null && allowed.contains(userGroupId));
                    })
                    .map(DeviceGroup::getNodeId)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());
            nodeList = visibleNodeIds.isEmpty()
                    ? Collections.emptyList()
                    : this.list(new QueryWrapper<Node>().in("id", visibleNodeIds));
        }
        attachNodeGroupIds(nodeList);
        hideNodeSecrets(nodeList);
        return R.ok(nodeList);
    }

    /**
     * 更新节点信息
     * 
     * @param nodeUpdateDto 节点更新数据传输对象
     * @return 更新结果响应
     */
    @Override
    public R updateNode(NodeUpdateDto nodeUpdateDto) {
        // 1. 验证节点是否存在
        Node node = this.getById(nodeUpdateDto.getId());
        if (node == null) {
            return R.err(ERROR_NODE_NOT_FOUND);
        }

        // 服务器地址不再由 DTO 强制必填：只有节点下的设备组全部是仅监控时才允许留空
        if (StrUtil.isBlank(nodeUpdateDto.getServerIp())) {
            List<DeviceGroup> groups = deviceGroupMapper.selectList(new QueryWrapper<DeviceGroup>().eq("node_id", node.getId()));
            boolean required = groups.stream().anyMatch(group ->
                    isAddressMissing(group.getDirection(), nodeUpdateDto.getServerIp()));
            if (required) {
                return R.err(ERROR_ADDRESS_REQUIRED);
            }
        }

        //1.1 如果节点在线 且传入更新的 http/tls/socks 任意一项与数据库不一致，则通过 WS 通知节点更新设置
        boolean online = node.getStatus() != null && node.getStatus() == 1;
        Integer newHttp = nodeUpdateDto.getHttp();
        Integer newTls = nodeUpdateDto.getTls();
        Integer newSocks = nodeUpdateDto.getSocks();

        boolean httpChanged = newHttp != null && !newHttp.equals(node.getHttp());
        boolean tlsChanged = newTls != null && !newTls.equals(node.getTls());
        boolean socksChanged = newSocks != null && !newSocks.equals(node.getSocks());
        Integer newSs = nodeUpdateDto.getSs();
        boolean ssChanged = newSs != null && !newSs.equals(node.getSs());

        // 旧版节点不认识 ss，会直接返回成功但实际没有屏蔽；节点离线时也无法确认版本，所以开启前必须确认
        if (ssChanged && newSs == 1) {
            if (!online) {
                return R.err("节点离线，无法开启屏蔽 Shadowsocks");
            }
            if (!supportsSsBlock(node.getVersion())) {
                return R.err("节点版本过低，请先更新节点后再开启屏蔽 Shadowsocks");
            }
        }

        if (online && (httpChanged || tlsChanged || socksChanged || ssChanged)) {
            JSONObject req = new JSONObject();
            req.put("http", newHttp);
            req.put("tls", newTls);
            req.put("socks", newSocks);
            // 节点按全量设置，没传时沿用现有值，否则会被关掉
            req.put("ss", newSs != null ? newSs : node.getSs());

            GostDto gostResult = WebSocketServer.send_msg(node.getId(), req, "SetProtocol");
            if (!Objects.equals(gostResult.getMsg(), "OK")){
                return R.err(gostResult.getMsg());
            }
        }


        // 2. 构建更新对象并执行更新
        Node updateNode = buildUpdateNode(nodeUpdateDto);
        boolean result = this.updateById(updateNode);

        // 节点归属的节点组：不传（null）表示不修改现有归属
        if (result && nodeUpdateDto.getNodeGroupIds() != null) {
            syncNodeGroupRelations(updateNode.getId(), nodeUpdateDto.getNodeGroupIds());
        }

        // 更新隧道入口ip
        List<Tunnel> inNodeId = tunnelService.list(new QueryWrapper<Tunnel>().eq("in_node_id", updateNode.getId()));
        if (!inNodeId.isEmpty()) {
            for (Tunnel tunnel : inNodeId) {
                tunnel.setInIp(updateNode.getIp());
            }
            tunnelService.updateBatchById(inNodeId);
        }

        // 更新服务器出口ip
        List<Tunnel> outNodeId = tunnelService.list(new QueryWrapper<Tunnel>().eq("out_node_id", updateNode.getId()));
        if (!outNodeId.isEmpty()) {
            for (Tunnel tunnel : outNodeId) {
                tunnel.setOutIp(updateNode.getServerIp());
            }
            tunnelService.updateBatchById(outNodeId);
        }

        return result ? R.ok(SUCCESS_UPDATE_MSG) : R.err(ERROR_UPDATE_MSG);
    }

    /**
     * 删除节点
     * 删除前会检查是否有隧道正在使用该节点
     * 
     * @param id 节点ID
     * @return 删除结果响应
     */
    @Override
    public R deleteNode(Long id) {
        // 1. 验证节点是否存在
        Node node = this.getById(id);
        if (node == null) {
            return R.err(ERROR_NODE_NOT_FOUND);
        }

        // 2. 检查节点使用情况
        R usageCheckResult = checkNodeUsage(id);
        if (usageCheckResult.getCode() != 0) {
            return usageCheckResult;
        }

        // 3. 执行删除操作
        boolean result = this.removeById(id);
        if (result) {
            nodeGroupRelationMapper.delete(new QueryWrapper<NodeGroupRelation>().eq("node_id", id));
        }
        return result ? R.ok(SUCCESS_DELETE_MSG) : R.err(ERROR_DELETE_MSG);
    }

    /**
     * 根据ID获取节点信息
     * 
     * @param id 节点ID
     * @return 节点对象
     * @throws RuntimeException 当节点不存在时抛出异常
     */
    @Override
    public Node getNodeById(Long id) {
        Node node = this.getById(id);
        if (node == null) {
            throw new RuntimeException(ERROR_NODE_NOT_FOUND);
        }
        return node;
    }

    // ========== 私有辅助方法 ==========

    /**
     * 构建新节点对象
     * 
     * @param nodeDto 节点创建DTO
     * @return 构建完成的节点对象
     */
    private Node buildNewNode(NodeDto nodeDto) {
        Node node = new Node();
        BeanUtils.copyProperties(nodeDto, node);
        // 仅监控设备没有地址；server_ip 列不允许 NULL，统一存空字符串
        node.setServerIp(StrUtil.nullToEmpty(node.getServerIp()));
        node.setIp(StrUtil.nullToEmpty(resolveEntryIp(node.getIp(), node.getServerIp())));
        
        // 验证端口范围
        validatePortRange(node.getPortSta(), node.getPortEnd());
        
        // 设置默认属性
        node.setSecret(IdUtil.simpleUUID());
        node.setStatus(NODE_STATUS_ACTIVE);
        
        // 设置时间戳
        long currentTime = System.currentTimeMillis();
        node.setCreatedTime(currentTime);
        node.setUpdatedTime(currentTime);
        
        return node;
    }

    /** 除仅监控外，设备组所在节点都必须有服务器地址；direction 为空的旧数据按入口处理 */
    static boolean isAddressMissing(String direction, String serverIp) {
        return !"monitor".equals(direction) && StrUtil.isBlank(serverIp);
    }

    /** 连接地址留空时默认使用服务器地址 */
    static String resolveEntryIp(String ip, String serverIp) {
        return StrUtil.isBlank(ip) ? serverIp : ip;
    }

    /**
     * 构建节点更新对象
     * 
     * @param nodeUpdateDto 节点更新DTO
     * @return 构建完成的更新对象
     */
    private Node buildUpdateNode(NodeUpdateDto nodeUpdateDto) {
        Node node = new Node();
        node.setId(nodeUpdateDto.getId());
        node.setName(nodeUpdateDto.getName());
        node.setIp(resolveEntryIp(nodeUpdateDto.getIp(), nodeUpdateDto.getServerIp()));
        node.setServerIp(nodeUpdateDto.getServerIp());
        node.setPortSta(nodeUpdateDto.getPortSta());
        node.setPortEnd(nodeUpdateDto.getPortEnd());
        node.setHttp(nodeUpdateDto.getHttp());
        node.setTls(nodeUpdateDto.getTls());
        node.setSocks(nodeUpdateDto.getSocks());
        node.setSs(nodeUpdateDto.getSs());
        // 验证端口范围
        validatePortRange(node.getPortSta(), node.getPortEnd());
        
        node.setUpdatedTime(System.currentTimeMillis());
        return node;
    }

    @Override
    public R getNodeConfig(Long id) {
        Node node = this.getById(id);
        if (node == null) {
            return R.err(ERROR_NODE_NOT_FOUND);
        }
        attachNodeGroupIds(Collections.singletonList(node));

        List<DeviceGroup> groups = deviceGroupMapper.selectList(new QueryWrapper<DeviceGroup>().eq("node_id", id).orderByAsc("sort"));
        List<Long> groupIds = groups.stream().map(DeviceGroup::getId).collect(Collectors.toList());
        Map<Long, List<Long>> userGroupIds = Collections.emptyMap();
        List<Forward> forwards = Collections.emptyList();
        if (!groupIds.isEmpty()) {
            userGroupIds = deviceGroupUserGroupRelationMapper.selectList(
                            new QueryWrapper<DeviceGroupUserGroupRelation>().in("device_group_id", groupIds)).stream()
                    .collect(Collectors.groupingBy(DeviceGroupUserGroupRelation::getDeviceGroupId,
                            Collectors.mapping(DeviceGroupUserGroupRelation::getUserGroupId, Collectors.toList())));
            forwards = forwardMapper.selectList(new QueryWrapper<Forward>()
                    .in("in_device_group_id", groupIds).or().in("out_device_group_id", groupIds));
        }
        return R.ok(buildNodeConfig(node, groups, userGroupIds, forwards));
    }

    /** 组装节点配置；只挑选要展示的字段，节点密钥不会出现在结果里 */
    static Map<String, Object> buildNodeConfig(Node node, List<DeviceGroup> groups, Map<Long, List<Long>> userGroupIds, List<Forward> forwards) {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("id", node.getId());
        config.put("name", node.getName());
        config.put("status", node.getStatus());
        config.put("version", node.getVersion());
        config.put("serverIp", node.getServerIp());
        config.put("ip", node.getIp());
        config.put("portSta", node.getPortSta());
        config.put("portEnd", node.getPortEnd());
        config.put("http", node.getHttp());
        config.put("tls", node.getTls());
        config.put("socks", node.getSocks());
        config.put("ss", node.getSs());
        config.put("nodeGroupIds", node.getNodeGroupIds());
        config.put("deviceGroups", groups.stream().map(group -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", group.getId());
            item.put("name", group.getName());
            item.put("direction", group.getDirection());
            // 协议只对出口生效，入口和仅监控存的默认值没有意义，返回 null 避免误解
            boolean hasOutbound = "outbound".equals(group.getDirection()) || "both".equals(group.getDirection());
            item.put("protocol", hasOutbound ? group.getProtocol() : null);
            item.put("ratio", group.getRatio());
            item.put("hideInProbe", group.getHideInProbe());
            item.put("remark", group.getRemark());
            item.put("config", group.getConfig() == null ? "{}" : group.getConfig());
            item.put("userGroupIds", userGroupIds.getOrDefault(group.getId(), Collections.emptyList()));
            return item;
        }).collect(Collectors.toList()));
        config.put("rules", forwards.stream().map(forward -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", forward.getId());
            item.put("name", forward.getName());
            item.put("userId", forward.getUserId());
            item.put("status", forward.getStatus());
            item.put("inPort", forward.getInPort());
            item.put("remoteAddr", forward.getRemoteAddr());
            item.put("inDeviceGroupId", forward.getInDeviceGroupId());
            item.put("outDeviceGroupId", forward.getOutDeviceGroupId());
            return item;
        }).collect(Collectors.toList()));
        return config;
    }

    /**
     * 隐藏节点列表中的密钥信息
     *
     * @param nodeList 节点列表
     */
    private void hideNodeSecrets(List<Node> nodeList) {
        nodeList.forEach(node -> node.setSecret(null));
    }

    /**
     * 批量查询并回填节点列表中每个节点所属的节点组ID
     *
     * @param nodeList 节点列表
     */
    private void attachNodeGroupIds(List<Node> nodeList) {
        if (nodeList.isEmpty()) {
            return;
        }
        List<Long> nodeIds = nodeList.stream().map(Node::getId).collect(Collectors.toList());
        List<NodeGroupRelation> relations = nodeGroupRelationMapper.selectList(
                new QueryWrapper<NodeGroupRelation>().in("node_id", nodeIds));
        Map<Long, List<Long>> nodeIdToGroupIds = relations.stream()
                .collect(Collectors.groupingBy(NodeGroupRelation::getNodeId,
                        Collectors.mapping(NodeGroupRelation::getNodeGroupId, Collectors.toList())));
        nodeList.forEach(node -> node.setNodeGroupIds(nodeIdToGroupIds.getOrDefault(node.getId(), Collections.emptyList())));
    }

    /**
     * 全量覆盖某个节点所属的节点组：先清空该节点的既有关联，再按传入列表重建
     *
     * @param nodeId       节点ID
     * @param nodeGroupIds 节点组ID列表（去重后写入，空列表表示清空归属）
     */
    private void syncNodeGroupRelations(Long nodeId, List<Long> nodeGroupIds) {
        nodeGroupRelationMapper.delete(new QueryWrapper<NodeGroupRelation>().eq("node_id", nodeId));
        if (nodeGroupIds == null || nodeGroupIds.isEmpty()) {
            return;
        }
        long now = System.currentTimeMillis();
        for (Long groupId : new java.util.LinkedHashSet<>(nodeGroupIds)) {
            NodeGroupRelation relation = new NodeGroupRelation();
            relation.setNodeGroupId(groupId);
            relation.setNodeId(nodeId);
            relation.setCreatedTime(now);
            nodeGroupRelationMapper.insert(relation);
        }
    }


    /**
     * 检查节点使用情况
     * 验证是否有隧道正在使用该节点作为入口或出口节点
     * 
     * @param nodeId 节点ID
     * @return 检查结果响应
     */
    private R checkNodeUsage(Long nodeId) {
        // 检查入口节点使用情况
        R inNodeCheckResult = checkInNodeUsage(nodeId);
        if (inNodeCheckResult.getCode() != 0) {
            return inNodeCheckResult;
        }

        // 检查出口节点使用情况
        return checkOutNodeUsage(nodeId);
    }

    /**
     * 检查节点作为入口节点的使用情况
     * 
     * @param nodeId 节点ID
     * @return 检查结果响应
     */
    private R checkInNodeUsage(Long nodeId) {
        QueryWrapper<Tunnel> query = new QueryWrapper<>();
        query.eq("in_node_id", nodeId);
        
        long tunnelCount = tunnelMapper.selectCount(query);
        if (tunnelCount > 0) {
            String errorMsg = String.format(ERROR_IN_NODE_IN_USE, tunnelCount);
            return R.err(errorMsg);
        }
        
        return R.ok();
    }

    /**
     * 检查节点作为出口节点的使用情况
     * 
     * @param nodeId 节点ID
     * @return 检查结果响应
     */
    private R checkOutNodeUsage(Long nodeId) {
        QueryWrapper<Tunnel> query = new QueryWrapper<>();
        query.eq("out_node_id", nodeId);
        
        long tunnelCount = tunnelMapper.selectCount(query);
        if (tunnelCount > 0) {
            String errorMsg = String.format(ERROR_OUT_NODE_IN_USE, tunnelCount);
            return R.err(errorMsg);
        }
        
        return R.ok();
    }

    /**
     * 获取节点安装命令
     * 根据节点信息生成对应的安装命令
     * 
     * @param id 节点ID
     * @return 包含安装命令的响应对象
     */
    @Override
    public R getInstallCommand(Long id) {
        // 1. 验证节点是否存在
        Node node = this.getById(id);
        if (node == null) {
            return R.err(ERROR_NODE_NOT_FOUND);
        }

        // 2. 构建安装命令
        return buildInstallCommand(node);
    }

    /**
     * 重置节点密钥
     * 生成新的节点密钥并返回最新的安装信息
     *
     * @param id 节点ID
     * @return 包含新安装命令的响应对象
     */
    @Override
    public R resetSecret(Long id) {
        Node node = this.getById(id);
        if (node == null) {
            return R.err(ERROR_NODE_NOT_FOUND);
        }

        node.setSecret(IdUtil.simpleUUID());
        node.setUpdatedTime(System.currentTimeMillis());
        this.updateById(node);

        return buildInstallCommand(node);
    }

    /** 这两个值会被拼进管理员复制执行的 shell 命令，格式不对就当作没有 */
    static boolean isValidInstallPin(String tag, String sha256) {
        return tag != null && tag.matches("[A-Za-z0-9._-]+") && sha256 != null && sha256.matches("[0-9a-f]{64}");
    }

    /**
     * 构建节点安装命令
     *
     * @param node 节点对象
     * @return 格式化的安装命令
     */
    private R buildInstallCommand(Node node) {
        // 面板后端地址：站点设置里手动填写了就用填写的（面板套了 CDN 或节点需要走其他地址时用）；
        // 没填则自动识别为管理员当前访问面板的地址
        ViteConfig viteConfig = viteConfigService.getOne(new QueryWrapper<ViteConfig>().eq("name", "ip"));
        String serverAddr = (viteConfig != null && StrUtil.isNotBlank(viteConfig.getValue()))
                ? viteConfig.getValue().trim()
                : detectPanelAddress();
        if (StrUtil.isBlank(serverAddr)) return R.err("无法自动识别面板地址，请先前往站点设置填写面板后端地址");

        // 处理服务器地址，如果是IPv6需要添加方括号
        String processedServerAddr = processServerAddress(serverAddr);

        // 发布时写入了版本和校验值就固定到这个版本并校验脚本；开发环境没有这些值时沿用 latest，不校验
        boolean verified = isValidInstallPin(releaseTag, installScriptSha256);
        String scriptUrl = verified
                ? "https://github.com/wyusgw/flux-panel/releases/download/" + releaseTag + "/install.sh"
                : "https://github.com/wyusgw/flux-panel/releases/latest/download/install.sh";
        // 自动探测路线：依次尝试多个加速镜像下载安装脚本，全部失败则回退到 GitHub 原始地址，
        // 适合大陆网络访问 GitHub 受限的服务器
        String[] mirrorPrefixes = {
                "https://ghfast.top/",
                "https://gh-proxy.com/",
                "https://ghproxy.net/"
        };
        // 脚本可能来自第三方加速镜像，面板命令是唯一可信的起点：校验不通过就不会执行脚本
        String verifyScript = verified ? "echo \"" + installScriptSha256 + "  ./install.sh\" | sha256sum -c - && " : "";
        String chmodAndRun = verifyScript + "chmod +x ./install.sh && ./install.sh"
                + " -a " + processedServerAddr   // 服务器地址
                + " -s " + node.getSecret();     // 节点密钥

        StringBuilder candidateUrls = new StringBuilder();
        for (String prefix : mirrorPrefixes) {
            candidateUrls.append("\"").append(prefix).append(scriptUrl).append("\" ");
        }
        candidateUrls.append("\"").append(scriptUrl).append("\"");
        String commandAuto = "(for u in " + candidateUrls
                + "; do curl -fsSL \"$u\" -o ./install.sh && break; done) && " + chmodAndRun;
        String commandOverseas = "curl -L " + scriptUrl + " -o ./install.sh && " + chmodAndRun;

        JSONObject result = new JSONObject();
        result.put("commandAuto", commandAuto);
        result.put("commandOverseas", commandOverseas);
        result.put("addr", processedServerAddr);
        result.put("secret", node.getSecret());

        // 离线部署：提供打包好 gost 二进制 + offline.sh 的离线包下载链接（按架构区分），
        // 下载解压后运行 offline.sh 即可一键完成本地安装+对接，无需再手动下载二进制、手写配置文件
        JSONObject downloadUrls = new JSONObject();
        downloadUrls.put("offlineAmd64", "https://github.com/wyusgw/flux-panel/releases/latest/download/flux-panel-offline-amd64.zip");
        downloadUrls.put("offlineArm64", "https://github.com/wyusgw/flux-panel/releases/latest/download/flux-panel-offline-arm64.zip");
        result.put("downloadUrls", downloadUrls);

        String offlineDir = "/tmp/flux-panel-offline";
        result.put("offlineCommand", "unzip -o offline.zip -d " + offlineDir
                + " && bash " + offlineDir + "/offline.sh -a \"" + processedServerAddr + "\" -s \"" + node.getSecret() + "\"");

        return R.ok(result);
    }

    /** 面板地址只允许主机名、IP（含 IPv6 方括号）、冒号和端口，其余字符一律拒绝，避免拼进安装命令后被当成 shell 语法 */
    private static final java.util.regex.Pattern PANEL_ADDR_PATTERN = java.util.regex.Pattern.compile("^[A-Za-z0-9.\\-:\\[\\]]{1,255}$");

    /**
     * 自动识别面板地址：优先取前端随请求带来的访问地址（X-Panel-Addr，浏览器地址栏里的 主机:端口），
     * 其次取反向代理转发的 X-Forwarded-Host，最后取请求的 Host；识别不出或格式不合法返回 null
     */
    private String detectPanelAddress() {
        try {
            org.springframework.web.context.request.RequestAttributes attributes =
                    org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
            if (!(attributes instanceof org.springframework.web.context.request.ServletRequestAttributes)) {
                return null;
            }
            javax.servlet.http.HttpServletRequest request =
                    ((org.springframework.web.context.request.ServletRequestAttributes) attributes).getRequest();
            for (String header : new String[]{"X-Panel-Addr", "X-Forwarded-Host", "Host"}) {
                String value = request.getHeader(header);
                if (StrUtil.isBlank(value)) {
                    continue;
                }
                // 多级代理时 X-Forwarded-Host 可能是逗号分隔的列表，取第一个
                value = value.split(",")[0].trim();
                if (PANEL_ADDR_PATTERN.matcher(value).matches()) {
                    return value;
                }
            }
        } catch (Exception e) {
            log.warn("自动识别面板地址失败: " + e.getMessage());
        }
        return null;
    }

    /**
     * 处理服务器地址，确保IPv6地址被方括号包裹
     * 
     * @param serverAddr 原始服务器地址，格式可能为 host:port
     * @return 处理后的服务器地址
     */
    private String processServerAddress(String serverAddr) {
        if (StrUtil.isBlank(serverAddr)) {
            return serverAddr;
        }
        
        // 如果已经被方括号包裹，直接返回
        if (serverAddr.startsWith("[")) {
            return serverAddr;
        }
        
        // 查找最后一个冒号，分离主机和端口
        int lastColonIndex = serverAddr.lastIndexOf(':');
        if (lastColonIndex == -1) {
            // 没有端口号，直接检查是否需要包裹
            return isIPv6Address(serverAddr) ? "[" + serverAddr + "]" : serverAddr;
        }
        
        String host = serverAddr.substring(0, lastColonIndex);
        String port = serverAddr.substring(lastColonIndex);
        
        // 检查主机部分是否为IPv6地址
        if (isIPv6Address(host)) {
            return "[" + host + "]" + port;
        }
        
        return serverAddr;
    }

    /**
     * 判断是否为IPv6地址
     * 
     * @param address 地址字符串（不包含端口号）
     * @return 是否为IPv6地址
     */
    private boolean isIPv6Address(String address) {
        // IPv6地址包含多个冒号，至少2个
        if (!address.contains(":")) {
            return false;
        }
        
        // 计算冒号数量，IPv6地址至少有2个冒号
        long colonCount = address.chars().filter(ch -> ch == ':').count();
        return colonCount >= 2;
    }

    /**
     * 验证端口范围的有效性
     * 
     * @param portSta 起始端口
     * @param portEnd 结束端口
     * @throws RuntimeException 当端口范围无效时抛出异常
     */
    private void validatePortRange(Integer portSta, Integer portEnd) {
        // 检查起始端口是否为空
        if (portSta == null) {
            throw new RuntimeException(ERROR_PORT_STA_REQUIRED);
        }
        
        // 检查结束端口是否为空
        if (portEnd == null) {
            throw new RuntimeException(ERROR_PORT_END_REQUIRED);
        }
        
        // 检查端口范围是否在有效区间内
        if (portSta < 1 || portSta > 65535 || portEnd < 1 || portEnd > 65535) {
            throw new RuntimeException(ERROR_PORT_RANGE_INVALID);
        }
        
        // 检查端口顺序是否正确
        if (portEnd < portSta) {
            throw new RuntimeException(ERROR_PORT_ORDER_INVALID);
        }
    }


    /** 节点程序从 1.2.5 开始支持屏蔽 Shadowsocks */
    static boolean supportsSsBlock(String version) {
        if (version == null) {
            return false;
        }
        int[] minimum = {1, 2, 5};
        String[] parts = version.trim().split("\\.");
        try {
            for (int i = 0; i < minimum.length; i++) {
                int part = i < parts.length ? Integer.parseInt(parts[i]) : 0;
                if (part != minimum[i]) {
                    return part > minimum[i];
                }
            }
            return true;
        } catch (NumberFormatException e) {
            return false;
        }
    }
}
