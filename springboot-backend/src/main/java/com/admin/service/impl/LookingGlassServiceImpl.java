package com.admin.service.impl;

import com.admin.common.dto.GostDto;
import com.admin.common.dto.LookingGlassRequestDto;
import com.admin.common.lang.R;
import com.admin.common.utils.WebSocketServer;
import com.admin.entity.Node;
import com.admin.entity.ViteConfig;
import com.admin.service.LookingGlassService;
import com.admin.service.NodeService;
import com.admin.service.ViteConfigService;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.regex.Pattern;

/**
 * <p>
 * Looking Glass 网络诊断服务实现：校验站点开关与节点可见性后，
 * 复用节点 Agent 已有的 TcpPing / 新增的 Traceroute WebSocket 命令完成诊断
 * </p>
 *
 * @author QAQ
 * @since 2026-09-27
 */
@Service
public class LookingGlassServiceImpl implements LookingGlassService {

    private static final int MAX_TARGET_LENGTH = 253;
    /** Traceroute/MTR 耗时较长，节点侧命令执行超时为 18 秒，这里的等待窗口需留出安全余量 */
    private static final int LONG_DIAGNOSIS_WAIT_SECONDS = 22;
    /** ICMP Ping 节点侧超时 12 秒 */
    private static final int ICMP_PING_WAIT_SECONDS = 15;
    /** DNS 查询很快，节点侧超时 8 秒 */
    private static final int DNS_QUERY_WAIT_SECONDS = 10;
    private static final Pattern IPV4_PATTERN = Pattern.compile("\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b");

    @Autowired
    private NodeService nodeService;

    @Autowired
    private ViteConfigService viteConfigService;

    @Override
    public R run(Integer userId, Integer roleId, LookingGlassRequestDto dto) {
        boolean isAdmin = roleId != null && roleId == 0;
        if (!isAdmin) {
            ViteConfig config = viteConfigService.getOne(new QueryWrapper<ViteConfig>().eq("name", "allow_looking_glass"));
            boolean enabled = config != null && "true".equals(config.getValue());
            if (!enabled) {
                return R.err("站点未开启 Looking Glass 诊断功能");
            }
        }

        String type = dto.getType();
        if (!"ping".equals(type) && !"traceroute".equals(type) && !"mtr".equals(type)
                && !"dns".equals(type) && !"icmp_ping".equals(type)) {
            return R.err("不支持的诊断类型");
        }

        String rawTarget = dto.getTarget() == null ? "" : dto.getTarget().trim();
        if (rawTarget.isEmpty()) {
            return R.err("请输入目标地址");
        }
        if (rawTarget.length() > MAX_TARGET_LENGTH) {
            return R.err("目标地址过长");
        }

        Node node = findVisibleNode(dto.getNodeId());
        if (node == null) {
            return R.err("节点不存在或无权限访问");
        }

        GostDto gostResult;
        if ("ping".equals(type)) {
            String host = rawTarget;
            int port = 80;
            int colonIdx = rawTarget.lastIndexOf(':');
            if (colonIdx > 0) {
                try {
                    port = Integer.parseInt(rawTarget.substring(colonIdx + 1));
                    host = rawTarget.substring(0, colonIdx);
                } catch (NumberFormatException e) {
                    host = rawTarget;
                    port = 80;
                }
            }
            if (host.isEmpty()) {
                return R.err("目标地址格式不正确");
            }

            JSONObject data = new JSONObject();
            data.put("ip", host);
            data.put("port", port);
            data.put("count", 4);
            data.put("timeout", 3000);
            gostResult = WebSocketServer.send_msg(node.getId(), data, "TcpPing");
        } else {
            String host = stripPort(rawTarget);
            if (host.isEmpty()) {
                return R.err("目标地址格式不正确");
            }

            JSONObject data = new JSONObject();
            data.put("host", host);

            switch (type) {
                case "traceroute":
                    data.put("maxHops", 20);
                    gostResult = WebSocketServer.send_msg(node.getId(), data, "Traceroute", LONG_DIAGNOSIS_WAIT_SECONDS);
                    break;
                case "mtr":
                    data.put("maxHops", 20);
                    gostResult = WebSocketServer.send_msg(node.getId(), data, "Mtr", LONG_DIAGNOSIS_WAIT_SECONDS);
                    break;
                case "dns":
                    gostResult = WebSocketServer.send_msg(node.getId(), data, "DnsQuery", DNS_QUERY_WAIT_SECONDS);
                    break;
                default:
                    gostResult = WebSocketServer.send_msg(node.getId(), data, "IcmpPing", ICMP_PING_WAIT_SECONDS);
                    break;
            }
        }

        if (gostResult == null || !"OK".equals(gostResult.getMsg())) {
            return R.err(gostResult != null ? gostResult.getMsg() : "节点无响应");
        }

        Object resultData = gostResult.getData();
        if (!isAdmin && isHideIpEnabled() && resultData instanceof JSONObject) {
            maskIpAddressesInPlace((JSONObject) resultData, type);
        }

        JSONObject result = new JSONObject();
        result.put("nodeId", node.getId());
        result.put("nodeName", node.getName());
        result.put("type", type);
        result.put("target", rawTarget);
        result.put("data", resultData);
        return R.ok(result);
    }

    private String stripPort(String rawTarget) {
        int colonIdx = rawTarget.lastIndexOf(':');
        return colonIdx > 0 ? rawTarget.substring(0, colonIdx) : rawTarget;
    }

    private boolean isHideIpEnabled() {
        ViteConfig config = viteConfigService.getOne(new QueryWrapper<ViteConfig>().eq("name", "looking_glass_hide_ip"));
        return config != null && "true".equals(config.getValue());
    }

    /**
     * 隐藏诊断结果原始文本中出现的 IP 地址（如 traceroute/mtr 逐跳的中间节点 IP），
     * 避免普通用户借助 Looking Glass 探测到面板运营方的内部网络拓扑/上游线路信息；
     * DNS 查询的结果本身就是给用户看解析出的 IP，脱敏会让该功能失去意义，因此不处理
     */
    private void maskIpAddressesInPlace(JSONObject data, String type) {
        boolean maskOutput = "traceroute".equals(type) || "mtr".equals(type) || "icmp_ping".equals(type);
        if (maskOutput) {
            String output = data.getString("output");
            if (output != null) {
                data.put("output", IPV4_PATTERN.matcher(output).replaceAll("•••.•••.•••.•••"));
            }
        }
        String errorMessage = data.getString("errorMessage");
        if (errorMessage != null) {
            data.put("errorMessage", IPV4_PATTERN.matcher(errorMessage).replaceAll("•••.•••.•••.•••"));
        }
    }

    /** 复用 NodeService.getAllNodes() 已实现的管理员/普通用户可见性判断，避免重复维护权限逻辑 */
    private Node findVisibleNode(Long nodeId) {
        if (nodeId == null) {
            return null;
        }
        Object nodeListObj = nodeService.getAllNodes().getData();
        if (!(nodeListObj instanceof List<?>)) {
            return null;
        }
        for (Object o : (List<?>) nodeListObj) {
            if (o instanceof Node && nodeId.equals(((Node) o).getId())) {
                return (Node) o;
            }
        }
        return null;
    }
}
