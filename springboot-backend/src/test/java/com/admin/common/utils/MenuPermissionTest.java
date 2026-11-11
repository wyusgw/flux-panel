package com.admin.common.utils;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MenuPermissionTest {

    /** 从前端各页面实际调用的接口提取；键是「权限|页面文件」，权限为空表示所有账号都能用的页面 */
    private static final Map<String, List<String>> PAGE_ENDPOINTS = new LinkedHashMap<>();

    static {
        PAGE_ENDPOINTS.put("forward|forward", Arrays.asList("deviceGroup/list", "forward/create", "forward/dailyFlow", "forward/delete", "forward/diagnose", "forward/diagnoseDetail", "forward/forceDelete", "forward/list", "forward/pause", "forward/resume", "forward/update", "forwardGroup/create", "forwardGroup/delete", "forwardGroup/list", "forwardGroup/update", "tunnel/user/tunnel", "user/package"));
        PAGE_ENDPOINTS.put("shop|shop", Arrays.asList("order/purchase", "order/redeem", "package/list", "recharge/create", "user/package"));
        PAGE_ENDPOINTS.put("orders|orders", Arrays.asList("order/list"));
        PAGE_ENDPOINTS.put("singleTunnel|single-tunnel", Arrays.asList("singleTunnelGroup/create", "singleTunnelGroup/delete", "singleTunnelGroup/list", "singleTunnelGroup/update", "userDeviceGroup/create", "userDeviceGroup/delete", "userDeviceGroup/install", "userDeviceGroup/list", "userDeviceGroup/resetSecret", "userDeviceGroup/update"));
        PAGE_ENDPOINTS.put("lookingGlass|looking-glass", Arrays.asList("lookingGlass/run", "node/list"));
        PAGE_ENDPOINTS.put("nodeProbe|node-probe", Arrays.asList("deviceGroup/list", "node/list", "nodeGroup/names", "userGroup/names"));
        PAGE_ENDPOINTS.put("adminDashboard|admin-dashboard", Arrays.asList("dashboard/flowStats", "dashboard/nodeOnlineTrend", "node/list", "order/admin/list", "taskQueue/health", "user/list"));
        PAGE_ENDPOINTS.put("config|config", Arrays.asList("config/list", "config/update"));
        PAGE_ENDPOINTS.put("pushNotification|push-notification", Arrays.asList("config/list", "config/update", "deviceGroup/list", "deviceGroup/offlineConfig", "telegramLog/list", "user/telegram/test"));
        PAGE_ENDPOINTS.put("tunnel|tunnel", Arrays.asList("node/list", "tunnel/create", "tunnel/delete", "tunnel/diagnose", "tunnel/diagnoseDetail", "tunnel/list", "tunnel/update"));
        PAGE_ENDPOINTS.put("deviceGroup|devicegroup", Arrays.asList("node/config", "deviceGroup/updateConfig", "deviceGroup/batchDelete", "deviceGroup/create", "deviceGroup/delete", "deviceGroup/list", "deviceGroup/reorder", "deviceGroup/update", "node/create", "node/delete", "node/install", "node/list", "node/resetSecret", "node/update", "nodeGroup/list", "userGroup/list"));
        PAGE_ENDPOINTS.put("nodeGroup|nodegroup", Arrays.asList("nodeGroup/batchDelete", "nodeGroup/create", "nodeGroup/delete", "nodeGroup/list", "nodeGroup/reorder", "nodeGroup/update"));
        PAGE_ENDPOINTS.put("user|user", Arrays.asList("demo/commit", "demo/permission", "demo/restore", "demo/updatePermission", "package/list", "tunnel/list", "tunnel/user/assign", "tunnel/user/list", "tunnel/user/remove", "tunnel/user/tunnel", "tunnel/user/update", "user/create", "user/delete", "user/list", "user/refreshLimits", "user/reset", "user/update", "userGroup/list"));
        PAGE_ENDPOINTS.put("userGroup|usergroup", Arrays.asList("userGroup/batchDelete", "userGroup/create", "userGroup/delete", "userGroup/list", "userGroup/reorder", "userGroup/update"));
        PAGE_ENDPOINTS.put("package|package", Arrays.asList("package/batchDelete", "package/create", "package/delete", "package/list", "package/pushUpdate", "package/reorder", "package/update", "userGroup/list"));
        PAGE_ENDPOINTS.put("redeemCode|redeemcode", Arrays.asList("package/list", "redeemCode/batchCreate", "redeemCode/delete", "redeemCode/list"));
        PAGE_ENDPOINTS.put("inviteCode|invitecode", Arrays.asList("inviteCode/batchCreate", "inviteCode/delete", "inviteCode/list"));
        PAGE_ENDPOINTS.put("orderManagement|order-management", Arrays.asList("order/admin/list", "order/batchDelete", "order/manualCreate", "order/updateStatus", "user/list"));
        PAGE_ENDPOINTS.put("taskQueue|task-queue", Arrays.asList("taskQueue/delete", "taskQueue/errorLogs", "taskQueue/health", "taskQueue/list", "taskQueue/overview", "taskQueue/retry"));
        PAGE_ENDPOINTS.put("|account-center", Arrays.asList("deviceGroup/list", "order/purchase", "package/list", "user/autoRenew", "user/notifySettings", "user/package", "user/resetPassword", "user/telegram/bindCode", "user/telegram/unbind"));
        PAGE_ENDPOINTS.put("|home", Arrays.asList("config/backendInfo", "config/get"));
        PAGE_ENDPOINTS.put("|dashboard", Arrays.asList("config/get", "user/package"));
    }

    private static final Function<String, String> ALL_ON = name -> "true";

    @Test
    void everyPageWorksWhenOnlyThatPageIsGranted() {
        PAGE_ENDPOINTS.forEach((key, endpoints) -> {
            String granted = key.substring(0, key.indexOf('|'));
            for (String endpoint : endpoints) {
                assertTrue(MenuPermission.allowsEndpoint(granted, "/api/v1/" + endpoint), key + " 用到的接口被拦: " + endpoint);
            }
        });
    }

    @Test
    void pagesThatEveryAccountHasNeverNeedGrants() {
        for (String page : new String[]{"|account-center", "|home", "|dashboard"}) {
            for (String endpoint : PAGE_ENDPOINTS.get(page)) {
                assertTrue(MenuPermission.allowsEndpoint("", "/api/v1/" + endpoint), page + " 用到的接口被拦: " + endpoint);
            }
        }
    }

    @Test
    void ungrantedPagesAreRejected() {
        assertFalse(MenuPermission.allowsEndpoint("shop", "/api/v1/forward/create"));
        assertFalse(MenuPermission.allowsEndpoint("forward", "/api/v1/recharge/create"));
        assertFalse(MenuPermission.allowsEndpoint("config", "/api/v1/user/update"));
        assertFalse(MenuPermission.allowsEndpoint("tunnel", "/api/v1/node/update"));
        assertFalse(MenuPermission.allowsEndpoint("", "/api/v1/demo/updatePermission"));
    }

    @Test
    void sharedEndpointsPassWithAnyOfTheirPages() {
        assertTrue(MenuPermission.allowsEndpoint("tunnel", "/api/v1/node/list"));
        assertTrue(MenuPermission.allowsEndpoint("lookingGlass", "/api/v1/node/list"));
        assertTrue(MenuPermission.allowsEndpoint("user", "/api/v1/forward/list"));
        assertFalse(MenuPermission.allowsEndpoint("shop", "/api/v1/node/list"));
    }

    @Test
    void nullMeansEverythingAndUnlistedEndpointsAreOpen() {
        assertTrue(MenuPermission.allowsEndpoint(null, "/api/v1/user/update"));
        assertTrue(MenuPermission.allowsEndpoint("", "/api/v1/config/list"));
        assertTrue(MenuPermission.allowsEndpoint("", "/api/v1/user/resetPassword"));
        assertTrue(MenuPermission.allowsEndpoint("", "/api/v1/menuPermission/mine"));
    }

    @Test
    void optionsDifferByRole() {
        assertFalse(MenuPermission.pagesForRole(false).contains(MenuPermission.Page.CONFIG));
        assertFalse(MenuPermission.pagesForRole(false).contains(MenuPermission.Page.USER));
        assertTrue(MenuPermission.pagesForRole(false).contains(MenuPermission.Page.FORWARD));
        assertTrue(MenuPermission.pagesForRole(true).contains(MenuPermission.Page.CONFIG));
        assertTrue(MenuPermission.pagesForRole(true).contains(MenuPermission.Page.FORWARD));
    }

    @Test
    void mergeStoresNullWhenEverythingIsSelected() {
        List<String> allNormal = Arrays.asList("forward", "shop", "orders", "singleTunnel", "lookingGlass", "nodeProbe");
        assertNull(MenuPermission.merge(allNormal, null, false, ALL_ON));
        assertEquals("forward,shop", MenuPermission.merge(Arrays.asList("forward", "shop"), null, false, ALL_ON));
    }

    @Test
    void normalUserCannotBeGrantedAdminPages() {
        assertEquals("forward", MenuPermission.merge(Arrays.asList("forward", "config", "user"), null, false, ALL_ON));
    }

    @Test
    void hiddenFeaturePagesKeepTheirPreviousState() {
        Function<String, String> off = name -> "false";
        assertEquals("forward,singleTunnel", MenuPermission.merge(Collections.singletonList("forward"), "forward,singleTunnel", false, off));
        assertEquals("forward", MenuPermission.merge(Collections.singletonList("forward"), "forward", false, off));
        String fromAll = MenuPermission.merge(Collections.singletonList("forward"), null, false, off);
        assertTrue(fromAll.contains("singleTunnel") && fromAll.contains("lookingGlass") && !fromAll.contains("shop"));
    }
}
