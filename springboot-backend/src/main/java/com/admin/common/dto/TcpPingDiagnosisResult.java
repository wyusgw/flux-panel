package com.admin.common.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * TCP ping 诊断的单段结果：转发规则诊断（ForwardServiceImpl）与隧道诊断（TunnelServiceImpl）
 * 共用同一套结构与渲染方式，前端逐次列出每次连接尝试（类似 ping 输出，一行一次）。
 */
@Data
public class TcpPingDiagnosisResult {
    private Long nodeId;
    private String nodeName;
    /** 该诊断段所属的设备组ID（旧版隧道模式无设备组概念时为空），供前端展示 GID */
    private Long groupId;
    /** inbound-入口诊断，outbound-出口诊断，供前端分区展示；不区分场景（如隧道诊断）可留空 */
    private String leg;
    private String targetIp;
    private Integer targetPort;
    private String description;
    private boolean success;
    private String message;
    private double averageTime;
    private double packetLoss;
    private long timestamp;
    /** 是否连消息都没能发送到节点（节点离线/连接已断开/发送异常），区别于"发送成功但目标不可达" */
    private boolean dispatchFailed;
    /** 是否成功收到节点回复（无论 ping 本身是否成功），用于统计"回收任务"数 */
    private boolean recovered;
    /** 每一次 TCP 连接尝试的明细：{seq, success, timeMs, error}，供前端逐行展示（类似 ping 输出） */
    private List<Map<String, Object>> attempts;
}
