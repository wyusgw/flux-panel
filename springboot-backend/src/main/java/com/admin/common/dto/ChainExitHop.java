package com.admin.common.dto;

import com.alibaba.fastjson.annotation.JSONField;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 链式出口里实际部署的一跳：该跳的节点上监听 port，用 protocol 接收上一跳（或入口）的连接。
 * 记录在 forward.chain_hops 里的只有节点、设备组、端口、协议；连接地址每次按节点当前的 serverIp 解析
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChainExitHop {

    /** 该跳的节点 ID */
    private Long nodeId;

    /** 该跳使用的出口设备组 ID（用于诊断时显示设备组） */
    private Long groupId;

    /** 该跳节点上中继服务的监听端口 */
    private Integer port;

    /** 上一跳连到该跳使用的传输协议（已按 Mux 换成复用版本，如 mtls） */
    private String protocol;

    /** 连接地址（节点的 serverIp），不记录 */
    @JSONField(serialize = false, deserialize = false)
    private String ip;

    public ChainExitHop copy() {
        return new ChainExitHop(nodeId, groupId, port, protocol, ip);
    }
}
