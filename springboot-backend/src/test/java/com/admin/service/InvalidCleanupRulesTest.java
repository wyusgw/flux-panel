package com.admin.service;

import com.admin.entity.Forward;
import com.admin.entity.User;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InvalidCleanupRulesTest {

    private static User user() {
        User user = new User();
        user.setId(7L);
        user.setRoleId(1);
        user.setDemoMode(0);
        user.setWalletBalance(new BigDecimal("0.00"));
        return user;
    }

    private static final Set<Long> NONE = Collections.emptySet();

    @Test
    void neverPaidUserIsInvalid() {
        assertTrue(InvalidCleanupService.isInvalidUser(user(), NONE));
        User nullBalance = user();
        nullBalance.setWalletBalance(null);
        nullBalance.setGroupId(0L);
        assertTrue(InvalidCleanupService.isInvalidUser(nullBalance, NONE));
    }

    @Test
    void anySignOfPayingKeepsTheUser() {
        User group = user();
        group.setGroupId(1L);
        assertFalse(InvalidCleanupService.isInvalidUser(group, NONE));
        User balance = user();
        balance.setWalletBalance(new BigDecimal("0.01"));
        assertFalse(InvalidCleanupService.isInvalidUser(balance, NONE));
        User plan = user();
        plan.setPackageId(59L);
        assertFalse(InvalidCleanupService.isInvalidUser(plan, NONE));
        assertFalse(InvalidCleanupService.isInvalidUser(user(), Collections.singleton(7L)));
    }

    @Test
    void adminsAndDemoAccountsAreNeverInvalid() {
        User admin = user();
        admin.setRoleId(0);
        assertFalse(InvalidCleanupService.isInvalidUser(admin, NONE));
        User demo = user();
        demo.setDemoMode(1);
        assertFalse(InvalidCleanupService.isInvalidUser(demo, NONE));
        User unknownRole = user();
        unknownRole.setRoleId(null);
        assertFalse(InvalidCleanupService.isInvalidUser(unknownRole, NONE));
    }

    private static Forward forward(Integer userId, Integer tunnelId, Long in, Long out) {
        Forward forward = new Forward();
        forward.setUserId(userId);
        forward.setTunnelId(tunnelId);
        forward.setInDeviceGroupId(in);
        forward.setOutDeviceGroupId(out);
        return forward;
    }

    private static boolean invalid(Forward forward) {
        return InvalidCleanupService.isInvalidForward(forward, Set.of(7L), Set.of(2L), Set.of(10L, 11L));
    }

    @Test
    void validForwardsAreKept() {
        assertFalse(invalid(forward(7, 2, null, null)));
        assertFalse(invalid(forward(7, null, 10L, 11L)));
        assertFalse(invalid(forward(7, null, 10L, null)));
    }

    @Test
    void forwardsWithDeletedUserEntryOrExitAreInvalid() {
        assertTrue(invalid(forward(99, 2, null, null)));
        assertTrue(invalid(forward(null, 2, null, null)));
        assertTrue(invalid(forward(7, 404, null, null)));
        assertTrue(invalid(forward(7, null, 404L, 11L)));
        assertTrue(invalid(forward(7, null, 10L, 404L)));
        assertTrue(invalid(forward(7, null, null, 11L)));
    }

    @Test
    void forwardWithLiveTunnelIgnoresStaleDeviceGroupFields() {
        assertFalse(invalid(forward(7, 2, 404L, 404L)));
    }
}
