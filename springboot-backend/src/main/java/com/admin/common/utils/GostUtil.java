package com.admin.common.utils;

import com.admin.common.dto.GostConfigDto;
import com.admin.common.dto.GostDto;
import com.admin.entity.Tunnel;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import org.apache.commons.lang3.StringUtils;
import org.aspectj.apache.bcel.generic.RET;

import java.util.Collections;
import java.util.List;
import java.util.Objects;

public class GostUtil {


    public static GostDto AddLimiters(Long node_id, Long name, String speed) {
        return AddLimiters(node_id, name.toString(), speed);
    }

    public static GostDto UpdateLimiters(Long node_id, Long name, String speed) {
        return UpdateLimiters(node_id, name.toString(), speed);
    }

    public static GostDto DeleteLimiters(Long node_id, Long name) {
        return DeleteLimiters(node_id, name.toString());
    }

    /**
     * 以字符串命名的限速器（用于转发规则/套餐限速自动派生出的限速器，名称形如 "fwd_{forwardId}"，
     * 与 SpeedLimit 的纯数字ID命名空间区分，避免互相冲突）
     */
    public static GostDto AddLimiters(Long node_id, String name, String speed) {
        JSONObject data = createLimiterData(name, speed);
        return WebSocketServer.send_msg(node_id, data, "AddLimiters");
    }

    public static GostDto UpdateLimiters(Long node_id, String name, String speed) {
        JSONObject data = createLimiterData(name, speed);
        JSONObject req = new JSONObject();
        req.put("limiter", name);
        req.put("data", data);
        return WebSocketServer.send_msg(node_id, req, "UpdateLimiters");
    }

    public static GostDto DeleteLimiters(Long node_id, String name) {
        JSONObject req = new JSONObject();
        req.put("limiter", name);
        return WebSocketServer.send_msg(node_id, req, "DeleteLimiters");
    }

    /**
     * 连接数/IP 限制器（用于规则的"连接数限制"与"IP 限制"）
     * limits 使用 gost 的 climiter 语法："$ N" 表示总连接数限制，"$$ N" 表示单 IP 连接数限制
     */
    public static GostDto AddCLimiters(Long node_id, Long name, Integer connLimit, Integer ipLimit) {
        JSONObject data = createCLimiterData(name, connLimit, ipLimit);
        return WebSocketServer.send_msg(node_id, data, "AddCLimiters");
    }

    public static GostDto UpdateCLimiters(Long node_id, Long name, Integer connLimit, Integer ipLimit) {
        JSONObject data = createCLimiterData(name, connLimit, ipLimit);
        JSONObject req = new JSONObject();
        req.put("limiter", name + "");
        req.put("data", data);
        return WebSocketServer.send_msg(node_id, req, "UpdateCLimiters");
    }

    public static GostDto DeleteCLimiters(Long node_id, Long name) {
        JSONObject req = new JSONObject();
        req.put("limiter", name + "");
        return WebSocketServer.send_msg(node_id, req, "DeleteCLimiters");
    }

    public static GostDto AddService(Long node_id, String name, Integer in_port, String limiter, String remoteAddr, Integer fow_type, Tunnel tunnel, String strategy, String weights, String interfaceName, Long climiter, Integer acceptProxyProtocol, Integer sendProxyProtocol) {
        JSONArray services = new JSONArray();
        String[] protocols = {"tcp", "udp"};
        for (String protocol : protocols) {
            JSONObject service = createServiceConfig(name, in_port, limiter, remoteAddr, protocol, fow_type, tunnel, strategy, weights, interfaceName, climiter, acceptProxyProtocol, sendProxyProtocol);
            services.add(service);
        }
        return WebSocketServer.send_msg(node_id, services, "AddService");
    }

    public static GostDto UpdateService(Long node_id, String name, Integer in_port, String limiter, String remoteAddr, Integer fow_type, Tunnel tunnel, String strategy, String weights, String interfaceName, Long climiter, Integer acceptProxyProtocol, Integer sendProxyProtocol) {
        JSONArray services = new JSONArray();
        String[] protocols = {"tcp", "udp"};
        for (String protocol : protocols) {
            JSONObject service = createServiceConfig(name, in_port, limiter, remoteAddr, protocol, fow_type, tunnel, strategy, weights, interfaceName, climiter, acceptProxyProtocol, sendProxyProtocol);
            services.add(service);
        }
        return WebSocketServer.send_msg(node_id, services, "UpdateService");
    }

