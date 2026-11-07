package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.DeviceGroup;
import com.admin.entity.User;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.spy;

class DeviceGroupTypeAndLoginKeyTest {

    private DeviceGroup group(String direction) {
        DeviceGroup group = new DeviceGroup();
        group.setName("g");
        group.setDirection(direction);
        return group;
    }

    @Test
    void entryMustBeInboundOrBoth() {
        assertNull(ForwardServiceImpl.deviceGroupTypeError(group("inbound"), null));
        assertNull(ForwardServiceImpl.deviceGroupTypeError(group("both"), null));
        assertNull(ForwardServiceImpl.deviceGroupTypeError(group(null), null));
        assertNotNull(ForwardServiceImpl.deviceGroupTypeError(group("monitor"), null));
        assertNotNull(ForwardServiceImpl.deviceGroupTypeError(group("outbound"), null));
        assertNotNull(ForwardServiceImpl.deviceGroupTypeError(group("chain"), null));
    }

    @Test
    void exitMustBeOutboundOrBoth() {
        assertNull(ForwardServiceImpl.deviceGroupTypeError(group("inbound"), group("outbound")));
        assertNull(ForwardServiceImpl.deviceGroupTypeError(group("both"), group("both")));
        assertNotNull(ForwardServiceImpl.deviceGroupTypeError(group("inbound"), group("inbound")));
        assertNotNull(ForwardServiceImpl.deviceGroupTypeError(group("inbound"), group("monitor")));
        assertNotNull(ForwardServiceImpl.deviceGroupTypeError(group("inbound"), group("chain")));
        assertNotNull(ForwardServiceImpl.deviceGroupTypeError(group("inbound"), group(null)));
    }

    private R visibility(DeviceGroup group, int userId) {
        return ReflectionTestUtils.invokeMethod(new ForwardServiceImpl(), "checkDeviceGroupVisibility", group, userId);
    }

    @Test
    void groupHiddenFromAllUsersCannotBeUsedExceptByItsOwner() {
        DeviceGroup hiddenAdminGroup = group("inbound");
        hiddenAdminGroup.setHideInProbe(2);
        assertEquals(-1, visibility(hiddenAdminGroup, 5).getCode());

        DeviceGroup hiddenOwn = group("inbound");
        hiddenOwn.setHideInProbe(2);
        hiddenOwn.setOwnerUserId(9L);
        assertEquals(-1, visibility(hiddenOwn, 5).getCode());
        assertEquals(0, visibility(hiddenOwn, 9).getCode());
    }

    @Test
    void selfHostedGroupIsOnlyUsableByItsOwner() {
        DeviceGroup selfHosted = group("inbound");
        selfHosted.setOwnerUserId(9L);
        assertEquals(0, visibility(selfHosted, 9).getCode());
        assertEquals(-1, visibility(selfHosted, 5).getCode());
    }

    @Test
    void everySpellingOfAnExistingAccountSharesOneLoginKey() {
        UserServiceImpl users = spy(new UserServiceImpl());
        User admin = new User();
        admin.setId(1L);
        // 数据库按排序规则匹配，这些写法查到的都是同一条记录
        doReturn(admin).when(users).getOne(any(Wrapper.class));

        assertEquals("id:1", users.loginAttemptKey("admin"));
        assertEquals("id:1", users.loginAttemptKey("ADMIN"));
        assertEquals("id:1", users.loginAttemptKey("admin "));
    }

    @Test
    void unknownAccountsAreNormalized() {
        UserServiceImpl users = spy(new UserServiceImpl());
        doReturn(null).when(users).getOne(any(Wrapper.class));

        assertEquals("name:ghost", users.loginAttemptKey(" GHOST "));
        assertEquals("name:", users.loginAttemptKey(null));
    }
}
