package com.admin.common.utils;

import com.admin.common.dto.GostDto;
import com.admin.common.dto.TcpPingDiagnosisResult;
import com.admin.entity.Node;
import com.admin.entity.ViteConfig;
import com.admin.service.ViteConfigService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * TCP ping 诊断的共用实现：转发规则诊断（ForwardServiceImpl.diagnoseForward）与
 * 隧道诊断（TunnelServiceImpl.diagnoseTunnel）此前是两份几乎一样的复制代码，
 * 参数还各自不同（次数、超时都不一样），这里合并成一份，两边统一使用同一套行为。
 */
public class TcpPingDiagnosisUtil {

    /** 每个目标默认做几次 TCP 连接尝试（参考 ping 命令逐次列出结果），可在站点设置 diagnosis_ping_count 中调整 */
    public static final int DEFAULT_PING_COUNT = 4;
    public static final int MIN_PING_COUNT = 1;
    public static final int MAX_PING_COUNT = 30;
    private static final String CONFIG_PING_COUNT = "diagnosis_ping_count";

    /** 点开诊断详情时对该段重新测试的连接次数（与上面首次诊断的次数分开配置），站点设置 diagnosis_detail_ping_count */
    public static final int DEFAULT_DETAIL_PING_COUNT = 8;
    private static final String CONFIG_DETAIL_PING_COUNT = "diagnosis_detail_ping_count";

    /** 每次连接尝试的超时时间（毫秒） */
    public static final int PING_TIMEOUT_MS = 1500;

    /** 尝试之间的间隔（毫秒），与节点侧一致 */
    private static final int PING_INTERVAL_MS = 100;

    /** 读取站点设置用，由 {@link ConfigHolder} 在启动时注入（本类是静态工具类，拿不到 Spring 注入） */
    private static volatile ViteConfigService viteConfigService;

    @Component
    static class ConfigHolder {
        @Resource
        @Lazy
        void setViteConfigService(ViteConfigService service) {
            TcpPingDiagnosisUtil.viteConfigService = service;
        }
    }

    /**
     * 汇总诊断的面板反馈（发出 / 失败 / 回收任务）：每一次连接尝试算一个任务，
     * 所以统计的是入口端反馈与出口端反馈各段连接明细的总和，而不是「段」的个数。
     * <ul>
     *   <li>sent：发出任务 = 每段应做的连接次数之和</li>
     *   <li>failed：发出失败 = 下发失败（没有拿到节点反馈）的那些段的连接次数之和</li>
     *   <li>recovered：回收任务 = 实际收到的连接反馈条数之和（旧版节点没有逐次明细时，按该段应做的次数计）</li>
     * </ul>
     */
    public static Map<String, Object> buildDispatchStats(List<TcpPingDiagnosisResult> results) {
        int pingCount = getPingCount();
        long sent = 0, failed = 0, recovered = 0;
        for (TcpPingDiagnosisResult result : results) {
            sent += pingCount;
            if (result.isDispatchFailed()) {
                failed += pingCount;
            }
            if (result.isRecovered()) {
                List<Map<String, Object>> attempts = result.getAttempts();
                recovered += (attempts != null && !attempts.isEmpty()) ? attempts.size() : pingCount;
            }
        }
        Map<String, Object> stats = new HashMap<>();
        stats.put("sent", sent);
        stats.put("failed", failed);
        stats.put("recovered", recovered);
        return stats;
    }

    /** 首次诊断的连接次数：站点设置未配置或非法时用默认值，超出范围时收敛到 [MIN, MAX] */
    public static int getPingCount() {
        return readCount(CONFIG_PING_COUNT, DEFAULT_PING_COUNT);
    }

    /** 点开诊断详情重新测试时的连接次数，规则同 {@link #getPingCount()}，默认值不同 */
    public static int getDetailPingCount() {
        return readCount(CONFIG_DETAIL_PING_COUNT, DEFAULT_DETAIL_PING_COUNT);
    }

    private static int readCount(String configName, int defaultCount) {
        try {
            ViteConfigService service = viteConfigService;
            ViteConfig config = service != null ? service.getOne(new QueryWrapper<ViteConfig>().eq("name", configName)) : null;
            String value = config != null ? config.getValue() : null;
            if (value == null || value.trim().isEmpty()) {
                return defaultCount;
            }
            int count = Integer.parseInt(value.trim());
            return Math.max(MIN_PING_COUNT, Math.min(MAX_PING_COUNT, count));
        } catch (Exception e) {
            return defaultCount;
        }
    }

