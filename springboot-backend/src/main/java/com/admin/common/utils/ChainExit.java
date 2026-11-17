package com.admin.common.utils;

import com.admin.common.dto.ChainExitHop;
import com.admin.entity.Tunnel;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 链式出口：入口 → 第 1 跳 → … → 最后一跳 → 目标。
 * <p>
 * 每一跳是一个出口设备组的节点，在该节点上部署一个 relay 中继服务（服务名以 _tls 结尾，节点不统计它的流量，流量只在入口统计）。
 * 中间跳的服务带一条指向下一跳的链，把收到的连接经下一跳转发出去；最后一跳的服务直接转发到规则的目标地址。
 * relay 处理器配置了转发目标时会忽略上一跳请求的地址，只连自己的转发目标，所以每一跳都只能连到下一跳 / 目标，不会成为开放代理。
 * </p>
 * <p>
 * 命名：入口节点上的服务和链与普通隧道转发相同（{name}_tcp / {name}_udp / {name}_chains，链指向第 1 跳）；
 * 第 1 跳沿用普通出口的服务名 {name}_tls、端口即规则的出口端口，所以暂停 / 恢复 / 删除第 1 跳的服务与普通出口相同；
 * 第 n 跳（n ≥ 2）的服务名为 {name}_h{n}_tls；第 n 跳通往下一跳的链为 {name}_h{n}_chains。
 * 同一个节点在一条规则里出现多次（例如入口也是某一跳、或两跳用了同一个节点）时名字和端口都不冲突。
 * </p>
 * <p>
 * 规则创建 / 更新时把实际部署的路径记在 forward.chain_hops 上（{@link #serialize}），暂停、恢复、删除、重新推送都按记录的路径，
 * 不受之后修改链式出口配置的影响（与故障转移的备用出口一致）；修改后再保存规则时按新配置重建。
 * </p>
 */
public final class ChainExit {

    /** 与设备组里链式出口的跳数上限一致 */
    public static final int MAX_HOPS = 3;

    /** 有复用（Mux）版本的传输协议：开启 Mux 时换成对应的 m 开头协议 */
    private static final Set<String> MUX_CAPABLE = new HashSet<>(Arrays.asList("tls", "wss", "ws", "tcp"));

    private ChainExit() {
    }

    /** 该跳的传输协议：设备组没选协议时按 TLS；开启 Mux 时换成复用版本（tls → mtls 等），已经是复用协议的不变 */
    public static String effectiveProtocol(String groupProtocol, boolean mux) {
        String protocol = StringUtils.isBlank(groupProtocol) ? "tls" : groupProtocol.trim();
        if (mux && MUX_CAPABLE.contains(protocol)) {
            return "m" + protocol;
        }
        return protocol;
    }

    public static boolean isChain(Tunnel tunnel) {
        return tunnel != null && tunnel.getChainHops() != null && !tunnel.getChainHops().isEmpty();
    }

    /** 第 index 跳（从 0 开始）中继服务的名字前缀，实际服务名再加 _tls：第 1 跳与普通出口相同 */
    public static String hopServiceBase(String serviceName, int index) {
        return index == 0 ? serviceName : serviceName + "_h" + (index + 1);
    }

    /** 第 index 跳（从 0 开始）通往下一跳的链的名字前缀，实际链名再加 _chains */
    public static String hopChainBase(String serviceName, int index) {
        return serviceName + "_h" + (index + 1);
    }

    /** IPv6 地址加方括号 */
    public static String address(String ip, Integer port) {
        if (ip == null) {
            return null;
        }
        return ip.contains(":") ? "[" + ip + "]:" + port : ip + ":" + port;
    }

    /** 中间跳的名义转发目标：取规则的第一个目标地址（下一跳会忽略它，只按自己的转发目标连接） */
    static String nominalTarget(String remoteAddr) {
        if (remoteAddr == null) {
            return "";
        }
        for (String part : remoteAddr.split(",")) {
            if (!part.trim().isEmpty()) {
                return part.trim();
            }
        }
        return "";
    }

    /** 一跳上的中继服务：参数与 {@link GostUtil#AddRemoteService} 一一对应 */
    public static final class HopService {
        public final String base;
        public final Integer port;
        public final String remoteAddr;
        public final String protocol;
        public final String strategy;
        public final String weights;
        public final String interfaceName;
        /** 通往下一跳的链名；最后一跳为空 */
        public final String chain;

        HopService(String base, Integer port, String remoteAddr, String protocol, String strategy, String weights, String interfaceName, String chain) {
            this.base = base;
            this.port = port;
            this.remoteAddr = remoteAddr;
            this.protocol = protocol;
            this.strategy = strategy;
            this.weights = weights;
            this.interfaceName = interfaceName;
            this.chain = chain;
        }
    }

    /** 一跳上通往下一跳的链：参数与 {@link GostUtil#AddChains} 一一对应 */
    public static final class HopChain {
        public final String base;
        public final String nextAddress;
        public final String protocol;

        HopChain(String base, String nextAddress, String protocol) {
            this.base = base;
            this.nextAddress = nextAddress;
            this.protocol = protocol;
        }
    }

    /**
     * 第 index 跳的中继服务。最后一跳按规则的目标地址、负载策略、权重和出口网卡转发；
     * 中间跳只放一个名义目标：多个目标时下一跳不通会把目标逐个标记为失败，下一跳恢复后仍要等失败超时才能再用，
     * 只有一个目标时不做失败过滤，下一跳一恢复就能用
     */
    public static HopService hopService(String serviceName, int index, List<ChainExitHop> hops,
                                        String remoteAddr, String strategy, String weights, String interfaceName) {
        ChainExitHop hop = hops.get(index);
        String base = hopServiceBase(serviceName, index);
        if (index == hops.size() - 1) {
            return new HopService(base, hop.getPort(), remoteAddr, hop.getProtocol(), strategy, weights, interfaceName, null);
        }
        return new HopService(base, hop.getPort(), nominalTarget(remoteAddr), hop.getProtocol(), null, null, null,
                hopChainBase(serviceName, index) + "_chains");
    }

    /** 第 index 跳通往下一跳的链（连下一跳用下一跳的协议）；最后一跳没有链，返回 null */
    public static HopChain hopChain(String serviceName, int index, List<ChainExitHop> hops) {
        if (index >= hops.size() - 1) {
            return null;
        }
        ChainExitHop next = hops.get(index + 1);
        return new HopChain(hopChainBase(serviceName, index), address(next.getIp(), next.getPort()), next.getProtocol());
    }

    /** 下发给节点的中继服务配置（与 AddRemoteService 发出的一致） */
    static JSONObject buildHopService(HopService spec) {
        return GostUtil.buildRemoteService(spec.base, spec.port, spec.remoteAddr, spec.protocol, spec.strategy, spec.weights, spec.interfaceName, spec.chain);
    }

    /** 下发给节点的链配置（与 AddChains 发出的一致） */
    static JSONObject buildHopChain(HopChain spec) {
        return GostUtil.buildChain(spec.base, Collections.singletonList(spec.nextAddress), spec.protocol, null);
    }

    /** 记录实际部署的路径（节点、设备组、端口、协议），没有跳时返回 null */
    public static String serialize(List<ChainExitHop> hops) {
        if (hops == null || hops.isEmpty()) {
            return null;
        }
        JSONArray array = new JSONArray();
        for (ChainExitHop hop : hops) {
            JSONObject item = new JSONObject(true);
            item.put("nodeId", hop.getNodeId());
            item.put("groupId", hop.getGroupId());
            item.put("port", hop.getPort());
            item.put("protocol", hop.getProtocol());
            array.add(item);
        }
        return array.toJSONString();
    }

    /** 解析记录的路径；为空、格式不对、缺节点 / 端口的跳都按没有记录处理（返回空列表） */
    public static List<ChainExitHop> parse(String json) {
        if (StringUtils.isBlank(json)) {
            return new ArrayList<>();
        }
        try {
            JSONArray array = JSON.parseArray(json);
            List<ChainExitHop> hops = new ArrayList<>();
            for (int i = 0; i < array.size(); i++) {
                JSONObject item = array.getJSONObject(i);
                if (item == null || item.getLong("nodeId") == null || item.getInteger("port") == null) {
                    return new ArrayList<>();
                }
                hops.add(new ChainExitHop(item.getLong("nodeId"), item.getLong("groupId"), item.getInteger("port"),
                        effectiveProtocol(item.getString("protocol"), false), null));
            }
            return hops;
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    /** 路径的部署形态（每一跳的节点和协议），用于判断链式出口配置改了之后是否需要重建；端口不算在内 */
    public static String topologyKey(List<ChainExitHop> hops) {
        if (hops == null || hops.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (ChainExitHop hop : hops) {
            if (sb.length() > 0) {
                sb.append(',');
            }
            sb.append(hop.getNodeId()).append('/').append(hop.getProtocol());
        }
        return sb.toString();
    }

    /** 路径经过的全部节点（去重，按跳序） */
    public static List<Long> nodeIds(List<ChainExitHop> hops) {
        List<Long> ids = new ArrayList<>();
        if (hops != null) {
            for (ChainExitHop hop : hops) {
                if (hop.getNodeId() != null && !ids.contains(hop.getNodeId())) {
                    ids.add(hop.getNodeId());
                }
            }
        }
        return ids;
    }

    /** 按跳序复制一份，避免修改共享对象 */
    public static List<ChainExitHop> copy(List<ChainExitHop> hops) {
        List<ChainExitHop> result = new ArrayList<>();
        if (hops != null) {
            for (ChainExitHop hop : hops) {
                result.add(hop.copy());
            }
        }
        return result;
    }
}
