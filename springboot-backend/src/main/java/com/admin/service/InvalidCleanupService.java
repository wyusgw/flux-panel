package com.admin.service;

import com.admin.common.lang.R;
import com.admin.entity.DeviceGroup;
import com.admin.entity.Forward;
import com.admin.entity.Order;
import com.admin.entity.SingleTunnelGroup;
import com.admin.entity.Tunnel;
import com.admin.entity.User;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 用户管理的「清理无效用户」「清理无效规则」。删除不可恢复，所以：
 * 执行时总是重新扫描，不接受前端传来的名单（预览之后用户可能已经付费）；
 * 判断从严，宁可漏删也不误删。
 */
@Slf4j
@Service
public class InvalidCleanupService {

    private static final int ADMIN_ROLE = 0;
    private static final int ORDER_PAID = 1;

    @Resource
    private UserService userService;
    @Resource
    private ForwardService forwardService;
    @Resource
    private TunnelService tunnelService;
    @Resource
    private DeviceGroupService deviceGroupService;
    @Resource
    private SingleTunnelGroupService singleTunnelGroupService;
    @Resource
    private OrderService orderService;

    /**
     * 无效用户：用户组和余额都为 0，即从未付费。
     * 下面这些都算付过费或正在使用，不删：管理员和演示账号、绑定了套餐、有已支付的订单
     */
    static boolean isInvalidUser(User user, Set<Long> paidUserIds) {
        if (user.getRoleId() == null || user.getRoleId() == ADMIN_ROLE || Integer.valueOf(1).equals(user.getDemoMode())) {
            return false;
        }
        boolean noGroup = user.getGroupId() == null || user.getGroupId() == 0;
        boolean noBalance = user.getWalletBalance() == null || user.getWalletBalance().compareTo(BigDecimal.ZERO) == 0;
        boolean noPackage = user.getPackageId() == null || user.getPackageId() == 0;
        return noGroup && noBalance && noPackage && !paidUserIds.contains(user.getId());
    }

    /**
     * 无效规则：所属用户、入口或出口已被删除。判断方式和 TunnelResolver 一致：
     * 有隧道的规则看隧道；否则看入口设备组和出口设备组，出口为空是直连，不算无效
     */
    static boolean isInvalidForward(Forward forward, Set<Long> userIds, Set<Long> tunnelIds, Set<Long> deviceGroupIds) {
        if (forward.getUserId() == null || !userIds.contains(forward.getUserId().longValue())) {
            return true;
        }
        if (forward.getTunnelId() != null) {
            return !tunnelIds.contains(forward.getTunnelId().longValue());
        }
        if (forward.getInDeviceGroupId() == null || !deviceGroupIds.contains(forward.getInDeviceGroupId())) {
            return true;
        }
        return forward.getOutDeviceGroupId() != null && !deviceGroupIds.contains(forward.getOutDeviceGroupId());
    }

    private List<User> findInvalidUsers() {
        Set<Long> paid = orderService.list(new QueryWrapper<Order>().select("user_id").eq("order_status", ORDER_PAID))
                .stream().map(Order::getUserId).collect(Collectors.toSet());
        return userService.list().stream().filter(user -> isInvalidUser(user, paid)).collect(Collectors.toList());
    }

    private List<Forward> findInvalidForwards() {
        Set<Long> users = userService.list(new QueryWrapper<User>().select("id")).stream().map(User::getId).collect(Collectors.toSet());
        Set<Long> tunnels = tunnelService.list(new QueryWrapper<Tunnel>().select("id")).stream().map(Tunnel::getId).collect(Collectors.toSet());
        Set<Long> groups = deviceGroupService.list(new QueryWrapper<DeviceGroup>().select("id")).stream().map(DeviceGroup::getId).collect(Collectors.toSet());
        return forwardService.list().stream().filter(forward -> isInvalidForward(forward, users, tunnels, groups)).collect(Collectors.toList());
    }

    public R previewInvalidUsers() {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (User user : findInvalidUsers()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", user.getId());
            row.put("user", user.getUser());
            rows.add(row);
        }
        return R.ok(rows);
    }

    public R previewInvalidForwards() {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Forward forward : findInvalidForwards()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", forward.getId());
            row.put("name", forward.getName());
            rows.add(row);
        }
        return R.ok(rows);
    }

    public R cleanInvalidUsers() {
        int deleted = 0;
        List<String> failures = new ArrayList<>();
        for (User user : findInvalidUsers()) {
            try {
                List<DeviceGroup> owned = deviceGroupService.list(new QueryWrapper<DeviceGroup>().eq("owner_user_id", user.getId()));
                // 设备开放给了别人，别人的规则还在用：删了会断别人的线路，这个用户先不动
                if (usedByOthers(user, owned)) {
                    failures.add(user.getUser() + "：设备正被其他用户的规则使用");
                    continue;
                }
                R result = userService.deleteUser(user.getId());
                if (result.getCode() != 0) {
                    failures.add(user.getUser() + "：" + result.getMsg());
                    continue;
                }
                // 删除用户时只会删规则和隧道权限，单端设备要在规则删完之后再删
                for (DeviceGroup group : owned) {
                    R groupResult = deviceGroupService.deleteUserDeviceGroup(user.getId().intValue(), group.getId());
                    if (groupResult.getCode() != 0) {
                        failures.add(user.getUser() + " 的设备 " + group.getName() + "：" + groupResult.getMsg());
                    }
                }
                singleTunnelGroupService.remove(new QueryWrapper<SingleTunnelGroup>().eq("owner_user_id", user.getId()));
                deleted++;
            } catch (Exception e) {
                log.warn("清理无效用户 {} 失败", user.getId(), e);
                failures.add(user.getUser() + "：" + e.getMessage());
            }
        }
        return summary(deleted, failures);
    }

    private boolean usedByOthers(User user, List<DeviceGroup> owned) {
        if (owned.isEmpty()) {
            return false;
        }
        Set<Long> ids = new HashSet<>();
        owned.forEach(group -> ids.add(group.getId()));
        return forwardService.count(new QueryWrapper<Forward>()
                .ne("user_id", user.getId())
                .and(w -> w.in("in_device_group_id", ids).or().in("out_device_group_id", ids))) > 0;
    }

    public R cleanInvalidForwards() {
        int deleted = 0;
        List<String> failures = new ArrayList<>();
        for (Forward forward : findInvalidForwards()) {
            try {
                // 先按正常流程删，能连上节点就把服务一起删掉。入口或隧道已不存在时正常流程走不通，只删记录，
                // 节点上残留的服务由节点上报配置时的清理任务（CheckGostConfigAsync）删除
                R result = forwardService.deleteForward(forward.getId());
                if (result.getCode() != 0) {
                    result = forwardService.forceDeleteForward(forward.getId());
                }
                if (result.getCode() == 0) {
                    deleted++;
                } else {
                    failures.add(forward.getName() + "：" + result.getMsg());
                }
            } catch (Exception e) {
                log.warn("清理无效规则 {} 失败", forward.getId(), e);
                failures.add(forward.getName() + "：" + e.getMessage());
            }
        }
        return summary(deleted, failures);
    }

    private static R summary(int deleted, List<String> failures) {
        Map<String, Object> result = new HashMap<>();
        result.put("deleted", deleted);
        result.put("failures", failures);
        return R.ok(result);
    }
}
