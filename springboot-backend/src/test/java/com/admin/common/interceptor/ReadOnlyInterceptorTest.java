package com.admin.common.interceptor;

import com.admin.common.exception.ReadOnlyException;
import com.admin.common.exception.UnauthorizedException;
import com.admin.common.utils.JwtUtil;
import com.admin.entity.User;
import com.admin.mapper.UserMapper;
import com.admin.service.DemoChangeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;

class ReadOnlyInterceptorTest {

    private final UserMapper userMapper = mock(UserMapper.class);
    private final DemoChangeService changes = mock(DemoChangeService.class);
    private final ReadOnlyInterceptor interceptor = new ReadOnlyInterceptor(userMapper, changes);

    @BeforeEach
    void setSecret() {
        ReflectionTestUtils.setField(JwtUtil.class, "SECRET_KEY", "test-secret");
    }

    private static User user(int roleId, int demoMode, int status) {
        User user = new User();
        user.setId(7L);
        user.setUser("name");
        user.setRoleId(roleId);
        user.setDemoMode(demoMode);
        user.setStatus(status);
        return user;
    }

    private MockHttpServletRequest request(String uri, String token) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", uri);
        if (token != null) {
            request.addHeader("Authorization", token);
        }
        return request;
    }

    private boolean call(MockHttpServletRequest request) {
        return interceptor.preHandle(request, new MockHttpServletResponse(), new Object());
    }

    @Test
    void demoAdminReadsAreMarkedForMasking() {
        User demo = user(0, 1, 1);
        when(userMapper.selectById(any())).thenReturn(demo);
        MockHttpServletRequest request = request("/api/v1/user/list", JwtUtil.generateToken(demo));
        assertTrue(call(request));
        assertNotNull(request.getAttribute(ReadOnlyInterceptor.DEMO_ATTRIBUTE));
    }

    @Test
    void demoAdminWritesAndUnknownPathsAreRejected() {
        User demo = user(0, 1, 1);
        when(userMapper.selectById(any())).thenReturn(demo);
        String token = JwtUtil.generateToken(demo);
        for (String uri : new String[]{
                "/api/v1/config/update", "/api/v1/user/update", "/api/v1/user/delete",
                "/api/v1/user/updatePassword", "/api/v1/node/install", "/api/v1/forward/create",
                "/api/v1/someNewEndpoint", "/api/v1/config/list/", "/api/v1/config/list/../update"}) {
            ReadOnlyException e = assertThrows(ReadOnlyException.class, () -> call(request(uri, token)), uri);
            assertEquals("禁止编辑", e.getMessage());
        }
    }

    @Test
    void assignedAreaOpensOnlyItsOwnEndpointsAndRecordsChanges() {
        User demo = user(0, 1, 1);
        demo.setDemoAreas("userGroup");
        when(userMapper.selectById(any())).thenReturn(demo);
        String token = JwtUtil.generateToken(demo);

        MockHttpServletRequest edit = request("/api/v1/userGroup/update", token);
        assertTrue(call(edit));
        verify(changes).begin(any());
        interceptor.afterCompletion(edit, new MockHttpServletResponse(), new Object(), null);

        for (String uri : new String[]{"/api/v1/config/update", "/api/v1/deviceGroup/offlineConfig",
                "/api/v1/node/update", "/api/v1/forward/create", "/api/v1/user/update", "/api/v1/package/update",
                "/api/v1/redeemCode/batchCreate", "/api/v1/inviteCode/batchCreate", "/api/v1/demo/updatePermission"}) {
            assertThrows(ReadOnlyException.class, () -> call(request(uri, token)), uri);
        }
    }

    @Test
    void sortAreasOpenOnlyReorderNotContent() {
        User demo = user(0, 1, 1);
        demo.setDemoAreas("deviceSort,packageSort");
        when(userMapper.selectById(any())).thenReturn(demo);
        String token = JwtUtil.generateToken(demo);
        assertTrue(call(request("/api/v1/deviceGroup/reorder", token)));
        assertTrue(call(request("/api/v1/package/reorder", token)));
        for (String uri : new String[]{"/api/v1/deviceGroup/update", "/api/v1/deviceGroup/delete",
                "/api/v1/package/update", "/api/v1/package/create", "/api/v1/package/delete"}) {
            assertThrows(ReadOnlyException.class, () -> call(request(uri, token)), uri);
        }
    }

    @Test
    void allAreasTickedStillBlockSecretsTakeoverAndMoneyEndpoints() {
        User demo = user(0, 1, 1);
        demo.setDemoAreas(String.join(",", java.util.Arrays.stream(com.admin.common.utils.DemoArea.values())
                .map(com.admin.common.utils.DemoArea::getCode).toArray(String[]::new)));
        when(userMapper.selectById(any())).thenReturn(demo);
        String token = JwtUtil.generateToken(demo);
        for (String uri : new String[]{"/api/v1/node/update", "/api/v1/tunnel/update", "/api/v1/forward/update", "/api/v1/forwardGroup/delete",
                "/api/v1/deviceGroup/update", "/api/v1/speedLimit/update", "/api/v1/user/update", "/api/v1/order/updateStatus"}) {
            MockHttpServletRequest request = request(uri, token);
            assertTrue(call(request), uri);
            interceptor.afterCompletion(request, new MockHttpServletResponse(), new Object(), null);
        }
        for (String uri : new String[]{"/api/v1/node/install", "/api/v1/userDeviceGroup/install", "/api/v1/user/resetPassword",
                "/api/v1/user/updatePassword", "/api/v1/user/reset", "/api/v1/order/purchase", "/api/v1/order/redeem", "/api/v1/recharge/create",
                "/api/v1/demo/updatePermission", "/api/v1/demo/restore", "/api/v1/demo/commit", "/api/v1/user/telegram/bindCode",
                "/api/v1/cleanup/cleanInvalidUsers", "/api/v1/cleanup/cleanInvalidForwards"}) {
            assertThrows(ReadOnlyException.class, () -> call(request(uri, token)), uri);
        }
    }

    @Test
    void contentAreasOpenTheirEndpointsButTrafficAndUserAreasStayClosed() {
        User demo = user(0, 1, 1);
        demo.setDemoAreas("package,redeemCode,inviteCode");
        when(userMapper.selectById(any())).thenReturn(demo);
        String token = JwtUtil.generateToken(demo);
        for (String uri : new String[]{"/api/v1/package/update", "/api/v1/package/reorder", "/api/v1/redeemCode/batchCreate",
                "/api/v1/redeemCode/delete", "/api/v1/inviteCode/batchCreate", "/api/v1/inviteCode/delete"}) {
            assertTrue(call(request(uri, token)), uri);
        }
        for (String uri : new String[]{"/api/v1/node/update", "/api/v1/node/resetSecret", "/api/v1/tunnel/update", "/api/v1/forward/update",
                "/api/v1/deviceGroup/update", "/api/v1/speedLimit/update", "/api/v1/user/update", "/api/v1/user/create",
                "/api/v1/user/resetPassword", "/api/v1/order/updateStatus", "/api/v1/order/manualCreate"}) {
            assertThrows(ReadOnlyException.class, () -> call(request(uri, token)), uri);
        }
    }

    @Test
    void groupAreasOpenTheirOwnEndpoints() {
        User demo = user(0, 1, 1);
        demo.setDemoAreas("nodeGroup,singleTunnelGroup");
        when(userMapper.selectById(any())).thenReturn(demo);
        String token = JwtUtil.generateToken(demo);
        for (String uri : new String[]{"/api/v1/nodeGroup/create", "/api/v1/nodeGroup/batchDelete", "/api/v1/nodeGroup/reorder",
                "/api/v1/singleTunnelGroup/create", "/api/v1/singleTunnelGroup/delete"}) {
            assertTrue(call(request(uri, token)), uri);
        }
        for (String uri : new String[]{"/api/v1/node/update", "/api/v1/forwardGroup/delete", "/api/v1/speedLimit/update",
                "/api/v1/userGroup/create"}) {
            assertThrows(ReadOnlyException.class, () -> call(request(uri, token)), uri);
        }
    }

    private User withPages(int role, String pages) {
        User account = user(role, 0, 1);
        account.setMenuPermissions(pages);
        return account;
    }

    @Test
    void ungrantedPagesBlockApisForBothRoles() {
        User normal = withPages(1, "shop");
        when(userMapper.selectById(any())).thenReturn(normal);
        String normalToken = JwtUtil.generateToken(normal);
        assertTrue(call(request("/api/v1/recharge/create", normalToken)));
        assertThrows(ReadOnlyException.class, () -> call(request("/api/v1/forward/list", normalToken)));
        assertThrows(ReadOnlyException.class, () -> call(request("/api/v1/forward/create", normalToken)));

        User admin = withPages(0, "tunnel");
        when(userMapper.selectById(any())).thenReturn(admin);
        String adminToken = JwtUtil.generateToken(admin);
        assertTrue(call(request("/api/v1/tunnel/update", adminToken)));
        assertThrows(ReadOnlyException.class, () -> call(request("/api/v1/user/update", adminToken)));
        assertThrows(ReadOnlyException.class, () -> call(request("/api/v1/config/update", adminToken)));
    }

    @Test
    void restrictedAdminWithoutSettingsPagesCannotReadSecrets() {
        User admin = withPages(0, "tunnel");
        when(userMapper.selectById(any())).thenReturn(admin);
        MockHttpServletRequest list = request("/api/v1/config/list", JwtUtil.generateToken(admin));
        assertTrue(call(list));
        assertNotNull(list.getAttribute(ReadOnlyInterceptor.CONFIG_SECRETS_HIDDEN_ATTRIBUTE));

        User settings = withPages(0, "config");
        when(userMapper.selectById(any())).thenReturn(settings);
        MockHttpServletRequest allowed = request("/api/v1/config/list", JwtUtil.generateToken(settings));
        assertTrue(call(allowed));
        assertNull(allowed.getAttribute(ReadOnlyInterceptor.CONFIG_SECRETS_HIDDEN_ATTRIBUTE));

        User full = user(0, 0, 1);
        when(userMapper.selectById(any())).thenReturn(full);
        MockHttpServletRequest fullList = request("/api/v1/config/list", JwtUtil.generateToken(full));
        assertTrue(call(fullList));
        assertNull(fullList.getAttribute(ReadOnlyInterceptor.CONFIG_SECRETS_HIDDEN_ATTRIBUTE));
    }

    @Test
    void demoAdminAlsoObeysPagePermissions() {
        User demo = user(0, 1, 1);
        demo.setMenuPermissions("tunnel");
        demo.setDemoAreas("userGroup");
        when(userMapper.selectById(any())).thenReturn(demo);
        String token = JwtUtil.generateToken(demo);
        assertTrue(call(request("/api/v1/tunnel/list", token)));
        assertThrows(ReadOnlyException.class, () -> call(request("/api/v1/userGroup/create", token)));
    }

    @Test
    void myPermissionsEndpointWorksForDemoAccounts() {
        User demo = user(0, 1, 1);
        when(userMapper.selectById(any())).thenReturn(demo);
        assertTrue(call(request("/api/v1/menuPermission/mine", JwtUtil.generateToken(demo))));
    }

    @Test
    void tickedAreaStopsWorkingWhileItsFeatureIsOff() {
        User demo = user(0, 1, 1);
        demo.setDemoAreas("singleTunnelGroup");
        when(userMapper.selectById(any())).thenReturn(demo);
        when(changes.isAreaDisabled("singleTunnelGroup")).thenReturn(true);
        String token = JwtUtil.generateToken(demo);
        assertThrows(ReadOnlyException.class, () -> call(request("/api/v1/singleTunnelGroup/create", token)));
        when(changes.isAreaDisabled("singleTunnelGroup")).thenReturn(false);
        assertTrue(call(request("/api/v1/singleTunnelGroup/create", token)));
    }

    @Test
    void siteAreaReachesConfigEndpointWithAreasForKeyLevelChecks() {
        User demo = user(0, 1, 1);
        demo.setDemoAreas("site,bogus");
        when(userMapper.selectById(any())).thenReturn(demo);
        MockHttpServletRequest edit = request("/api/v1/config/update", JwtUtil.generateToken(demo));
        assertTrue(call(edit));
        assertEquals(java.util.Collections.singleton("site"), edit.getAttribute(ReadOnlyInterceptor.DEMO_AREAS_ATTRIBUTE));
    }

    @Test
    void turningDemoOffInvalidatesOldTokenInsteadOfMakingItAdmin() {
        String token = JwtUtil.generateToken(user(0, 1, 1));
        when(userMapper.selectById(any())).thenReturn(user(1, 0, 1));
        assertThrows(UnauthorizedException.class, () -> call(request("/api/v1/user/list", token)));
    }

    @Test
    void bannedOrDeletedDemoAccountIsLoggedOut() {
        String token = JwtUtil.generateToken(user(0, 1, 1));
        when(userMapper.selectById(any())).thenReturn(user(0, 1, 0));
        assertThrows(UnauthorizedException.class, () -> call(request("/api/v1/user/list", token)));
        when(userMapper.selectById(any())).thenReturn(null);
        assertThrows(UnauthorizedException.class, () -> call(request("/api/v1/user/list", token)));
    }

    @Test
    void realAdminIsUnaffected() {
        User admin = user(0, 0, 1);
        when(userMapper.selectById(any())).thenReturn(admin);
        String token = JwtUtil.generateToken(admin);
        MockHttpServletRequest read = request("/api/v1/user/list", token);
        assertTrue(call(read));
        assertNull(read.getAttribute(ReadOnlyInterceptor.DEMO_ATTRIBUTE));
        assertTrue(call(request("/api/v1/config/update", token)));
    }

    @Test
    void demoAdminWithAdminRemovedLosesOldTokenEvenWhileDemoStaysOn() {
        String token = JwtUtil.generateToken(user(0, 1, 1));
        when(userMapper.selectById(any())).thenReturn(user(1, 1, 1));
        assertThrows(UnauthorizedException.class, () -> call(request("/api/v1/user/list", token)));
    }

    @Test
    void demoAdminTurnedIntoRealAdminMustLogInAgain() {
        String token = JwtUtil.generateToken(user(0, 1, 1));
        when(userMapper.selectById(any())).thenReturn(user(0, 0, 1));
        assertThrows(UnauthorizedException.class, () -> call(request("/api/v1/config/update", token)));
    }

    @Test
    void demoOnlyNormalUserIsReadOnlyAndMasked() {
        User demo = user(1, 1, 1);
        when(userMapper.selectById(any())).thenReturn(demo);
        String token = JwtUtil.generateToken(demo);
        assertEquals(1, JwtUtil.getRoleIdFromToken(token));
        MockHttpServletRequest read = request("/api/v1/forward/list", token);
        assertTrue(call(read));
        assertNotNull(read.getAttribute(ReadOnlyInterceptor.DEMO_ATTRIBUTE));
        assertThrows(ReadOnlyException.class, () -> call(request("/api/v1/forward/create", token)));
    }

    @Test
    void demotedBannedOrDeletedAdminLosesOldTokenImmediately() {
        String token = JwtUtil.generateToken(user(0, 0, 1));
        for (User changed : new User[]{user(1, 0, 1), user(0, 0, 0), user(0, 1, 1), null}) {
            when(userMapper.selectById(any())).thenReturn(changed);
            assertThrows(UnauthorizedException.class, () -> call(request("/api/v1/user/list", token)));
            assertThrows(UnauthorizedException.class, () -> call(request("/api/v1/config/update", token)));
        }
    }

    @Test
    void normalUserReadsSkipTheDatabaseAndWritesStillWork() {
        User normal = user(1, 0, 1);
        when(userMapper.selectById(any())).thenReturn(normal);
        String token = JwtUtil.generateToken(normal);
        assertTrue(call(request("/api/v1/config/list", token)));
        verify(userMapper, never()).selectById(any());
        assertTrue(call(request("/api/v1/forward/list", token)));
        assertTrue(call(request("/api/v1/forward/create", token)));
    }

    @Test
    void userPromotedToAdminKeepsWorkingWithOldTokenUntilRelogin() {
        String token = JwtUtil.generateToken(user(1, 0, 1));
        when(userMapper.selectById(any())).thenReturn(user(0, 0, 1));
        assertTrue(call(request("/api/v1/forward/create", token)));
        assertEquals(1, JwtUtil.getRoleIdFromToken(token));
    }

    @Test
    void userJustSwitchedToDemoCannotWriteWithOldToken() {
        String token = JwtUtil.generateToken(user(1, 0, 1));
        when(userMapper.selectById(any())).thenReturn(user(0, 1, 1));
        assertThrows(ReadOnlyException.class, () -> call(request("/api/v1/forward/create", token)));
    }

    @Test
    void invalidOrMissingTokenIsLeftToJwtInterceptor() {
        assertTrue(call(request("/api/v1/user/register", null)));
        assertTrue(call(request("/api/v1/user/register", "not.a.token")));
        verify(userMapper, never()).selectById(any());
    }
}
