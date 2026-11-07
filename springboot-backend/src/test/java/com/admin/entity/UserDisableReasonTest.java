package com.admin.entity;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UserDisableReasonTest {

    private User user(int status, Integer reason) {
        User user = new User();
        user.setStatus(status);
        user.setDisableReason(reason);
        return user;
    }

    @Test
    void onlyExpiredAccountsCountAsDisabledByExpiry() {
        assertTrue(User.disabledByExpiry(user(0, User.DISABLE_REASON_EXPIRED)));
        assertFalse(User.disabledByExpiry(user(0, User.DISABLE_REASON_MANUAL)));
        assertFalse(User.disabledByExpiry(user(0, User.DISABLE_REASON_NONE)));
        assertFalse(User.disabledByExpiry(user(0, null)));
        assertFalse(User.disabledByExpiry(user(1, User.DISABLE_REASON_EXPIRED)));
        assertFalse(User.disabledByExpiry(null));
    }

    @Test
    void adminSaveKeepsOrUpdatesTheReason() {
        assertEquals(User.DISABLE_REASON_MANUAL, User.resolveDisableReason(1, User.DISABLE_REASON_NONE, 0));
        assertEquals(User.DISABLE_REASON_NONE, User.resolveDisableReason(0, User.DISABLE_REASON_MANUAL, 1));
        assertEquals(User.DISABLE_REASON_NONE, User.resolveDisableReason(0, User.DISABLE_REASON_EXPIRED, 1));
        // 编辑其他字段、状态没变：不能把到期停用改成管理员禁用，否则用户续费后恢复不了
        assertEquals(User.DISABLE_REASON_EXPIRED, User.resolveDisableReason(0, User.DISABLE_REASON_EXPIRED, 0));
        assertEquals(User.DISABLE_REASON_MANUAL, User.resolveDisableReason(0, User.DISABLE_REASON_MANUAL, 0));
        assertEquals(User.DISABLE_REASON_MANUAL, User.resolveDisableReason(0, null, 0));
    }

    /** 跑 update.sql 里真实的归类语句，确认存量数据分类正确，且重复执行不改变结果 */
    @Test
    void migrationClassifiesExistingDisabledUsers() throws Exception {
        String sql = new String(Files.readAllBytes(Paths.get("../database/update.sql")), StandardCharsets.UTF_8);
        Matcher matcher = Pattern.compile("UPDATE `user` SET `disable_reason` = \\d+\\s+WHERE [^;]+;").matcher(sql);

        JdbcTemplate jdbc = new JdbcTemplate(new EmbeddedDatabaseBuilder().setType(EmbeddedDatabaseType.H2)
                .setName(UUID.randomUUID() + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE").build());
        jdbc.execute("CREATE TABLE `user` (`id` int PRIMARY KEY, `status` int, `role_id` int, `exp_time` bigint, `disable_reason` int DEFAULT 0)");
        long past = 1000L;
        long future = 4102415999000L;
        jdbc.update("INSERT INTO `user` (`id`, `status`, `role_id`, `exp_time`) VALUES (1, 0, 1, ?)", past);   // 已到期
        jdbc.update("INSERT INTO `user` (`id`, `status`, `role_id`, `exp_time`) VALUES (2, 0, 1, ?)", future); // 未到期却停用
        jdbc.update("INSERT INTO `user` (`id`, `status`, `role_id`, `exp_time`) VALUES (3, 0, 1, NULL)");      // 永不过期却停用
        jdbc.update("INSERT INTO `user` (`id`, `status`, `role_id`, `exp_time`) VALUES (4, 1, 1, ?)", past);   // 还没跑到期任务
        jdbc.update("INSERT INTO `user` (`id`, `status`, `role_id`, `exp_time`) VALUES (5, 0, 0, ?)", past);   // 管理员账号

        int statements = 0;
        while (matcher.find()) {
            String statement = matcher.group().replace("UNIX_TIMESTAMP() * 1000", String.valueOf(System.currentTimeMillis()));
            jdbc.update(statement);
            jdbc.update(statement);
            statements++;
        }
        assertEquals(2, statements);

        assertEquals(User.DISABLE_REASON_EXPIRED, reason(jdbc, 1));
        assertEquals(User.DISABLE_REASON_MANUAL, reason(jdbc, 2));
        assertEquals(User.DISABLE_REASON_MANUAL, reason(jdbc, 3));
        assertEquals(User.DISABLE_REASON_NONE, reason(jdbc, 4));
        assertEquals(User.DISABLE_REASON_MANUAL, reason(jdbc, 5));
    }

    private int reason(JdbcTemplate jdbc, int id) {
        return jdbc.queryForObject("SELECT `disable_reason` FROM `user` WHERE `id` = ?", Integer.class, id);
    }
}
