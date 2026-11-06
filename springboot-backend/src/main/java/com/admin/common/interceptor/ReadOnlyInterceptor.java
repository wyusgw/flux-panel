package com.admin.common.interceptor;

import com.admin.common.exception.ReadOnlyException;
import com.admin.common.exception.UnauthorizedException;
import com.admin.common.utils.JwtUtil;
import com.admin.entity.User;
import com.admin.mapper.UserMapper;
import com.admin.service.DemoChangeService;
import com.admin.common.utils.DemoArea;
import com.admin.common.utils.MenuPermission;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;


/**
 * 演示管理员拦截器：演示账号只能调用下面列出的查询接口，响应由 DemoMaskAdvice 打码；
 * 管理员分配了可编辑区域时，还能调用对应的修改接口，改动会被记录以便定时恢复。
 * 查询和修改接口基本都是 POST，无法按请求方法区分，所以这里只放行明确列出的查询接口，
 * 其余一律视为修改——以后新增的接口默认被拦，确认是纯查询后再加到下面的列表。
 *
 * 令牌有效期很长，而演示账号的角色就是管理员（role_id=0）：如果只看令牌里的角色，
 * 关闭演示模式后旧令牌就成了真管理员。所以演示账号的令牌带 demo 标记，
 * 带标记的令牌每次请求都回数据库核对，账号不再是演示账号或已被封禁、删除时立即失效。
 */
public class ReadOnlyInterceptor implements HandlerInterceptor {

    private static final String PREFIX = "/api/v1/";

