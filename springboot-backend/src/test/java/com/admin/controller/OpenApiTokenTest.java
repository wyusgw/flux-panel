package com.admin.controller;

import com.admin.common.lang.R;
import com.admin.entity.User;
import com.admin.service.UserService;
import com.admin.service.impl.UserServiceTokenAccess;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OpenApiTokenTest {

    @Test
    void tokensAre32HexCharactersAndDoNotRepeat() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 200; i++) {
            String token = UserServiceTokenAccess.newToken();
            assertTrue(token.matches("[0-9a-f]{32}"), token);
            assertTrue(seen.add(token));
        }
    }

    @Test
    void malformedTokensAreRejectedWithoutQueryingTheDatabase() {
        OpenApiController controller = new OpenApiController();
        UserService users = mock(UserService.class);
        ReflectionTestUtils.setField(controller, "userService", users);

        Object result = ReflectionTestUtils.invokeMethod(controller, "authenticateByToken", "' or 1=1 --");
        assertEquals(-1, ((R) result).getCode());
        verify(users, never()).getOne(any());
    }

    @Test
    void validTokenFindsItsAccount() {
        OpenApiController controller = new OpenApiController();
        UserService users = mock(UserService.class);
        ReflectionTestUtils.setField(controller, "userService", users);
        User owner = new User();
        owner.setId(7L);
        when(users.getOne(any())).thenReturn(owner);

        Object result = ReflectionTestUtils.invokeMethod(controller, "authenticateByToken", "0123456789abcdef0123456789abcdef");
        assertSame(owner, result);
    }
}
