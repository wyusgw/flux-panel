package com.admin.service;

import com.admin.common.dto.SpeedLimitUpdateDto;
import com.admin.common.lang.R;
import com.admin.common.utils.DemoArea;
import com.admin.common.utils.WebSocketServer;
import com.alibaba.fastjson.JSONObject;
import com.alibaba.fastjson2.JSON;
import lombok.extern.slf4j.Slf4j;
import com.alibaba.fastjson2.JSONWriter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

/**
 * 记录并撤销演示账号的改动。
 * 不改各业务代码：演示账号发起修改前后各读一次相关表，比较差异得到改了哪些行。
 * 每行只保留最早的改动前内容，恢复时只还原「现在仍是演示账号改后的样子」的行——
 * 期间被真管理员或用户操作改过的行不会被覆盖。
 * 表名只来自 ReadOnlyInterceptor 的固定列表，列名只来自数据库本身，不接受外部输入。
 */
@Slf4j
@Service
public class DemoChangeService {

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    /** 演示账号的修改和恢复串行执行，否则别的请求的改动会被算到当前账号头上 */
    private final ReentrantLock lock = new ReentrantLock();

    private ForwardService forwardService;
    private SpeedLimitService speedLimitService;

    /** 由系统持续改写的列：比较时忽略，恢复时也不写回。否则流量一变，就会误判为被别人改过而还原不了 */
    private static final Map<String, Set<String>> VOLATILE_COLUMNS = new HashMap<>();

    static {
        VOLATILE_COLUMNS.put("forward", new HashSet<>(Arrays.asList("in_flow", "out_flow", "updated_time")));
        VOLATILE_COLUMNS.put("user", new HashSet<>(Arrays.asList("in_flow", "out_flow", "updated_time",
                "telegram_last_expiry_reminder_date", "telegram_last_flow_reminder_date")));
        VOLATILE_COLUMNS.put("user_tunnel", new HashSet<>(Arrays.asList("in_flow", "out_flow")));
        VOLATILE_COLUMNS.put("node", new HashSet<>(Arrays.asList("status", "version", "updated_time")));
        VOLATILE_COLUMNS.put("tunnel", Collections.singleton("updated_time"));
    }

