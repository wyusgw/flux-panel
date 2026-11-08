package com.admin.common.utils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 账号级页面权限：一个页面对应一组接口，接口被多个页面共用时，有其中任一页面就放行。
 * 这张表按前端各页面实际调用的接口整理，MenuPermissionTest 会校验每个页面用到的接口都能通过。
 * 没有列在表里的接口（登录、配置列表、个人中心等）所有账号都能用，主页和个人中心也不能被取消，否则账号改不了密码。
 */
public final class MenuPermission {

    public enum Page {
        FORWARD("forward", "转发规则", false, null),
        SHOP("shop", "商城", false, null),
        ORDERS("orders", "我的订单", false, null),
        SINGLE_TUNNEL("singleTunnel", "单端隧道", false, "user_device_group_enabled"),
        LOOKING_GLASS("lookingGlass", "网络诊断", false, "allow_looking_glass"),
        NODE_PROBE("nodeProbe", "节点状态", false, null),
        ADMIN_DASHBOARD("adminDashboard", "仪表盘", true, null),
        CONFIG("config", "站点设置", true, null),
        PUSH_NOTIFICATION("pushNotification", "推送通知", true, null),
        TUNNEL("tunnel", "隧道管理", true, null),
        DEVICE_GROUP("deviceGroup", "设备管理", true, null),
        NODE_GROUP("nodeGroup", "节点组管理", true, null),
        USER("user", "用户管理", true, null),
        USER_GROUP("userGroup", "用户组管理", true, null),
        PACKAGE("package", "套餐管理", true, null),
        REDEEM_CODE("redeemCode", "兑换码管理", true, null),
        INVITE_CODE("inviteCode", "邀请码管理", true, null),
        ORDER_MANAGEMENT("orderManagement", "订单管理", true, null),
        TASK_QUEUE("taskQueue", "任务队列", true, null);

        private final String code;
        private final String label;
        private final boolean adminOnly;
        private final String featureConfig;

        Page(String code, String label, boolean adminOnly, String featureConfig) {
            this.code = code;
            this.label = label;
            this.adminOnly = adminOnly;
            this.featureConfig = featureConfig;
        }

        public String getCode() {
            return code;
        }

        public String getLabel() {
            return label;
        }

        /** 对应功能是否开启；关闭时不显示这个选项，判断依据和后台菜单一致 */
        public boolean isFeatureEnabled(Function<String, String> config) {
            return featureConfig == null || "true".equals(config.apply(featureConfig));
        }
    }

    private static final String PREFIX = "/api/v1/";
    private static final Map<String, Set<String>> ENDPOINT_PAGES = new HashMap<>();

