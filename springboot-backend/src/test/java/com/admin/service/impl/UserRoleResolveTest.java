package com.admin.service.impl;

import com.admin.entity.User;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class UserRoleResolveTest {

    private static final int ADMIN = 0;
    private static final int NORMAL = 1;

    private static User target(int roleId, int demoMode) {
        User user = new User();
        user.setRoleId(roleId);
        user.setDemoMode(demoMode);
        return user;
    }

    private static void assertResult(User target, Boolean admin, Integer demo, int role, int demoMode) {
        int newRole = UserServiceImpl.resolveRoleId(target, admin);
        assertEquals(role, newRole);
        assertEquals(demoMode, UserServiceImpl.resolveDemoMode(target, demo, newRole));
    }

    @Test
    void savingFormUnchangedKeepsBothSwitches() {
        assertResult(target(ADMIN, 0), true, 0, ADMIN, 0);
        assertResult(target(ADMIN, 1), true, 1, ADMIN, 1);
        assertResult(target(NORMAL, 0), false, 0, NORMAL, 0);
    }

    @Test
    void turningDemoOnKeepsAdminOn() {
        assertResult(target(ADMIN, 0), true, 1, ADMIN, 1);
    }

    @Test
    void turningDemoOffKeepsAdminOn() {
        assertResult(target(ADMIN, 1), true, 0, ADMIN, 0);
    }

    @Test
    void demoCannotBeOnWithoutAdmin() {
        assertResult(target(NORMAL, 0), false, 1, NORMAL, 0);
    }

    @Test
    void removingAdminAlsoTurnsDemoOff() {
        assertResult(target(ADMIN, 1), false, 1, NORMAL, 0);
        assertResult(target(ADMIN, 1), false, 0, NORMAL, 0);
    }

    @Test
    void promotingKeepsRequestedDemo() {
        assertResult(target(NORMAL, 0), true, 1, ADMIN, 1);
    }

    @Test
    void callsThatOmitBothKeepCurrentState() {
        assertResult(target(ADMIN, 0), null, null, ADMIN, 0);
        assertResult(target(ADMIN, 1), null, null, ADMIN, 1);
        assertResult(target(NORMAL, 0), null, null, NORMAL, 0);
    }
}