    public DemoChangeService(JdbcTemplate jdbc, PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    @Autowired
    public void setForwardService(@Lazy ForwardService forwardService) {
        this.forwardService = forwardService;
    }

    @Autowired
    public void setSpeedLimitService(@Lazy SpeedLimitService speedLimitService) {
        this.speedLimitService = speedLimitService;
    }

    /** 修改前调用：加锁并记下相关表的当前内容。之后必须调用 finish */
    public Map<String, Map<String, String>> begin(Collection<String> tables) {
        acquire();
        try {
            Map<String, Map<String, String>> snapshot = new HashMap<>();
            for (String table : tables) {
                snapshot.put(table, readTable(table));
            }
            return snapshot;
        } catch (RuntimeException e) {
            lock.unlock();
            throw e;
        }
    }

    /** 修改后调用：比较差异写入改动记录并解锁 */
    public void finish(Long userId, Map<String, Map<String, String>> before) {
        try {
            transaction.executeWithoutResult(status -> before.forEach((table, rows) -> recordDiff(userId, table, rows)));
        } finally {
            lock.unlock();
        }
    }

    private void recordDiff(Long userId, String table, Map<String, String> before) {
        Map<String, String> after = readTable(table);
        Set<String> ids = new HashSet<>(before.keySet());
        ids.addAll(after.keySet());
        for (String id : ids) {
            String oldRow = before.get(id);
            String newRow = after.get(id);
            if (sameContent(table, oldRow, newRow)) {
                continue;
            }
            List<Map<String, Object>> existing = jdbc.queryForList(
                    "SELECT id, before_json FROM demo_change_log WHERE user_id = ? AND table_name = ? AND row_id = ?",
                    userId, table, id);
            if (existing.isEmpty()) {
                jdbc.update("INSERT INTO demo_change_log (user_id, table_name, row_id, before_json, after_json, created_time) VALUES (?, ?, ?, ?, ?, ?)",
                        userId, table, id, oldRow, newRow, System.currentTimeMillis());
            } else if (sameContent(table, (String) existing.get(0).get("before_json"), newRow)) {
                // 又改回了最初的样子，不再需要恢复
                jdbc.update("DELETE FROM demo_change_log WHERE id = ?", existing.get(0).get("id"));
            } else {
                jdbc.update("UPDATE demo_change_log SET after_json = ? WHERE id = ?", newRow, existing.get(0).get("id"));
            }
        }
    }

    /** 撤销该账号的所有改动 */
    public void restore(Long userId) {
        Set<String> restored = new HashSet<>();
        acquire();
        try {
            transaction.executeWithoutResult(status -> doRestore(userId, restored));
        } finally {
            lock.unlock();
        }
        syncNodes(restored);
    }

    private void doRestore(Long userId, Set<String> restored) {
        List<Map<String, Object>> entries = jdbc.queryForList(
                "SELECT table_name, row_id, before_json, after_json FROM demo_change_log WHERE user_id = ? ORDER BY id DESC", userId);
        List<String> packagesWithChangedLimit = new ArrayList<>();
        for (Map<String, Object> entry : entries) {
            String table = (String) entry.get("table_name");
            String id = (String) entry.get("row_id");
            String before = (String) entry.get("before_json");
            String after = (String) entry.get("after_json");
            if (sameContent(table, readRow(table, id), after)) {
                writeRow(table, id, before, after);
                if (before != null) {
                    restored.add(table + ":" + id);
                }
                if (speedLimitChanged(table, before, after)) {
                    packagesWithChangedLimit.add(id);
                }
            } else {
                // 这行之后又被改过。如果是另一个演示账号接着改的，它记录的改动前内容是本账号改后的值，
                // 要接到本账号的改动前内容上，否则那个账号恢复时只会回到本账号改后的样子
                List<Map<String, Object>> others = jdbc.queryForList(
                        "SELECT id, before_json FROM demo_change_log WHERE table_name = ? AND row_id = ? AND user_id <> ?", table, id, userId);
                for (Map<String, Object> other : others) {
                    if (sameContent(table, (String) other.get("before_json"), after)) {
                        jdbc.update("UPDATE demo_change_log SET before_json = ? WHERE id = ?", before, other.get("id"));
                    }
                }
            }
        }
        jdbc.update("DELETE FROM demo_change_log WHERE user_id = ?", userId);
        refreshPackageLimits(packagesWithChangedLimit);
    }

    /**
     * 只还原数据库不会改变节点上正在运行的配置，这里把受影响的配置重新推给节点。
     * 节点离线等推送失败不影响数据恢复，转发规则有同步重试机制，节点上线后会补推。
     * 演示账号新建又被撤销的转发规则：节点上的服务成为孤立服务，由节点上报配置时的清理任务删除。
     */
    private void syncNodes(Set<String> restored) {
        if (restored.isEmpty() || forwardService == null) {
            return;
        }
        Set<Long> forwardIds = new HashSet<>();
        Set<Integer> limitUsers = new HashSet<>();
        for (String item : restored) {
            String table = item.substring(0, item.indexOf(':'));
            String id = item.substring(item.indexOf(':') + 1);
            try {
                switch (table) {
                    case "forward":
                        forwardIds.add(Long.valueOf(id));
                        break;
                    case "tunnel":
                        forwardIds.addAll(jdbc.queryForList("SELECT id FROM `forward` WHERE tunnel_id = ?", Long.class, id));
                        break;
                    case "device_group":
                    case "device_group_chain_hop":
                        if ("device_group".equals(table)) {
                            forwardIds.addAll(jdbc.queryForList("SELECT id FROM `forward` WHERE in_device_group_id = ? OR out_device_group_id = ?", Long.class, id, id));
                        }
                        break;
                    case "user":
                        limitUsers.add(Integer.valueOf(id));
                        break;
                    case "user_tunnel":
                        limitUsers.addAll(jdbc.queryForList("SELECT user_id FROM `user_tunnel` WHERE id = ?", Integer.class, id));
                        break;
                    case "speed_limit":
                        syncSpeedLimit(id);
                        break;
                    case "node":
                        syncNodeProtocol(id);
                        break;
                    default:
                        break;
                }
            } catch (Exception e) {
                log.warn("恢复后同步节点失败: {}", item, e);
            }
        }
        for (Long forwardId : forwardIds) {
            try {
                R result = forwardService.retrySyncForward(forwardId);
                if (result.getCode() != 0) {
                    log.warn("恢复后同步转发 {} 失败: {}", forwardId, result.getMsg());
                }
            } catch (Exception e) {
                log.warn("恢复后同步转发 {} 失败", forwardId, e);
            }
        }
        if (!limitUsers.isEmpty()) {
            forwardService.refreshLimitsAfterCommit(limitUsers);
        }
    }

    private void syncSpeedLimit(String id) {
        if (speedLimitService == null) {
            return;
        }
        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM `speed_limit` WHERE id = ?", id);
        SpeedLimitUpdateDto dto = new SpeedLimitUpdateDto();
        dto.setId(((Number) row.get("id")).longValue());
        dto.setName((String) row.get("name"));
        dto.setSpeed(((Number) row.get("speed")).intValue());
        dto.setTunnelId(((Number) row.get("tunnel_id")).longValue());
        dto.setTunnelName((String) row.get("tunnel_name"));
        speedLimitService.updateSpeedLimit(dto);
    }

    private void syncNodeProtocol(String id) {
        Map<String, Object> row = jdbc.queryForMap("SELECT http, tls, socks, ss, status FROM `node` WHERE id = ?", id);
        if (!Integer.valueOf(1).equals(((Number) row.get("status")).intValue())) {
            return;
        }
        JSONObject request = new JSONObject();
        request.put("http", row.get("http"));
        request.put("tls", row.get("tls"));
        request.put("socks", row.get("socks"));
        request.put("ss", row.get("ss"));
        WebSocketServer.send_msg(Long.valueOf(id), request, "SetProtocol");
    }

    /** 比较两行内容，忽略系统持续改写的列 */
    private static boolean sameContent(String table, String left, String right) {
        Set<String> ignored = VOLATILE_COLUMNS.get(table);
        if (ignored == null || left == null || right == null) {
            return Objects.equals(left, right);
        }
        return Objects.equals(withoutColumns(left, ignored), withoutColumns(right, ignored));
    }

    private static String withoutColumns(String json, Set<String> ignored) {
        Map<String, Object> row = new TreeMap<>(JSON.parseObject(json));
        row.keySet().removeAll(ignored);
        return JSON.toJSONString(row, JSONWriter.Feature.WriteMapNullValue);
    }

    /** 套餐限速已经下发到节点，只还原数据库的话节点上还是演示账号改的限速 */
    private static boolean speedLimitChanged(String table, String before, String after) {
        if (!"package_plan".equals(table) || before == null || after == null) {
            return false;
        }
        return !Objects.equals(JSON.parseObject(before).get("user_speed_limit"), JSON.parseObject(after).get("user_speed_limit"));
    }

    private void refreshPackageLimits(List<String> packageIds) {
        if (packageIds.isEmpty() || forwardService == null) {
            return;
        }
        String marks = String.join(", ", packageIds.stream().map(id -> "?").toArray(String[]::new));
        List<Integer> userIds = jdbc.queryForList("SELECT id FROM `user` WHERE package_id IN (" + marks + ")", Integer.class, packageIds.toArray());
        if (!userIds.isEmpty()) {
            forwardService.refreshLimitsAfterCommit(userIds);
        }
    }

    /** 设为初始配置：确认该账号至今的改动，以后恢复到现在的样子 */
    public void commit(Long userId) {
        acquire();
        try {
            jdbc.update("DELETE FROM demo_change_log WHERE user_id = ?", userId);
        } finally {
            lock.unlock();
        }
    }

    /** 功能已开启、可以分配的区域 */
    public List<DemoArea> activeAreas() {
        List<DemoArea> areas = new ArrayList<>();
        for (DemoArea area : DemoArea.values()) {
            if (area.isFeatureEnabled(this::configValue)) {
                areas.add(area);
            }
        }
        return areas;
    }

    /** 这个区域对应的功能是否已关闭 */
    public boolean isAreaDisabled(String code) {
        for (DemoArea area : DemoArea.values()) {
            if (area.getCode().equals(code)) {
                return !area.isFeatureEnabled(this::configValue);
            }
        }
        return true;
    }

    private String configValue(String name) {
        List<String> values = jdbc.queryForList("SELECT `value` FROM `config` WHERE `name` = ?", String.class, name);
        return values.isEmpty() ? null : values.get(0);
    }

    /** 待恢复的改动数量和最早改动时间 */
    public Map<String, Object> pending(Long userId) {
        Map<String, Object> row = jdbc.queryForMap(
                "SELECT COUNT(*) AS cnt, MIN(created_time) AS earliest FROM demo_change_log WHERE user_id = ?", userId);
        Map<String, Object> result = new HashMap<>();
        result.put("count", ((Number) row.get("cnt")).longValue());
        result.put("earliest", row.get("earliest"));
        return result;
    }

    /**
     * 需要恢复的账号：有改动早于最近一次恢复时刻。
     * 不记录上次运行时间——服务器在恢复时刻宕机时，重启后也能补上；恢复时刻之后才发生的改动等到下一天
     */
    public List<Long> dueUsers(LocalDateTime now) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT l.user_id AS uid, MIN(l.created_time) AS earliest, u.demo_restore_time AS restore_time "
                        + "FROM demo_change_log l JOIN `user` u ON u.id = l.user_id "
                        + "WHERE u.demo_mode = 1 AND u.demo_restore_time IS NOT NULL GROUP BY l.user_id, u.demo_restore_time");
        List<Long> due = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            LocalTime time = parseTime((String) row.get("restore_time"));
            if (time != null && ((Number) row.get("earliest")).longValue() < toMillis(lastOccurrence(time, now))) {
                due.add(((Number) row.get("uid")).longValue());
            }
        }
        return due;
    }

    /** 下一次恢复的时间；现在已有改动早于最近一次恢复时刻时，就是下一次检查 */
    public static long nextRestoreMillis(String restoreTime, long earliestChange, LocalDateTime now) {
        LocalTime time = parseTime(restoreTime);
        if (time == null) {
            throw new IllegalArgumentException("无效的恢复时刻: " + restoreTime);
        }
        LocalDateTime last = lastOccurrence(time, now);
        return earliestChange < toMillis(last) ? toMillis(now) : toMillis(last.plusDays(1));
    }

    static LocalDateTime lastOccurrence(LocalTime time, LocalDateTime now) {
        LocalDateTime today = now.toLocalDate().atTime(time);
        return today.isAfter(now) ? today.minusDays(1) : today;
    }

    private static LocalTime parseTime(String value) {
        try {
            return value == null ? null : LocalTime.parse(value);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static long toMillis(LocalDateTime time) {
        return time.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    private void acquire() {
        try {
            if (!lock.tryLock(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("演示数据正在处理中，请稍后重试");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("演示数据正在处理中，请稍后重试");
        }
    }

    private Map<String, String> readTable(String table) {
        Map<String, String> rows = new HashMap<>();
        for (Map<String, Object> row : jdbc.queryForList("SELECT * FROM `" + table + "`")) {
            rows.put(String.valueOf(row.get("id")), canonical(row));
        }
        return rows;
    }

    private String readRow(String table, String id) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM `" + table + "` WHERE id = ?", id);
        return rows.isEmpty() ? null : canonical(rows.get(0));
    }

    private void writeRow(String table, String id, String before, String after) {
        if (before == null) {
            jdbc.update("DELETE FROM `" + table + "` WHERE id = ?", id);
            return;
        }
        Map<String, Object> values = new LinkedHashMap<>(JSON.parseObject(before));
        if (after != null && VOLATILE_COLUMNS.containsKey(table)) {
            // 更新已有行时不写系统持续改写的列（如流量计数），否则这段时间的流量统计会被写回去
            values.keySet().removeAll(VOLATILE_COLUMNS.get(table));
        }
        List<String> columns = new ArrayList<>(values.keySet());
        if (after == null) {
            String names = String.join(", ", columns.stream().map(c -> "`" + c + "`").toArray(String[]::new));
            String marks = String.join(", ", columns.stream().map(c -> "?").toArray(String[]::new));
            jdbc.update("INSERT INTO `" + table + "` (" + names + ") VALUES (" + marks + ")", values.values().toArray());
            return;
        }
        String assignments = String.join(", ", columns.stream().map(c -> "`" + c + "` = ?").toArray(String[]::new));
        List<Object> args = new ArrayList<>(values.values());
        args.add(id);
        jdbc.update("UPDATE `" + table + "` SET " + assignments + " WHERE id = ?", args.toArray());
    }

    private static String canonical(Map<String, Object> row) {
        // 必须保留空值列：否则恢复时把列写不回 NULL
        return JSON.toJSONString(new TreeMap<>(row), JSONWriter.Feature.WriteMapNullValue);
    }
}
