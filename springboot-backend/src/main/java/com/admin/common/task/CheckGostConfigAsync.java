package com.admin.common.task;

import com.admin.common.dto.*;
import com.admin.common.lang.R;
import com.admin.common.utils.ChainExit;
import com.admin.common.utils.GostUtil;
import com.admin.entity.*;
import com.admin.service.*;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Slf4j
@Service
public class CheckGostConfigAsync {

    @Resource
    private NodeService nodeService;

    @Resource
    @Lazy
    private ForwardService forwardService;

    @Resource
    @Lazy
    private SpeedLimitService speedLimitService;

    @Resource
    @Lazy
    private TunnelService tunnelService;



    /**
     * 清理孤立的Gost配置项
     */
    @Async
    public void cleanNodeConfigs(String node_id, GostConfigDto gostConfig) {
        System.out.println(JSONObject.toJSONString(gostConfig));
        Node node = nodeService.getById(node_id);
        if (node != null) {
            cleanOrphanedServices(gostConfig, node);
            cleanOrphanedChains(gostConfig, node);
            cleanOrphanedLimiters(gostConfig, node);
        }
    }

    /**
     * 清理孤立的服务
     */
    private void cleanOrphanedServices(GostConfigDto gostConfig, Node node) {
        if (gostConfig.getServices() == null) {
            return;
        }

        for (ConfigItem service : gostConfig.getServices()) {
            safeExecute(() -> {

                if (!Objects.equals(service.getName(), "web_api")){
                    String[] serviceIds = parseServiceName(service.getName());
                    if (serviceIds.length == 4) {
                        String forwardId = serviceIds[0];
                        String userId = serviceIds[1];
                        String userTunnelId = serviceIds[2];
                        String type = serviceIds[3];

                        if (Objects.equals(type, "tcp")) { // 只处理TCP，避免重复处理
                            Forward forward = forwardService.getById(forwardId);
                            if (forward == null) {
                                log.info("删除孤立的服务: {} (节点: {})", service.getName(), node.getId());
                                GostDto gostDto = GostUtil.DeleteService(node.getId(), forwardId + "_" + userId + "_" + userTunnelId);
                                System.out.println(gostDto);
                            }
                        }


                        if (Objects.equals(type, "tls")) {
                            Forward forward = forwardService.getById(forwardId);
                            if (forward == null) {
                                log.info("删除孤立的服务: {} (节点: {})", service.getName(), node.getId());
                                GostUtil.DeleteRemoteService(node.getId(), forwardId+"_"+userId+"_"+userTunnelId);
                            }
                        }

                    } else if (serviceIds.length == 5 && Objects.equals(serviceIds[4], "tls")) {
                        // 链式出口第 n 跳（n ≥ 2）的中继服务：{name}_h{n}_tls
                        Integer hopIndex = chainHopIndex(serviceIds[3]);
                        String base = serviceIds[0] + "_" + serviceIds[1] + "_" + serviceIds[2] + "_" + serviceIds[3];
                        if (hopIndex != null && !isDeployedChainHop(serviceIds[0], hopIndex, node.getId(), false)) {
                            log.info("删除孤立的链式出口中继服务: {} (节点: {})", service.getName(), node.getId());
                            GostUtil.DeleteRemoteService(node.getId(), base);
                        }
                    }
                }


            }, "清理服务 " + service.getName());
        }

    }

    /**
     * 清理孤立的链
     */
    private void cleanOrphanedChains(GostConfigDto gostConfig, Node node) {
        if (gostConfig.getChains() == null) {
            return;
        }
        

        for (ConfigItem chain : gostConfig.getChains()) {
            safeExecute(() -> {
                String[] serviceIds = parseServiceName(chain.getName());
                if (serviceIds.length == 4) {
                    String forwardId = serviceIds[0];
                    String userId = serviceIds[1];
                    String userTunnelId = serviceIds[2];
                    String type = serviceIds[3];
                    
                    if (Objects.equals(type, "chains")) {
                        Forward forward = forwardService.getById(forwardId);
                        if (forward == null) {
                            log.info("删除孤立的链: {} (节点: {})", chain.getName(), node.getId());
                            GostUtil.DeleteChains(node.getId(), forwardId+"_"+userId+"_"+userTunnelId);
                        }
                    }
                } else if (serviceIds.length == 5 && Objects.equals(serviceIds[4], "chains")) {
                    // 链式出口第 n 跳通往下一跳的链：{name}_h{n}_chains
                    Integer hopIndex = chainHopIndex(serviceIds[3]);
                    String base = serviceIds[0] + "_" + serviceIds[1] + "_" + serviceIds[2] + "_" + serviceIds[3];
                    if (hopIndex != null && !isDeployedChainHop(serviceIds[0], hopIndex, node.getId(), true)) {
                        log.info("删除孤立的链式出口链: {} (节点: {})", chain.getName(), node.getId());
                        GostUtil.DeleteChains(node.getId(), base);
                    }
                }
            }, "清理链 " + chain.getName());
        }
    }

