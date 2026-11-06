package com.admin.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;

import javax.sql.DataSource;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 用内存数据库（MySQL 兼容模式）跑真实 SQL */
class DemoChangeServiceTest {

    private static final long DEMO_A = 7L;
    private static final long DEMO_B = 8L;

    private JdbcTemplate jdbc;
    private DemoChangeService service;

    @BeforeEach
    void setUp() {
        DataSource dataSource = new EmbeddedDatabaseBuilder().setType(EmbeddedDatabaseType.H2)
                .setName(UUID.randomUUID() + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE").build();
        jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("CREATE TABLE `config` (`id` int PRIMARY KEY, `name` varchar(50), `value` varchar(200), `time` bigint)");
        jdbc.execute("CREATE TABLE `user` (`id` bigint PRIMARY KEY, `demo_mode` int, `demo_restore_time` varchar(5), `package_id` bigint)");
        jdbc.execute("CREATE TABLE `demo_change_log` (`id` bigint AUTO_INCREMENT PRIMARY KEY, `user_id` bigint NOT NULL, `table_name` varchar(64) NOT NULL,"
                + " `row_id` varchar(64) NOT NULL, `before_json` longtext, `after_json` longtext, `created_time` bigint NOT NULL,"
                + " UNIQUE (`user_id`,`table_name`,`row_id`))");
        jdbc.update("INSERT INTO `config` VALUES (1, 'app_name', 'flux', 100), (2, 'site_announcement', NULL, 100)");
        jdbc.update("INSERT INTO `user` VALUES (7, 1, '03:00', NULL), (8, 1, NULL, 5), (9, 0, NULL, 5), (10, 0, NULL, 6)");
        service = new DemoChangeService(jdbc, new DataSourceTransactionManager(dataSource));
    }

    private void demoEdit(long userId, String sql, Object... args) {
        var snapshot = service.begin(Collections.singletonList("config"));
        jdbc.update(sql, args);
        service.finish(userId, snapshot);
    }

    private String appName() {
        return jdbc.queryForObject("SELECT `value` FROM `config` WHERE id = 1", String.class);
    }

    private long pending(long userId) {
        return (Long) service.pending(userId).get("count");
    }

    @Test
    void restoresUpdatedRowAndClearsLog() {
        demoEdit(DEMO_A, "UPDATE `config` SET `value` = 'hacked' WHERE id = 1");
        assertEquals(1, pending(DEMO_A));
        service.restore(DEMO_A);
        assertEquals("flux", appName());
        assertEquals(0, pending(DEMO_A));
    }

    @Test
    void restoresNullColumnsDeletedRowsAndCreatedRows() {
        demoEdit(DEMO_A, "UPDATE `config` SET `value` = 'x' WHERE id = 2");
        demoEdit(DEMO_A, "DELETE FROM `config` WHERE id = 1");
        demoEdit(DEMO_A, "INSERT INTO `config` VALUES (3, 'new_key', 'v', 1)");
        service.restore(DEMO_A);
        assertEquals("flux", appName());
        List<?> nullRow = jdbc.queryForList("SELECT 1 FROM `config` WHERE id = 2 AND `value` IS NULL");
        assertEquals(1, nullRow.size());
        assertEquals(0, jdbc.queryForList("SELECT 1 FROM `config` WHERE id = 3").size());
        assertEquals(100L, jdbc.queryForObject("SELECT `time` FROM `config` WHERE id = 1", Long.class));
    }

    @Test
    void repeatedEditsKeepTheOriginalAndChangingBackNeedsNoRestore() {
        demoEdit(DEMO_A, "UPDATE `config` SET `value` = 'one' WHERE id = 1");
        demoEdit(DEMO_A, "UPDATE `config` SET `value` = 'two' WHERE id = 1");
        assertEquals(1, pending(DEMO_A));
        demoEdit(DEMO_A, "UPDATE `config` SET `value` = 'flux' WHERE id = 1");
        assertEquals(0, pending(DEMO_A));
        demoEdit(DEMO_A, "UPDATE `config` SET `value` = 'three' WHERE id = 1");
        service.restore(DEMO_A);
        assertEquals("flux", appName());
    }

    @Test
    void realAdminEditIsNeverOverwritten() {
        demoEdit(DEMO_A, "UPDATE `config` SET `value` = 'demo' WHERE id = 1");
        jdbc.update("UPDATE `config` SET `value` = 'admin' WHERE id = 1");
        service.restore(DEMO_A);
        assertEquals("admin", appName());
        assertEquals(0, pending(DEMO_A));
    }

    @Test
    void commitMakesCurrentStateTheInitialOne() {
        demoEdit(DEMO_A, "UPDATE `config` SET `value` = 'keep' WHERE id = 1");
        service.commit(DEMO_A);
        service.restore(DEMO_A);
        assertEquals("keep", appName());
    }

    @Test
    void twoDemoAccountsRestoreBackToOriginalInEitherOrder() {
        demoEdit(DEMO_A, "UPDATE `config` SET `value` = 'a' WHERE id = 1");
        demoEdit(DEMO_B, "UPDATE `config` SET `value` = 'b' WHERE id = 1");
        service.restore(DEMO_A);
        assertEquals("b", appName());
        service.restore(DEMO_B);
        assertEquals("flux", appName());

        demoEdit(DEMO_A, "UPDATE `config` SET `value` = 'a' WHERE id = 1");
        demoEdit(DEMO_B, "UPDATE `config` SET `value` = 'b' WHERE id = 1");
        service.restore(DEMO_B);
        assertEquals("a", appName());
        service.restore(DEMO_A);
        assertEquals("flux", appName());
    }

    private java.util.Set<String> activeCodes() {
        java.util.Set<String> codes = new java.util.HashSet<>();
        service.activeAreas().forEach(area -> codes.add(area.getCode()));
        return codes;
    }

    private void setConfig(String name, String value) {
        jdbc.update("DELETE FROM `config` WHERE `name` = ?", name);
        jdbc.update("INSERT INTO `config` VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM `config`), ?, ?, 1)", name, value);
    }

    @Test
    void areasOfDisabledFeaturesAreHidden() {
        assertTrue(!activeCodes().contains("singleTunnelGroup"));
        assertTrue(!activeCodes().contains("inviteCode"));
        assertTrue(activeCodes().contains("site"));
        assertTrue(service.isAreaDisabled("singleTunnelGroup"));
        assertTrue(service.isAreaDisabled("noSuchArea"));

        setConfig("user_device_group_enabled", "false");
        setConfig("invite_register_policy", "disabled");
        assertTrue(!activeCodes().contains("singleTunnelGroup"));
        assertTrue(!activeCodes().contains("inviteCode"));

        setConfig("user_device_group_enabled", "true");
        setConfig("invite_register_policy", "optional");
        assertTrue(activeCodes().contains("singleTunnelGroup"));
        assertTrue(activeCodes().contains("inviteCode"));
        setConfig("invite_register_policy", "required");
        assertTrue(activeCodes().contains("inviteCode"));
        assertTrue(!service.isAreaDisabled("singleTunnelGroup"));
    }

    private void trafficEdit(String table, String sql) {
        var snapshot = service.begin(Collections.singletonList(table));
        jdbc.update(sql);
        service.finish(DEMO_A, snapshot);
    }

    private void createForwardTable() {
        jdbc.execute("CREATE TABLE `forward` (`id` bigint PRIMARY KEY, `remote_addr` varchar(50), `status` int, `in_flow` bigint, `out_flow` bigint, `updated_time` bigint, `tunnel_id` int, `in_device_group_id` bigint, `out_device_group_id` bigint)");
        jdbc.update("INSERT INTO `forward` VALUES (1, 'real:443', 1, 100, 100, 1, 2, NULL, NULL)");
    }

    @Test
    void forwardRestoresDespiteTrafficCountersMovingAndKeepsTheCounters() {
        createForwardTable();
        ForwardService forwards = org.mockito.Mockito.mock(ForwardService.class);
        org.mockito.Mockito.when(forwards.retrySyncForward(1L)).thenReturn(com.admin.common.lang.R.ok());
        service.setForwardService(forwards);

        trafficEdit("forward", "UPDATE `forward` SET remote_addr = 'evil:443' WHERE id = 1");
        jdbc.update("UPDATE `forward` SET in_flow = 999, out_flow = 888, updated_time = 2 WHERE id = 1");
        service.restore(DEMO_A);

        assertEquals("real:443", jdbc.queryForObject("SELECT remote_addr FROM `forward` WHERE id = 1", String.class));
        assertEquals(999L, jdbc.queryForObject("SELECT in_flow FROM `forward` WHERE id = 1", Long.class));
        org.mockito.Mockito.verify(forwards).retrySyncForward(1L);
    }

    @Test
    void realAdminEditToForwardIsStillRespected() {
        createForwardTable();
        ForwardService forwards = org.mockito.Mockito.mock(ForwardService.class);
        service.setForwardService(forwards);
        trafficEdit("forward", "UPDATE `forward` SET remote_addr = 'evil:443' WHERE id = 1");
        jdbc.update("UPDATE `forward` SET remote_addr = 'admin:443' WHERE id = 1");
        service.restore(DEMO_A);
        assertEquals("admin:443", jdbc.queryForObject("SELECT remote_addr FROM `forward` WHERE id = 1", String.class));
        org.mockito.Mockito.verifyNoInteractions(forwards);
    }

    @Test
    void deletedForwardComesBackAndIsPushedCreatedOneIsRemovedWithoutPush() {
        createForwardTable();
        ForwardService forwards = org.mockito.Mockito.mock(ForwardService.class);
        org.mockito.Mockito.when(forwards.retrySyncForward(1L)).thenReturn(com.admin.common.lang.R.ok());
        service.setForwardService(forwards);
        trafficEdit("forward", "DELETE FROM `forward` WHERE id = 1");
        trafficEdit("forward", "INSERT INTO `forward` VALUES (2, 'new:1', 1, 0, 0, 1, 2, NULL, NULL)");
        service.restore(DEMO_A);
        assertEquals(1, jdbc.queryForList("SELECT 1 FROM `forward` WHERE id = 1").size());
        assertEquals(0, jdbc.queryForList("SELECT 1 FROM `forward` WHERE id = 2").size());
        org.mockito.Mockito.verify(forwards).retrySyncForward(1L);
        org.mockito.Mockito.verify(forwards, org.mockito.Mockito.never()).retrySyncForward(2L);
    }

    @Test
    void failedNodePushDoesNotBreakDataRestore() {
        createForwardTable();
        ForwardService forwards = org.mockito.Mockito.mock(ForwardService.class);
        org.mockito.Mockito.when(forwards.retrySyncForward(1L)).thenThrow(new RuntimeException("node offline"));
        service.setForwardService(forwards);
        trafficEdit("forward", "UPDATE `forward` SET remote_addr = 'evil:443' WHERE id = 1");
        service.restore(DEMO_A);
        assertEquals("real:443", jdbc.queryForObject("SELECT remote_addr FROM `forward` WHERE id = 1", String.class));
        assertEquals(0, pending(DEMO_A));
    }

    private void packageEdit(String sql) {
        var snapshot = service.begin(Collections.singletonList("package_plan"));
        jdbc.update(sql);
        service.finish(DEMO_A, snapshot);
    }

    @Test
    void restoringPackageLimitPushesToNodesOnlyWhenLimitChanged() {
        jdbc.execute("CREATE TABLE `package_plan` (`id` bigint PRIMARY KEY, `price` decimal(10,2), `user_speed_limit` int)");
        jdbc.update("INSERT INTO `package_plan` VALUES (5, 10.00, 100)");
        ForwardService forwards = org.mockito.Mockito.mock(ForwardService.class);
        service.setForwardService(forwards);

        packageEdit("UPDATE `package_plan` SET price = 0 WHERE id = 5");
        service.restore(DEMO_A);
        org.mockito.Mockito.verifyNoInteractions(forwards);
        assertEquals(0, new java.math.BigDecimal("10.00").compareTo(jdbc.queryForObject("SELECT price FROM `package_plan` WHERE id = 5", java.math.BigDecimal.class)));

        packageEdit("UPDATE `package_plan` SET user_speed_limit = 1 WHERE id = 5");
        service.restore(DEMO_A);
        assertEquals(100, jdbc.queryForObject("SELECT user_speed_limit FROM `package_plan` WHERE id = 5", Integer.class));
        org.mockito.Mockito.verify(forwards).refreshLimitsAfterCommit(java.util.Arrays.asList(8, 9));
    }

    private long millis(LocalDateTime time) {
        return time.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    private void changeAt(long userId, LocalDateTime time) {
        demoEdit(userId, "UPDATE `config` SET `value` = 'c' WHERE id = 1");
        jdbc.update("UPDATE demo_change_log SET created_time = ? WHERE user_id = ?", millis(time), userId);
    }

    private static final LocalDateTime DAY = LocalDateTime.of(2026, 1, 10, 0, 0);

    @Test
    void restoresOnlyAfterTheDailyTimePasses() {
        changeAt(DEMO_A, DAY.withHour(2).withMinute(59));
        assertTrue(service.dueUsers(DAY.withHour(2).withMinute(59).withSecond(59)).isEmpty());
        assertEquals(List.of(DEMO_A), service.dueUsers(DAY.withHour(3)));
    }

    @Test
    void changeRightAfterTheDailyTimeWaitsForTomorrow() {
        changeAt(DEMO_A, DAY.withHour(3).withSecond(10));
        assertTrue(service.dueUsers(DAY.withHour(3).withSecond(30)).isEmpty());
        assertTrue(service.dueUsers(DAY.plusDays(1).withHour(2)).isEmpty());
        assertEquals(List.of(DEMO_A), service.dueUsers(DAY.plusDays(1).withHour(3)));
    }

    @Test
    void catchesUpAfterDowntime() {
        changeAt(DEMO_A, DAY.withHour(1));
        assertEquals(List.of(DEMO_A), service.dueUsers(DAY.plusDays(3).withHour(1)));
    }

    @Test
    void midnightIsARealTimeAndNullMeansNever() {
        jdbc.update("UPDATE `user` SET demo_restore_time = '00:00' WHERE id = 7");
        changeAt(DEMO_A, DAY.withHour(23));
        assertTrue(service.dueUsers(DAY.withHour(23).withMinute(59)).isEmpty());
        assertEquals(List.of(DEMO_A), service.dueUsers(DAY.plusDays(1)));

        changeAt(DEMO_B, DAY.withHour(1));
        assertEquals(List.of(DEMO_A), service.dueUsers(DAY.plusDays(30)));
    }

    @Test
    void nextRestoreTimeIsTomorrowUntilAnOverdueChangeExists() {
        LocalDateTime now = DAY.withHour(10);
        assertEquals(millis(DAY.plusDays(1).withHour(3)), DemoChangeService.nextRestoreMillis("03:00", millis(DAY.withHour(9)), now));
        assertEquals(millis(DAY.withHour(22)), DemoChangeService.nextRestoreMillis("22:00", millis(DAY.withHour(9)), now));
        assertEquals(millis(now), DemoChangeService.nextRestoreMillis("03:00", millis(DAY.withHour(1)), now));
    }
}