    /** 一次要诊断的「某节点 → 某地址:端口」，首次诊断与点开详情重新测试共用，用来保证两边测的是同一批目标 */
    public static final class Probe {
        public final Node node;
        public final String targetIp;
        public final int targetPort;
        public final String description;
        public final String leg;
        public final Long groupId;

        public Probe(Node node, String targetIp, int targetPort, String description, String leg, Long groupId) {
            this.node = node;
            this.targetIp = targetIp;
            this.targetPort = targetPort;
            this.description = description;
            this.leg = leg;
            this.groupId = groupId;
        }
    }

    /** 按首次诊断的次数执行一个探测 */
    public static TcpPingDiagnosisResult run(Probe probe) {
        return run(probe, getPingCount());
    }

    public static TcpPingDiagnosisResult run(Probe probe, int pingCount) {
        return performTcpPingDiagnosis(probe.node, probe.targetIp, probe.targetPort, probe.description, probe.leg, probe.groupId, pingCount);
    }

    /** 在允许的探测里找与前端点开的那一段（段类型 + 目标地址 + 端口）一致的，找不到返回 null，避免借接口让节点去测任意地址 */
    public static Probe findProbe(List<Probe> probes, String leg, String targetIp, Integer targetPort) {
        if (targetIp == null || targetPort == null) {
            return null;
        }
        for (Probe probe : probes) {
            if (probe.targetIp.equals(targetIp) && probe.targetPort == targetPort
                    && (leg == null ? probe.leg == null : leg.equals(probe.leg))) {
                return probe;
            }
        }
        return null;
    }

    /**
     * 等待节点侧跑完这些尝试的超时时间（秒），要盖过节点侧的最坏情况耗时：
     * count * timeoutMs + (count-1) * 100ms 尝试间隔，再留 3 秒余量
     */
    private static int waitTimeoutSeconds(int count) {
        long worstMs = (long) count * PING_TIMEOUT_MS + (long) (count - 1) * PING_INTERVAL_MS;
        return (int) Math.ceil(worstMs / 1000.0) + 3;
    }

    private TcpPingDiagnosisUtil() {
    }

    public static TcpPingDiagnosisResult performTcpPingDiagnosis(Node node, String targetIp, int port, String description, String leg, Long groupId) {
        return performTcpPingDiagnosis(node, targetIp, port, description, leg, groupId, getPingCount());
    }

    public static TcpPingDiagnosisResult performTcpPingDiagnosis(Node node, String targetIp, int port, String description, String leg, Long groupId, int pingCount) {
        try {
            JSONObject tcpPingData = new JSONObject();
            tcpPingData.put("ip", targetIp);
            tcpPingData.put("port", port);
            tcpPingData.put("count", pingCount);
            tcpPingData.put("timeout", PING_TIMEOUT_MS);

            // 发送TCP ping命令到节点；等待超时要盖过节点侧最坏情况耗时，否则目标真的不可达时，
            // 会在节点侧还没跑完全部尝试时就被这里提前判定为"请求超时"，掩盖掉本该拿到的
            // "全部尝试都失败"这个真实诊断结果
            GostDto gostResult = WebSocketServer.send_msg(node.getId(), tcpPingData, "TcpPing", waitTimeoutSeconds(pingCount));

            TcpPingDiagnosisResult result = new TcpPingDiagnosisResult();
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
                        result.setSuccess(true);
                        result.setMessage("TCP连接成功");
                        result.setAverageTime(0.0);
                        result.setPacketLoss(0.0);
                    }
                } catch (Exception e) {
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
            TcpPingDiagnosisResult result = new TcpPingDiagnosisResult();
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
    private static boolean isDispatchFailure(String msg) {
        if (msg == null) return true;
        return msg.contains("不在线") || msg.contains("连接已断开") || msg.startsWith("发送消息失败");
    }

    /**
     * 解析 TCP ping 响应中的逐次连接尝试明细（attempts 字段），供前端逐行展示；
     * 旧版节点 Agent 未返回该字段时返回空列表，前端回退为只显示汇总结果
     */
    private static List<Map<String, Object>> parsePingAttempts(JSONObject tcpPingResponse) {
        List<Map<String, Object>> attempts = new ArrayList<>();
        JSONArray rawAttempts = tcpPingResponse.getJSONArray("attempts");
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
}