    public static GostDto DeleteService(Long node_id, String name) {
        JSONObject data = new JSONObject();
        JSONArray services = new JSONArray();
        services.add(name + "_tcp");
        services.add(name + "_udp");
        data.put("services", services);
        return WebSocketServer.send_msg(node_id, data, "DeleteService");
    }

    public static GostDto AddRemoteService(Long node_id, String name, Integer out_port, String remoteAddr,  String protocol, String strategy, String weights, String interfaceName) {
        JSONObject data = new JSONObject();
        data.put("name", name + "_tls");
        data.put("addr", ":" + out_port);

        if (StringUtils.isNotBlank(interfaceName)) {
            JSONObject metadata = new JSONObject();
            metadata.put("interface", interfaceName);
            data.put("metadata", metadata);
        }


        JSONObject handler = new JSONObject();
        handler.put("type", "relay");
        data.put("handler", handler);
        JSONObject listener = new JSONObject();
        listener.put("type", protocol);
        data.put("listener", listener);
        data.put("forwarder", createForwarder(remoteAddr, strategy, weights));
        JSONArray services = new JSONArray();
        services.add(data);
        return WebSocketServer.send_msg(node_id, services, "AddService");
    }

    public static GostDto UpdateRemoteService(Long node_id, String name, Integer out_port, String remoteAddr,String protocol, String strategy, String weights, String interfaceName) {
        JSONObject data = new JSONObject();
        data.put("name", name + "_tls");
        data.put("addr", ":" + out_port);

        if (StringUtils.isNotBlank(interfaceName)) {
            JSONObject metadata = new JSONObject();
            metadata.put("interface", interfaceName);
            data.put("metadata", metadata);
        }


        JSONObject handler = new JSONObject();
        handler.put("type", "relay");
        data.put("handler", handler);
        JSONObject listener = new JSONObject();
        listener.put("type", protocol);
        data.put("listener", listener);
        data.put("forwarder", createForwarder(remoteAddr, strategy, weights));
        JSONArray services = new JSONArray();
        services.add(data);
        return WebSocketServer.send_msg(node_id, services, "UpdateService");
    }

    public static GostDto DeleteRemoteService(Long node_id, String name) {
        JSONArray data = new JSONArray();
        data.add(name + "_tls");
        JSONObject req = new JSONObject();
        req.put("services", data);
        return WebSocketServer.send_msg(node_id, req, "DeleteService");
    }

    public static GostDto PauseService(Long node_id, String name) {
        JSONObject data = new JSONObject();
        JSONArray services = new JSONArray();
        services.add(name + "_tcp");
        services.add(name + "_udp");
        data.put("services", services);
        return WebSocketServer.send_msg(node_id, data, "PauseService");
    }

    public static GostDto ResumeService(Long node_id, String name) {
        JSONObject data = new JSONObject();
        JSONArray services = new JSONArray();
        services.add(name + "_tcp");
        services.add(name + "_udp");
        data.put("services", services);
        return WebSocketServer.send_msg(node_id, data, "ResumeService");
    }

    public static GostDto PauseRemoteService(Long node_id, String name) {
        JSONObject data = new JSONObject();
        JSONArray services = new JSONArray();
        services.add(name + "_tls");
        data.put("services", services);
        return WebSocketServer.send_msg(node_id, data, "PauseService");
    }

    public static GostDto ResumeRemoteService(Long node_id, String name) {
        JSONObject data = new JSONObject();
        JSONArray services = new JSONArray();
        services.add(name + "_tls");
        data.put("services", services);
        return WebSocketServer.send_msg(node_id, data, "ResumeService");
    }

    /** 备用出口连接失败后，把该出口摘除的时间（纳秒）：到期后重试，主出口恢复后自动切回 */
    static final long FAILOVER_FAIL_TIMEOUT_NANOS = 30_000_000_000L;

    public static GostDto AddChains(Long node_id, String name, String remoteAddr, String protocol, String interfaceName) {
        return AddChains(node_id, name, Collections.singletonList(remoteAddr), protocol, interfaceName);
    }

    /**
     * 多个出口地址时按顺序主备：remoteAddrs 第一个是主出口，其余是备用出口。
     */
    public static GostDto AddChains(Long node_id, String name, List<String> remoteAddrs, String protocol, String interfaceName) {
        return WebSocketServer.send_msg(node_id, buildChain(name, remoteAddrs, protocol, interfaceName), "AddChains");
    }

    public static GostDto UpdateChains(Long node_id, String name, String remoteAddr, String protocol, String interfaceName) {
        return UpdateChains(node_id, name, Collections.singletonList(remoteAddr), protocol, interfaceName);
    }

