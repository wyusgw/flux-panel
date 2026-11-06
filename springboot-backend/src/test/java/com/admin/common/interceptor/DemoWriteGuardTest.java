package com.admin.common.interceptor;

import com.admin.common.dto.NodeUpdateDto;
import com.admin.common.dto.UserDto;
import com.admin.common.dto.UserUpdateDto;
import com.admin.common.exception.ReadOnlyException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class DemoWriteGuardTest {

    private DemoWriteGuard guard;

    @BeforeEach
    void setUp() {
        JdbcTemplate jdbc = new JdbcTemplate(new EmbeddedDatabaseBuilder().setType(EmbeddedDatabaseType.H2)
                .setName(UUID.randomUUID() + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE").build());
        jdbc.execute("CREATE TABLE `user` (`id` bigint PRIMARY KEY, `user` varchar(50), `role_id` int, `wallet_balance` decimal(10,2))");
        jdbc.update("INSERT INTO `user` VALUES (1, 'admin', 0, 0), (7, 'alice', 1, 88.50)");
        jdbc.execute("CREATE TABLE `node` (`id` bigint PRIMARY KEY, `ip` varchar(50), `server_ip` varchar(50))");
        jdbc.update("INSERT INTO `node` VALUES (3, '203.0.113.9', '198.51.100.1')");
        guard = new DemoWriteGuard(jdbc);
    }

    private UserUpdateDto userUpdate(long id) {
        UserUpdateDto dto = new UserUpdateDto();
        dto.setId(id);
        dto.setUser("用户" + id);
        dto.setWalletBalance(BigDecimal.ZERO);
        dto.setPwd("newpassword");
        dto.setAdmin(true);
        dto.setDemoMode(0);
        return dto;
    }

    @Test
    void maskedNodeAddressesAreReplacedWithRealOnes() {
        NodeUpdateDto dto = new NodeUpdateDto();
        dto.setId(3L);
        dto.setName("HK-1");
        dto.setIp("***");
        dto.setServerIp("***");
        guard.apply("/api/v1/node/update", "node", dto);
        assertEquals("203.0.113.9", dto.getIp());
        assertEquals("198.51.100.1", dto.getServerIp());
        assertEquals("HK-1", dto.getName());
    }

    @Test
    void realValuesTheVisitorTypedAreKept() {
        NodeUpdateDto dto = new NodeUpdateDto();
        dto.setId(3L);
        dto.setIp("192.0.2.1");
        dto.setServerIp("***");
        guard.apply("/api/v1/node/update", "node", dto);
        assertEquals("192.0.2.1", dto.getIp());
    }

    @Test
    void userEditCannotEscalateChangePasswordOrWallet() {
        UserUpdateDto dto = userUpdate(7);
        guard.apply("/api/v1/user/update", "user", dto);
        assertEquals("alice", dto.getUser());
        assertEquals(0, new BigDecimal("88.50").compareTo(dto.getWalletBalance()));
        assertNull(dto.getPwd());
        assertNull(dto.getAdmin());
        assertNull(dto.getDemoMode());
    }

    @Test
    void walletCannotBeRaisedEvenWithRealLookingNumber() {
        UserUpdateDto dto = userUpdate(7);
        dto.setWalletBalance(new BigDecimal("99999"));
        guard.apply("/api/v1/user/update", "user", dto);
        assertEquals(0, new BigDecimal("88.50").compareTo(dto.getWalletBalance()));
    }

    @Test
    void adminAccountsCannotBeEditedOrDeleted() {
        assertThrows(ReadOnlyException.class, () -> guard.apply("/api/v1/user/update", "user", userUpdate(1)));
        assertThrows(ReadOnlyException.class, () -> guard.apply("/api/v1/user/delete", "user", Collections.singletonMap("id", 1)));
        assertThrows(ReadOnlyException.class, () -> guard.apply("/api/v1/user/delete", "user", Collections.singletonMap("id", 404)));
        guard.apply("/api/v1/user/delete", "user", Collections.singletonMap("id", 7));
    }

    @Test
    void createdUsersAreNeverAdminAndStartWithNoMoney() {
        UserDto dto = new UserDto();
        dto.setUser("bob");
        dto.setPwd("secret123");
        dto.setAdmin(true);
        dto.setDemoMode(1);
        dto.setWalletBalance(new BigDecimal("99999"));
        guard.apply("/api/v1/user/create", "user", dto);
        assertEquals(false, dto.getAdmin());
        assertEquals(0, dto.getDemoMode());
        assertEquals(0, BigDecimal.ZERO.compareTo(dto.getWalletBalance()));
        assertEquals("secret123", dto.getPwd());
    }

    @Test
    void maskedValueOnCreateOrInNestedBodyIsRejected() {
        NodeUpdateDto noId = new NodeUpdateDto();
        noId.setIp("***");
        assertThrows(ReadOnlyException.class, () -> guard.apply("/api/v1/node/create", "node", noId));
        assertThrows(ReadOnlyException.class, () -> guard.apply("/api/v1/forward/updateOrder", "forward",
                Collections.singletonMap("remoteAddr", "***")));
    }
}