    static {
        gate(new String[]{"forward", "user"}, "forward/create", "forward/delete", "forward/diagnose", "forward/diagnoseDetail",
                "forward/forceDelete", "forward/list", "forward/pause", "forward/resume", "forward/update", "forward/updateOrder",
                "forward/dailyFlow", "forwardGroup/create", "forwardGroup/delete", "forwardGroup/list", "forwardGroup/update",
                "tunnel/user/tunnel");
        gate(new String[]{"tunnel"}, "tunnel/create", "tunnel/delete", "tunnel/update", "tunnel/diagnose", "tunnel/diagnoseDetail",
                "speedLimit/create", "speedLimit/update", "speedLimit/delete", "speedLimit/list", "speedLimit/tunnels");
        gate(new String[]{"tunnel", "user"}, "tunnel/list");
        gate(new String[]{"user"}, "tunnel/user/assign", "tunnel/user/list", "tunnel/user/remove", "tunnel/user/update",
                "user/create", "user/update", "user/delete", "user/reset",
                "demo/permission", "demo/updatePermission", "demo/restore", "demo/commit",
                "cleanup/invalidUsers", "cleanup/cleanInvalidUsers", "cleanup/invalidForwards", "cleanup/cleanInvalidForwards");
        gate(new String[]{"adminDashboard", "orderManagement", "user"}, "user/list");
        gate(new String[]{"adminDashboard", "deviceGroup", "lookingGlass", "nodeProbe", "tunnel"}, "node/list");
        gate(new String[]{"deviceGroup"}, "node/config", "node/create", "node/delete", "node/install", "node/resetSecret", "node/update",
                "deviceGroup/batchDelete", "deviceGroup/create", "deviceGroup/delete", "deviceGroup/reorder", "deviceGroup/update", "deviceGroup/updateConfig");
        gate(new String[]{"pushNotification"}, "deviceGroup/offlineConfig", "telegramLog/list", "user/telegram/test");
        gate(new String[]{"config", "pushNotification"}, "config/update", "config/updateSingle");
        gate(new String[]{"nodeProbe"}, "nodeGroup/names", "userGroup/names");
        gate(new String[]{"deviceGroup", "nodeGroup"}, "nodeGroup/list");
        gate(new String[]{"nodeGroup"}, "nodeGroup/create", "nodeGroup/update", "nodeGroup/delete", "nodeGroup/batchDelete", "nodeGroup/reorder");
        gate(new String[]{"deviceGroup", "package", "user", "userGroup"}, "userGroup/list");
        gate(new String[]{"userGroup"}, "userGroup/create", "userGroup/update", "userGroup/delete", "userGroup/batchDelete", "userGroup/reorder");
        gate(new String[]{"singleTunnel"}, "singleTunnelGroup/create", "singleTunnelGroup/delete", "singleTunnelGroup/list", "singleTunnelGroup/update",
                "userDeviceGroup/create", "userDeviceGroup/delete", "userDeviceGroup/install", "userDeviceGroup/list",
                "userDeviceGroup/resetSecret", "userDeviceGroup/update", "userDeviceGroup/clearFlow");
        gate(new String[]{"lookingGlass"}, "lookingGlass/run");
        gate(new String[]{"adminDashboard"}, "dashboard/flowStats", "dashboard/nodeOnlineTrend");
        gate(new String[]{"adminDashboard", "orderManagement"}, "order/admin/list");
        gate(new String[]{"orderManagement"}, "order/batchDelete", "order/manualCreate", "order/updateStatus");
        gate(new String[]{"orders"}, "order/list");
        gate(new String[]{"shop"}, "order/redeem", "recharge/create", "recharge/status");
        gate(new String[]{"package"}, "package/create", "package/update", "package/delete", "package/batchDelete", "package/reorder");
        gate(new String[]{"redeemCode"}, "redeemCode/batchCreate", "redeemCode/delete", "redeemCode/list");
        gate(new String[]{"inviteCode"}, "inviteCode/batchCreate", "inviteCode/delete", "inviteCode/list");
        gate(new String[]{"adminDashboard", "taskQueue"}, "taskQueue/health");
        gate(new String[]{"taskQueue"}, "taskQueue/delete", "taskQueue/errorLogs", "taskQueue/list", "taskQueue/overview", "taskQueue/retry");
    }

    private MenuPermission() {
    }

    private static void gate(String[] pages, String... endpoints) {
        Set<String> pageSet = new HashSet<>(Arrays.asList(pages));
        for (String endpoint : endpoints) {
            ENDPOINT_PAGES.put(PREFIX + endpoint, pageSet);
        }
    }

    /** 这个账号的页面设置是否允许访问接口。null 表示全部页面；不在表里的接口不受限制 */
    public static boolean allowsEndpoint(String menuPermissions, String uri) {
        if (menuPermissions == null) {
            return true;
        }
        Set<String> pages = ENDPOINT_PAGES.get(uri);
        return pages == null || !Collections.disjoint(pages, parse(menuPermissions));
    }

    public static boolean isGated(String uri) {
        return ENDPOINT_PAGES.containsKey(uri);
    }

    public static Set<String> parse(String menuPermissions) {
        if (menuPermissions == null || menuPermissions.trim().isEmpty()) {
            return Collections.emptySet();
        }
        return Arrays.stream(menuPermissions.split(",")).map(String::trim).filter(code -> !code.isEmpty()).collect(Collectors.toSet());
    }

    /** 这个角色能分配的页面：普通用户看不到后台页面 */
    public static List<Page> pagesForRole(boolean admin) {
        List<Page> pages = new ArrayList<>();
        for (Page page : Page.values()) {
            if (admin || !page.adminOnly) {
                pages.add(page);
            }
        }
        return pages;
    }

    /**
     * 合并后保存的值：只认该角色有效的页面；功能关闭、窗口里看不到的页面保持原样；全部勾选时存 null，以后新增页面也自动拥有
     */
    public static String merge(Collection<String> selected, String stored, boolean admin, Function<String, String> config) {
        Set<String> storedPages = stored == null ? null : parse(stored);
        List<String> result = new ArrayList<>();
        List<Page> pages = pagesForRole(admin);
        for (Page page : pages) {
            boolean keep = page.isFeatureEnabled(config)
                    ? selected.contains(page.code)
                    : storedPages == null || storedPages.contains(page.code);
            if (keep) {
                result.add(page.code);
            }
        }
        return result.size() == pages.size() ? null : String.join(",", result);
    }
}