    public static GostDto UpdateChains(Long node_id, String name, List<String> remoteAddrs, String protocol, String interfaceName) {
        JSONObject data = buildChain(name, remoteAddrs, protocol, interfaceName);
        JSONObject req = new JSONObject();
        req.put("chain", name + "_chains");
        req.put("data", data);
        return WebSocketServer.send_msg(node_id, req, "UpdateChains");
    }

    /**
     * 构建链配置。只有一个出口时与旧版完全一致（节点名 node-{name}，无 selector）；
     * 有备用出口时同一跳里放多个节点，按 fifo 优先使用靠前的出口，连接失败 1 次就把它摘除
     * {@link #FAILOVER_FAIL_TIMEOUT_NANOS} 纳秒，期间用后面的出口，到期后重新尝试主出口。
     * 链配置不经过节点端的时长预处理，failTimeout 必须直接给纳秒数。
     */
    static JSONObject buildChain(String name, List<String> remoteAddrs, String protocol, String interfaceName) {
        JSONArray nodes = new JSONArray();
        for (int i = 0; i < remoteAddrs.size(); i++) {
            JSONObject dialer = new JSONObject();
            dialer.put("type", protocol);
            if (Objects.equals(protocol, "quic")){
                JSONObject metadata = new JSONObject();
                metadata.put("keepAlive", true);
                metadata.put("ttl", "10s");
                dialer.put("metadata", metadata);
            }

            JSONObject connector = new JSONObject();
            connector.put("type", "relay");

            JSONObject node = new JSONObject();
            node.put("name", i == 0 ? "node-" + name : "node-" + name + "-b" + i);
            node.put("addr", remoteAddrs.get(i));
            node.put("connector", connector);
            node.put("dialer", dialer);

            if (StringUtils.isNotBlank(interfaceName)) {
                node.put("interface", interfaceName);
            }
            nodes.add(node);
        }

        JSONObject hop = new JSONObject();
        hop.put("name", "hop-" + name);
        hop.put("nodes", nodes);
        if (remoteAddrs.size() > 1) {
            JSONObject selector = new JSONObject();
            selector.put("strategy", "fifo");
            selector.put("maxFails", 1);
            selector.put("failTimeout", FAILOVER_FAIL_TIMEOUT_NANOS);
            hop.put("selector", selector);
        }

        JSONArray hops = new JSONArray();
        hops.add(hop);

        JSONObject data = new JSONObject();
        data.put("name", name + "_chains");
        data.put("hops", hops);
        return data;
    }

    public static GostDto DeleteChains(Long node_id, String name) {
        JSONObject data = new JSONObject();
        data.put("chain", name + "_chains");
        return WebSocketServer.send_msg(node_id, data, "DeleteChains");
    }

    private static JSONObject createLimiterData(String name, String speed) {
        JSONObject data = new JSONObject();
        data.put("name", name);
        JSONArray limits = new JSONArray();
        limits.add("$ " + speed + "MB " + speed + "MB");
        data.put("limits", limits);
        return data;
    }

    /**
     * 构建连接数限制器配置
     * "$ N"：全局（总）连接数限制；"$$ N"：单 IP 连接数限制
     */
    private static JSONObject createCLimiterData(Long name, Integer connLimit, Integer ipLimit) {
        JSONObject data = new JSONObject();
        data.put("name", name.toString());
        JSONArray limits = new JSONArray();
        if (connLimit != null && connLimit > 0) {
            limits.add("$ " + connLimit);
        }
        if (ipLimit != null && ipLimit > 0) {
            limits.add("$$ " + ipLimit);
        }
        data.put("limits", limits);
        return data;
    }

