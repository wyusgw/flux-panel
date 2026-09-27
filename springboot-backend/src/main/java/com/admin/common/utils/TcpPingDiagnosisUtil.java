package com.admin.common.utils;

import com.admin.common.dto.GostDto;
import com.admin.common.dto.TcpPingDiagnosisResult;
import com.admin.entity.Node;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;

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

    /** 每个目标做几次 TCP 连接尝试（参考 ping 命令逐次列出结果） */
    public static final int PING_COUNT = 5;

    /** 每次连接尝试的超时时间（毫秒） */
    public static final int PING_TIMEOUT_MS = 3000;

    /**
     * 等待节点侧跑完这些尝试的超时时间（秒），要盖过节点侧的最坏情况耗时：
     * count * timeoutMs + (count-1) * 100ms 尝试间隔
     */
    public static final int WAIT_TIMEOUT_SECONDS = 20;

    private TcpPingDiagnosisUtil() {
    }

    public static TcpPingDiagnosisResult performTcpPingDiagnosis(Node node, String targetIp, int port, String description, String leg, Long groupId) {
        try {
            JSONObject tcpPingData = new JSONObject();
            tcpPingData.put("ip", targetIp);
            tcpPingData.put("port", port);
            tcpPingData.put("count", PING_COUNT);
            tcpPingData.put("timeout", PING_TIMEOUT_MS);

            // 发送TCP ping命令到节点；等待超时要盖过节点侧最坏情况耗时，否则目标真的不可达时，
            // 会在节点侧还没跑完全部尝试时就被这里提前判定为"请求超时"，掩盖掉本该拿到的
            // "全部尝试都失败"这个真实诊断结果
            GostDto gostResult = WebSocketServer.send_msg(node.getId(), tcpPingData, "TcpPing", WAIT_TIMEOUT_SECONDS);

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