    private static final Set<String> READ_PATHS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            PREFIX + "config/backendInfo",
            PREFIX + "cleanup/invalidUsers",
            PREFIX + "cleanup/invalidForwards",
            PREFIX + "menuPermission/mine",
            PREFIX + "config/get",
            PREFIX + "config/list",
            PREFIX + "dashboard/flowStats",
            PREFIX + "dashboard/nodeOnlineTrend",
            PREFIX + "deviceGroup/list",
            PREFIX + "forward/dailyFlow",
            PREFIX + "forward/list",
            PREFIX + "forwardGroup/list",
            PREFIX + "inviteCode/list",
            PREFIX + "node/list",
            PREFIX + "nodeGroup/list",
            PREFIX + "nodeGroup/names",
            PREFIX + "order/admin/list",
            PREFIX + "order/list",
            PREFIX + "package/list",
            PREFIX + "redeemCode/list",
            PREFIX + "singleTunnelGroup/list",
            PREFIX + "speedLimit/list",
            PREFIX + "speedLimit/tunnels",
            PREFIX + "taskQueue/errorLogs",
            PREFIX + "taskQueue/health",
            PREFIX + "taskQueue/list",
            PREFIX + "taskQueue/overview",
            PREFIX + "telegramLog/list",
            PREFIX + "tunnel/list",
            PREFIX + "tunnel/user/list",
            PREFIX + "tunnel/user/tunnel",
            PREFIX + "user/list",
            PREFIX + "user/package",
            PREFIX + "userDeviceGroup/list",
            PREFIX + "userGroup/list",
            PREFIX + "userGroup/names"
    )));

    /** 演示账号可分配的修改接口：接口路径 → 所属区域和它会改动的表 */
    private static final Map<String, EditRoute> EDIT_ROUTES = new HashMap<>();

    static {
        EditRoute config = new EditRoute(Arrays.asList(DemoArea.SITE.getCode(), DemoArea.PUSH.getCode()), Collections.singletonList("config"));
        EDIT_ROUTES.put(PREFIX + "config/update", config);
        EDIT_ROUTES.put(PREFIX + "config/updateSingle", config);
        EDIT_ROUTES.put(PREFIX + "deviceGroup/offlineConfig",
                new EditRoute(Arrays.asList(DemoArea.PUSH.getCode(), DemoArea.DEVICE_GROUP.getCode()), Collections.singletonList("device_group")));
        EditRoute userGroup = new EditRoute(Collections.singletonList(DemoArea.USER_GROUP.getCode()),
                Arrays.asList("user_group", "device_group_user_group_relation"));
        for (String action : new String[]{"create", "update", "delete", "batchDelete", "reorder"}) {
            EDIT_ROUTES.put(PREFIX + "userGroup/" + action, userGroup);
        }
        EditRoute nodeGroup = new EditRoute(Collections.singletonList(DemoArea.NODE_GROUP.getCode()),
                Arrays.asList("node_group", "node_group_relation"));
        for (String action : new String[]{"create", "update", "delete", "batchDelete", "reorder"}) {
            EDIT_ROUTES.put(PREFIX + "nodeGroup/" + action, nodeGroup);
        }
        EditRoute singleTunnelGroup = new EditRoute(Collections.singletonList(DemoArea.SINGLE_TUNNEL_GROUP.getCode()),
                Collections.singletonList("single_tunnel_group"));
        for (String action : new String[]{"create", "update", "delete"}) {
            EDIT_ROUTES.put(PREFIX + "singleTunnelGroup/" + action, singleTunnelGroup);
        }
        // 这两个接口只改 sort 字段
        EDIT_ROUTES.put(PREFIX + "deviceGroup/reorder",
                new EditRoute(Arrays.asList(DemoArea.DEVICE_SORT.getCode(), DemoArea.DEVICE_GROUP.getCode()), Collections.singletonList("device_group")));
        EDIT_ROUTES.put(PREFIX + "package/reorder",
                new EditRoute(Arrays.asList(DemoArea.PACKAGE_SORT.getCode(), DemoArea.PACKAGE.getCode()), Collections.singletonList("package_plan")));
        EditRoute packagePlan = new EditRoute(Collections.singletonList(DemoArea.PACKAGE.getCode()), Collections.singletonList("package_plan"));
        for (String action : new String[]{"create", "update", "delete", "batchDelete"}) {
            EDIT_ROUTES.put(PREFIX + "package/" + action, packagePlan);
        }
        EditRoute redeemCode = new EditRoute(Collections.singletonList(DemoArea.REDEEM_CODE.getCode()), Collections.singletonList("redeem_code"));
        EditRoute inviteCode = new EditRoute(Collections.singletonList(DemoArea.INVITE_CODE.getCode()), Collections.singletonList("invite_code"));
        for (String action : new String[]{"batchCreate", "delete"}) {
            EDIT_ROUTES.put(PREFIX + "redeemCode/" + action, redeemCode);
            EDIT_ROUTES.put(PREFIX + "inviteCode/" + action, inviteCode);
        }
        // 下面这些区域管理员勾选后才开放。查看安装命令（含节点密钥）、重置用户流量和密码、下单充值等接口不在其中，始终拒绝
        addRoutes("node", DemoArea.NODE, Arrays.asList("node", "node_group_relation", "tunnel"),
                "create", "update", "delete", "resetSecret");
        addRoutes("tunnel", DemoArea.TUNNEL, Arrays.asList("tunnel", "user_tunnel", "forward"),
                "create", "update", "delete", "user/assign", "user/remove", "user/update");
        addRoutes("forward", DemoArea.FORWARD, Collections.singletonList("forward"),
                "create", "update", "delete", "forceDelete", "pause", "resume", "updateOrder");
        addRoutes("forwardGroup", DemoArea.FORWARD_GROUP, Arrays.asList("forward_group", "forward"),
                "create", "update", "delete");
        addRoutes("deviceGroup", DemoArea.DEVICE_GROUP,
                Arrays.asList("device_group", "device_group_chain_hop", "device_group_user_group_relation"),
                "create", "update", "delete", "batchDelete");
        addRoutes("speedLimit", DemoArea.SPEED_LIMIT, Collections.singletonList("speed_limit"),
                "create", "update", "delete");
        addRoutes("user", DemoArea.USER, Arrays.asList("user", "user_tunnel", "forward"),
                "create", "update", "delete");
        addRoutes("order", DemoArea.ORDER, Arrays.asList("orders", "user"),
                "manualCreate", "updateStatus", "batchDelete");
    }

    private static void addRoutes(String module, DemoArea area, List<String> tables, String... actions) {
        EditRoute route = new EditRoute(Collections.singletonList(area.getCode()), tables);
        for (String action : actions) {
            EDIT_ROUTES.put(PREFIX + module + "/" + action, route);
        }
    }

    private static final class EditRoute {
        private final List<String> areas;
        private final List<String> tables;

        private EditRoute(List<String> areas, List<String> tables) {
            this.areas = areas;
            this.tables = tables;
        }
    }

    /** 请求属性：当前请求的演示账号可编辑的区域（配置接口按配置项进一步检查） */
    public static final String DEMO_AREAS_ATTRIBUTE = "demoAreas";

    /** 请求属性：这个修改接口对应的主表，DemoWriteGuard 用它取回打码字段的真实值 */
    public static final String DEMO_TABLE_ATTRIBUTE = "demoTable";

    private static final String SNAPSHOT_ATTRIBUTE = "demoSnapshot";
    private static final String USER_ID_ATTRIBUTE = "demoUserId";

    /** 请求属性：当前账号没有站点设置和推送通知页面，配置接口不返回密钥 */
    public static final String CONFIG_SECRETS_HIDDEN_ATTRIBUTE = "configSecretsHidden";

    /** 请求属性：当前请求来自演示账号，响应需要打码 */
    public static final String DEMO_ATTRIBUTE = "demoSession";

    private static final int USER_STATUS_BANNED = 0;
    private static final int ADMIN_ROLE = 0;

    private final UserMapper userMapper;
    private final DemoChangeService demoChangeService;

    public ReadOnlyInterceptor(UserMapper userMapper, DemoChangeService demoChangeService) {
        this.userMapper = userMapper;
        this.demoChangeService = demoChangeService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String token = request.getHeader("Authorization");
        // 无令牌的公开接口（如注册、配置列表）这里不限制；需要登录的接口已被 JWT 拦截器挡住
        if (token == null || !JwtUtil.validateToken(token)) {
            return true;
        }
        String uri = request.getRequestURI();
        boolean readPath = READ_PATHS.contains(uri);
        boolean demoToken = JwtUtil.isDemoToken(token);
        boolean adminToken = Integer.valueOf(ADMIN_ROLE).equals(JwtUtil.getRoleIdFromToken(token));
        // 普通用户调用不受页面权限限制的查询接口时不用查库
        if (!demoToken && !adminToken && readPath && !MenuPermission.isGated(uri)) {
            return true;
        }
        User user = userMapper.selectById(JwtUtil.getUserIdFromToken(token));
        if (demoToken) {
            // 角色也要和令牌一致：取消管理员后，旧令牌里的管理员角色不能继续用来看后台
            if (user == null || !DEMO_ENABLED.equals(user.getDemoMode())
                    || Integer.valueOf(USER_STATUS_BANNED).equals(user.getStatus())
                    || !java.util.Objects.equals(user.getRoleId(), JwtUtil.getRoleIdFromToken(token))) {
                throw new UnauthorizedException("无效的token或token已过期");
            }
            request.setAttribute(DEMO_ATTRIBUTE, Boolean.TRUE);
        } else if (adminToken && (user == null || !Integer.valueOf(ADMIN_ROLE).equals(user.getRoleId())
                || DEMO_ENABLED.equals(user.getDemoMode()) || Integer.valueOf(USER_STATUS_BANNED).equals(user.getStatus()))) {
            // 管理员令牌每次都回数据库核对：取消管理员、封禁或删除后，旧令牌（最长 90 天）立即失效，不能继续当管理员用
            throw new UnauthorizedException("无效的token或token已过期");
        }
        // 页面权限：没有分配对应页面的账号，接口同样拒绝，不只是隐藏菜单
        if (user != null && !MenuPermission.allowsEndpoint(user.getMenuPermissions(), uri)) {
            throw new ReadOnlyException("没有访问权限");
        }
        // 受限管理员没有站点设置和推送通知页面时，配置接口不能给它返回密钥
        if (user != null && user.getMenuPermissions() != null
                && Collections.disjoint(MenuPermission.parse(user.getMenuPermissions()), Arrays.asList("config", "pushNotification"))) {
            request.setAttribute(CONFIG_SECRETS_HIDDEN_ATTRIBUTE, Boolean.TRUE);
        }
        if (demoToken) {
            if (!readPath) {
                beginEdit(request, user);
            }
            return true;
        }
        // 刚被设为演示账号、还没重新登录的账号：旧令牌不带标记，修改操作同样要立即拒绝
        if (!readPath && user != null && DEMO_ENABLED.equals(user.getDemoMode())) {
            throw new ReadOnlyException("禁止编辑");
        }
        return true;
    }

    /** 只有分配了对应区域才放行，并在修改前记下相关表的内容 */
    private void beginEdit(HttpServletRequest request, User user) {
        EditRoute route = EDIT_ROUTES.get(request.getRequestURI());
        Set<String> areas = DemoArea.parse(user.getDemoAreas());
        if (route == null || route.areas.stream().noneMatch(area -> areas.contains(area) && !demoChangeService.isAreaDisabled(area))) {
            throw new ReadOnlyException("禁止编辑");
        }
        request.setAttribute(DEMO_AREAS_ATTRIBUTE, areas);
        request.setAttribute(DEMO_TABLE_ATTRIBUTE, route.tables.get(0));
        request.setAttribute(USER_ID_ATTRIBUTE, user.getId());
        request.setAttribute(SNAPSHOT_ATTRIBUTE, demoChangeService.begin(route.tables));
    }

    @Override
    @SuppressWarnings("unchecked")
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        Object snapshot = request.getAttribute(SNAPSHOT_ATTRIBUTE);
        if (snapshot != null) {
            demoChangeService.finish((Long) request.getAttribute(USER_ID_ATTRIBUTE), (Map<String, Map<String, String>>) snapshot);
        }
    }

    private static final Integer DEMO_ENABLED = 1;
}
