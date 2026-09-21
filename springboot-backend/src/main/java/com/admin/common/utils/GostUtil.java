package com.admin.common.utils;

import com.admin.common.dto.GostConfigDto;
import com.admin.common.dto.GostDto;
import com.admin.entity.Tunnel;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import org.apache.commons.lang3.StringUtils;
import org.aspectj.apache.bcel.generic.RET;

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

    public static GostDto AddService(Long node_id, String name, Integer in_port, String limiter, String remoteAddr, Integer fow_type, Tunnel tunnel, String strategy, String interfaceName, Long climiter, Integer acceptProxyProtocol, Integer sendProxyProtocol) {
        JSONArray services = new JSONArray();
        String[] protocols = {"tcp", "udp"};
        for (String protocol : protocols) {
            JSONObject service = createServiceConfig(name, in_port, limiter, remoteAddr, protocol, fow_type, tunnel, strategy, interfaceName, climiter, acceptProxyProtocol, sendProxyProtocol);
            services.add(service);
        }
        return WebSocketServer.send_msg(node_id, services, "AddService");
    }

    public static GostDto UpdateService(Long node_id, String name, Integer in_port, String limiter, String remoteAddr, Integer fow_type, Tunnel tunnel, String strategy, String interfaceName, Long climiter, Integer acceptProxyProtocol, Integer sendProxyProtocol) {
        JSONArray services = new JSONArray();
        String[] protocols = {"tcp", "udp"};
        for (String protocol : protocols) {
            JSONObject service = createServiceConfig(name, in_port, limiter, remoteAddr, protocol, fow_type, tunnel, strategy, interfaceName, climiter, acceptProxyProtocol, sendProxyProtocol);
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

    public static GostDto AddRemoteService(Long node_id, String name, Integer out_port, String remoteAddr,  String protocol, String strategy, String interfaceName) {
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
        JSONObject forwarder = new JSONObject();
        JSONArray nodes = new JSONArray();

        String[] split = remoteAddr.split(",");
        int num = 1;
        for (String addr : split) {
            JSONObject node = new JSONObject();
            node.put("name", "node_" + num );
            node.put("addr", addr);
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

        data.put("forwarder", forwarder);
        JSONArray services = new JSONArray();
        services.add(data);
        return WebSocketServer.send_msg(node_id, services, "AddService");
    }

    public static GostDto UpdateRemoteService(Long node_id, String name, Integer out_port, String remoteAddr,String protocol, String strategy, String interfaceName) {
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
        JSONObject forwarder = new JSONObject();
        JSONArray nodes = new JSONArray();

        String[] split = remoteAddr.split(",");
        int num = 1;
        for (String addr : split) {
            JSONObject node = new JSONObject();
            node.put("name", "node_" + num );
            node.put("addr", addr);
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

        data.put("forwarder", forwarder);
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

    public static GostDto AddChains(Long node_id, String name, String remoteAddr, String protocol, String interfaceName) {
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
        node.put("name", "node-" + name);
        node.put("addr", remoteAddr);
        node.put("connector", connector);
        node.put("dialer", dialer);

        if (StringUtils.isNotBlank(interfaceName)) {
            node.put("interface", interfaceName);
        }


        JSONArray nodes = new JSONArray();
        nodes.add(node);

        JSONObject hop = new JSONObject();
        hop.put("name", "hop-" + name);
        hop.put("nodes", nodes);

        JSONArray hops = new JSONArray();
        hops.add(hop);

        JSONObject data = new JSONObject();
        data.put("name", name + "_chains");
        data.put("hops", hops);

        return WebSocketServer.send_msg(node_id, data, "AddChains");
    }

    public static GostDto UpdateChains(Long node_id, String name, String remoteAddr, String protocol, String interfaceName) {
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
        node.put("name", "node-" + name);
        node.put("addr", remoteAddr);
        node.put("connector", connector);
        node.put("dialer", dialer);

        if (StringUtils.isNotBlank(interfaceName)) {
            node.put("interface", interfaceName);
        }

        JSONArray nodes = new JSONArray();
        nodes.add(node);

        JSONObject hop = new JSONObject();
        hop.put("name", "hop-" + name);
        hop.put("nodes", nodes);

        JSONArray hops = new JSONArray();
        hops.add(hop);

        JSONObject data = new JSONObject();
        data.put("name", name + "_chains");
        data.put("hops", hops);
        JSONObject req = new JSONObject();
        req.put("chain", name + "_chains");
        req.put("data", data);
       return WebSocketServer.send_msg(node_id, req, "UpdateChains");
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

    private static JSONObject createServiceConfig(String name, Integer in_port, String limiter, String remoteAddr, String protocol, Integer fow_type, Tunnel tunnel, String strategy, String interfaceName, Long climiter, Integer acceptProxyProtocol, Integer sendProxyProtocol) {
        JSONObject service = new JSONObject();
        service.put("name", name + "_" + protocol);
        if (Objects.equals(protocol, "tcp")){
            service.put("addr", tunnel.getTcpListenAddr() + ":" + in_port);
        }else {
            service.put("addr", tunnel.getUdpListenAddr() + ":" + in_port);
        }

        if (StringUtils.isNotBlank(interfaceName)) {
            JSONObject metadata = new JSONObject();
            metadata.put("interface", interfaceName);
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
        JSONObject handler = createHandler(protocol, name, fow_type, sendProxyProtocol);
        service.put("handler", handler);

        // 配置监听器
        JSONObject listener = createListener(protocol, acceptProxyProtocol);
        service.put("listener", listener);

        // 端口转发需要配置转发器
        if (isPortForwarding(fow_type)) {
            JSONObject forwarder = createForwarder(remoteAddr, strategy);
            service.put("forwarder", forwarder);
        }
        return service;
    }

    private static JSONObject createHandler(String protocol, String name, Integer fow_type, Integer sendProxyProtocol) {
        JSONObject handler = new JSONObject();
        handler.put("type", protocol);

        // 隧道转发需要添加链配置
        if (isTunnelForwarding(fow_type)) {
            handler.put("chain", name + "_chains");
        }

        // 发送 Proxy Protocol（连接目标地址时携带 PP 头）
        if (sendProxyProtocol != null && sendProxyProtocol > 0) {
            JSONObject metadata = new JSONObject();
            metadata.put("proxyProtocol", sendProxyProtocol);
            handler.put("metadata", metadata);
        }

        return handler;
    }

    private static JSONObject createListener(String protocol, Integer acceptProxyProtocol) {
        JSONObject listener = new JSONObject();
        listener.put("type", protocol);
        JSONObject metadata = null;
        if (Objects.equals(protocol, "udp")){
            metadata = new JSONObject();
            metadata.put("keepAlive", true);
        }
        // 接受 Proxy Protocol（入站连接需携带 PP 头）
        if (acceptProxyProtocol != null && acceptProxyProtocol > 0) {
            if (metadata == null) {
                metadata = new JSONObject();
            }
            metadata.put("proxyProtocol", acceptProxyProtocol);
        }
        if (metadata != null) {
            listener.put("metadata", metadata);
        }
        return listener;
    }

    private static JSONObject createForwarder(String remoteAddr, String strategy) {
        JSONObject forwarder = new JSONObject();
        JSONArray nodes = new JSONArray();

        String[] split = remoteAddr.split(",");
        int num = 1;
        for (String addr : split) {
            JSONObject node = new JSONObject();
            node.put("name", "node_" + num );
            node.put("addr", addr);
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

    private static boolean isPortForwarding(Integer fow_type) {
        return fow_type != null && fow_type == 1;
    }

    private static boolean isTunnelForwarding(Integer fow_type) {
        return fow_type != null && fow_type != 1;
    }

}