    private static JSONObject createServiceConfig(String name, Integer in_port, String limiter, String remoteAddr, String protocol, Integer fow_type, Tunnel tunnel, String strategy, String weights, String interfaceName, Long climiter, Integer acceptProxyProtocol, Integer sendProxyProtocol) {
        JSONObject service = new JSONObject();
        service.put("name", name + "_" + protocol);
        if (Objects.equals(protocol, "tcp")){
            service.put("addr", tunnel.getTcpListenAddr() + ":" + in_port);
        }else {
            service.put("addr", tunnel.getUdpListenAddr() + ":" + in_port);
        }

        JSONObject metadata = null;
        if (StringUtils.isNotBlank(interfaceName)) {
            metadata = new JSONObject();
            metadata.put("interface", interfaceName);
        }
        // 接受 Proxy Protocol 需配置在 service 顶层 metadata，gost 只从这里读取，配置在 listener.metadata 下不会生效
        if (acceptProxyProtocol != null && acceptProxyProtocol > 0) {
            if (metadata == null) {
                metadata = new JSONObject();
            }
            metadata.put("proxyProtocol", acceptProxyProtocol);
        }
        if (metadata != null) {
            service.put("metadata", metadata);
        }


        // 添加限流器配置
        if (StringUtils.isNotBlank(limiter)) {
            service.put("limiter", limiter);
        }

        // 添加连接数/IP限制器配置
        if (climiter != null) {
            service.put("climiter", climiter.toString());
        }

        // 配置处理器
        JSONObject handler = createHandler(protocol, name, fow_type, sendProxyProtocol,
                tunnel != null && tunnel.getBackupOutNodeIds() != null ? tunnel.getBackupOutNodeIds().size() : 0);
        service.put("handler", handler);

        // 配置监听器
        JSONObject listener = createListener(protocol, tunnel != null && Boolean.TRUE.equals(tunnel.getUdpSourceInOut()));
        service.put("listener", listener);

        // 端口转发需要配置转发器
        if (isPortForwarding(fow_type)) {
            JSONObject forwarder = createForwarder(remoteAddr, strategy, weights);
            service.put("forwarder", forwarder);
        }
        return service;
    }

    static JSONObject createHandler(String protocol, String name, Integer fow_type, Integer sendProxyProtocol, int backupExitCount) {
        JSONObject handler = new JSONObject();
        handler.put("type", protocol);

        // 隧道转发需要添加链配置
        if (isTunnelForwarding(fow_type)) {
            handler.put("chain", name + "_chains");
            // 有备用出口时允许重试：主出口连不上的那条连接也会立刻换到备用出口，而不是只有之后的连接才切过去
            if (backupExitCount > 0) {
                handler.put("retries", backupExitCount);
            }
        }

        // 发送 Proxy Protocol（连接目标地址时携带 PP 头）
        if (sendProxyProtocol != null && sendProxyProtocol > 0) {
            JSONObject metadata = new JSONObject();
            metadata.put("proxyProtocol", sendProxyProtocol);
            handler.put("metadata", metadata);
        }

        return handler;
    }

    static JSONObject createListener(String protocol, boolean udpSourceInOut) {
        JSONObject listener = new JSONObject();
        listener.put("type", protocol);
        if (Objects.equals(protocol, "udp")){
            JSONObject metadata = new JSONObject();
            metadata.put("keepAlive", true);
            // UDP 源进源出：节点（1.2.7 及以上）对监听 0.0.0.0 的 UDP 服务，改为在每个网卡的 IP 上各监听一个套接字
            if (udpSourceInOut) {
                metadata.put("sourceInOut", true);
            }
            listener.put("metadata", metadata);
        }
        return listener;
    }

    /**
     * 构建转发器：多个目标地址按逗号分隔。weights 与地址按顺序一一对应（逗号分隔的正整数），
     * 写入节点的 metadata.weight，gost 的随机、轮询策略会按权重分配流量；
     * 为空、数量对不上或某项不是正整数时，该地址按权重 1 处理（等同于不加权）
     */
    private static JSONObject createForwarder(String remoteAddr, String strategy, String weights) {
        JSONObject forwarder = new JSONObject();
        JSONArray nodes = new JSONArray();

        String[] split = remoteAddr.split(",");
        String[] weightParts = StringUtils.isBlank(weights) ? new String[0] : weights.split(",");
        int num = 1;
        for (String addr : split) {
            JSONObject node = new JSONObject();
            node.put("name", "node_" + num );
            node.put("addr", addr);
            int weight = parseWeight(weightParts, num - 1);
            if (weight > 1) {
                JSONObject metadata = new JSONObject();
                metadata.put("weight", weight);
                node.put("metadata", metadata);
            }
            nodes.add(node);
            num ++;
        }

        if (strategy == null || strategy.equals("")){
            strategy = "fifo";
        }

        forwarder.put("nodes", nodes);

        JSONObject selector = new JSONObject();
        selector.put("strategy", strategy);
        selector.put("maxFails", 1);
        selector.put("failTimeout", "600s");
        forwarder.put("selector", selector);
        return forwarder;
    }

    private static int parseWeight(String[] weightParts, int index) {
        if (index >= weightParts.length) {
            return 1;
        }
        try {
            int weight = Integer.parseInt(weightParts[index].trim());
            return weight > 0 ? weight : 1;
        } catch (NumberFormatException e) {
            return 1;
        }
    }

    private static boolean isPortForwarding(Integer fow_type) {
        return fow_type != null && fow_type == 1;
    }

    private static boolean isTunnelForwarding(Integer fow_type) {
        return fow_type != null && fow_type != 1;
    }

}
