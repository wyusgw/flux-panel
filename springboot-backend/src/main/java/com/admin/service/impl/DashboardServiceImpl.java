package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.Node;
import com.admin.entity.NodeDailyRawFlow;
import com.admin.entity.User;
import com.admin.entity.UserDailyRawFlow;
import com.admin.service.DashboardService;
import com.admin.service.NodeDailyRawFlowService;
import com.admin.service.NodeService;
import com.admin.service.UserDailyRawFlowService;
import com.admin.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
public class DashboardServiceImpl implements DashboardService {

    private static final DateTimeFormatter DAY_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final int RANKING_SIZE = 10;

    @Resource
    private UserDailyRawFlowService userDailyRawFlowService;

    @Resource
    private NodeDailyRawFlowService nodeDailyRawFlowService;

    @Resource
    private UserService userService;

    @Resource
    private NodeService nodeService;

    @Override
    public R getFlowStats() {
        String today = LocalDate.now().format(DAY_FORMAT);
        String yesterday = LocalDate.now().minusDays(1).format(DAY_FORMAT);

        List<UserDailyRawFlow> todayUserFlows = userDailyRawFlowService.listByDay(today);
        List<UserDailyRawFlow> yesterdayUserFlows = userDailyRawFlowService.listByDay(yesterday);
        List<NodeDailyRawFlow> todayNodeFlows = nodeDailyRawFlowService.listByDay(today);
        List<NodeDailyRawFlow> yesterdayNodeFlows = nodeDailyRawFlowService.listByDay(yesterday);

        Map<Long, String> userNames = loadUserNames(todayUserFlows, yesterdayUserFlows);
        Map<Long, String> nodeNames = loadNodeNames(todayNodeFlows, yesterdayNodeFlows);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("todayTotal", sumRawBytes(todayUserFlows));
        result.put("yesterdayTotal", sumRawBytes(yesterdayUserFlows));
        result.put("todayUserRanking", rankUsers(todayUserFlows, userNames));
        result.put("yesterdayUserRanking", rankUsers(yesterdayUserFlows, userNames));
        result.put("todayNodeRanking", rankNodes(todayNodeFlows, nodeNames));
        result.put("yesterdayNodeRanking", rankNodes(yesterdayNodeFlows, nodeNames));
        return R.ok(result);
    }

    private long sumRawBytes(List<UserDailyRawFlow> flows) {
        return flows.stream().mapToLong(f -> f.getRawBytes() != null ? f.getRawBytes() : 0L).sum();
    }

    private Map<Long, String> loadUserNames(List<UserDailyRawFlow> a, List<UserDailyRawFlow> b) {
        Set<Long> ids = new HashSet<>();
        a.forEach(f -> { if (f.getUserId() != null) ids.add(f.getUserId().longValue()); });
        b.forEach(f -> { if (f.getUserId() != null) ids.add(f.getUserId().longValue()); });
        if (ids.isEmpty()) return new HashMap<>();
        return userService.listByIds(ids).stream().collect(Collectors.toMap(User::getId, User::getUser));
    }

    private Map<Long, String> loadNodeNames(List<NodeDailyRawFlow> a, List<NodeDailyRawFlow> b) {
        Set<Long> ids = new HashSet<>();
        a.forEach(f -> { if (f.getNodeId() != null) ids.add(f.getNodeId()); });
        b.forEach(f -> { if (f.getNodeId() != null) ids.add(f.getNodeId()); });
        if (ids.isEmpty()) return new HashMap<>();
        return nodeService.listByIds(ids).stream().collect(Collectors.toMap(Node::getId, Node::getName));
    }

    private List<Map<String, Object>> rankUsers(List<UserDailyRawFlow> flows, Map<Long, String> names) {
        return flows.stream()
                .filter(f -> f.getRawBytes() != null && f.getRawBytes() > 0)
                .sorted(Comparator.comparingLong(UserDailyRawFlow::getRawBytes).reversed())
                .limit(RANKING_SIZE)
                .map(f -> {
                    Long userId = f.getUserId() != null ? f.getUserId().longValue() : null;
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("name", names.getOrDefault(userId, "用户#" + f.getUserId()));
                    row.put("value", f.getRawBytes());
                    return row;
                }).collect(Collectors.toList());
    }

    private List<Map<String, Object>> rankNodes(List<NodeDailyRawFlow> flows, Map<Long, String> names) {
        return flows.stream()
                .filter(f -> f.getRawBytes() != null && f.getRawBytes() > 0)
                .sorted(Comparator.comparingLong(NodeDailyRawFlow::getRawBytes).reversed())
                .limit(RANKING_SIZE)
                .map(f -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("name", names.getOrDefault(f.getNodeId(), "节点#" + f.getNodeId()));
                    row.put("value", f.getRawBytes());
                    return row;
                }).collect(Collectors.toList());
    }
}