    /**
     * 清理孤立的限流器
     */
    private void cleanOrphanedLimiters(GostConfigDto gostConfig, Node node) {
        if (gostConfig.getLimiters() == null) {
            return;
        }
        

        for (ConfigItem limiter : gostConfig.getLimiters()) {
            safeExecute(() -> {
                SpeedLimit speedLimit = speedLimitService.getById(limiter.getName());
                if (speedLimit == null) {
                    log.info("删除孤立的限流器: {} (节点: {})", limiter.getName(), node.getId());
                    GostUtil.DeleteLimiters(node.getId(), Long.parseLong(limiter.getName()));
                }
            }, "清理限流器 " + limiter.getName());
        }
    }

    /**
     * 同步限流器
     */
    private void syncLimiters(GostConfigDto gostConfig, Node node) {
        List<Tunnel> tunnelList = tunnelService.list(new QueryWrapper<Tunnel>().eq("in_node_id", node.getId()));
        if (tunnelList == null || tunnelList.isEmpty()) return;
        safeExecute(() -> {
            StringBuilder tunnelIds = new StringBuilder();
            for (Tunnel tunnel : tunnelList) {
                tunnelIds.append(tunnel.getId()).append(",");
            }
            String ids = tunnelIds.deleteCharAt(tunnelIds.length() - 1).toString();
            List<SpeedLimit> speedLimits = speedLimitService.list(new QueryWrapper<SpeedLimit>().in("tunnel_id", ids));
            if (speedLimits != null && !speedLimits.isEmpty()) {
                List<ConfigItem> limiters = gostConfig.getLimiters();
                List<Long> limiters_ids = new ArrayList<>();
                List<Long>  speedLimits_ids = new ArrayList<>();
                if (limiters != null){
                    for (ConfigItem limiter : limiters) {
                        limiters_ids.add(Long.valueOf(limiter.getName()));
                    }
                }
                for (SpeedLimit speedLimit : speedLimits) {
                    speedLimits_ids.add(speedLimit.getId());
                }
                List<Long> diff = new ArrayList<>(speedLimits_ids);
                diff.removeAll(limiters_ids);
                System.out.println(diff);
                if (!diff.isEmpty()) {

                    for (Long speed_id : diff) {
                        SpeedLimit speedLimit = speedLimitService.getById(speed_id);
                        if (speedLimit != null) {
                            SpeedLimitUpdateDto speedLimitUpdateDto = new SpeedLimitUpdateDto();
                            speedLimitUpdateDto.setId(speed_id);
                            speedLimitUpdateDto.setName(speedLimit.getName());
                            speedLimitUpdateDto.setSpeed(speedLimit.getSpeed());
                            speedLimitUpdateDto.setTunnelId(speedLimit.getTunnelId());
                            speedLimitUpdateDto.setTunnelName(speedLimit.getTunnelName());
                            speedLimitService.updateSpeedLimit(speedLimitUpdateDto);
                        }
                    }
                }
            }
        }, "同步限流器 ");
    }

    /**
     * 安全执行操作，捕获异常
     */
    private void safeExecute(Runnable operation, String operationDesc) {
        try {
            operation.run();
        } catch (Exception e) {
            log.info("执行操作失败: {}", operationDesc, e);
        }
    }


    /** 「h{n}」里的跳序号（从 1 开始）转成下标（从 0 开始）；格式不对返回 null */
    static Integer chainHopIndex(String part) {
        if (part == null || !part.matches("h\\d{1,2}")) {
            return null;
        }
        int hop = Integer.parseInt(part.substring(1));
        return hop >= 1 ? hop - 1 : null;
    }

    /**
     * 规则还在、仍是链式出口、且记录的路径里这一跳确实在这个节点上时才算在用（链只有中间跳才有，最后一跳的链不算）；
     * 规则已删除、改成了别的出口、或这一跳换到了别的节点（当时节点离线没删掉）都算孤立
     */
    private boolean isDeployedChainHop(String forwardId, int hopIndex, Long nodeId, boolean isChainConfig) {
        Forward forward = forwardService.getById(forwardId);
        if (forward == null) {
            return false;
        }
        List<com.admin.common.dto.ChainExitHop> hops = ChainExit.parse(forward.getChainHops());
        int limit = isChainConfig ? hops.size() - 1 : hops.size();
        return hopIndex < limit && Objects.equals(hops.get(hopIndex).getNodeId(), nodeId);
    }

    /**
     * 解析服务名称
     */
    private String[] parseServiceName(String serviceName) {
        return serviceName.split("_");
    }
}
