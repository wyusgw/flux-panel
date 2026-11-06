package com.admin.common.utils;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 可以分配给演示账号编辑的区域，默认都不开放，由管理员逐个账号勾选。
 * 改动能否撤销、如何防止写坏真实数据，见 DemoChangeService 和 DemoWriteGuard。
 * RISKY 的区域会影响真实用户或线上流量，已经发生的后果撤销不了，前端勾选时会提示。
 */
public enum DemoArea {
    SITE("site", "站点设置"),
    PUSH("push", "推送通知"),
    USER_GROUP("userGroup", "用户组"),
    NODE_GROUP("nodeGroup", "节点组"),
    SINGLE_TUNNEL_GROUP("singleTunnelGroup", "单端组"),
    DEVICE_SORT("deviceSort", "设备排序"),
    PACKAGE_SORT("packageSort", "套餐排序"),
    PACKAGE("package", "套餐内容"),
    REDEEM_CODE("redeemCode", "兑换码"),
    INVITE_CODE("inviteCode", "邀请码"),
    NODE("node", "节点"),
    TUNNEL("tunnel", "隧道"),
    FORWARD("forward", "转发规则"),
    FORWARD_GROUP("forwardGroup", "转发分组"),
    DEVICE_GROUP("deviceGroup", "设备"),
    SPEED_LIMIT("speedLimit", "限速规则"),
    USER("user", "用户"),
    ORDER("order", "订单");

    private final String code;
    private final String label;

    DemoArea(String code, String label) {
        this.code = code;
        this.label = label;
    }

    public String getCode() {
        return code;
    }

    public String getLabel() {
        return label;
    }

    /**
     * 这个区域对应的功能是否开启，判断依据和后台菜单、注册页一致。
     * 功能关闭时不显示选项，已勾选的也不生效；重新开启后恢复之前的勾选
     * @param config 取配置值
     */
    public boolean isFeatureEnabled(java.util.function.Function<String, String> config) {
        if (this == SINGLE_TUNNEL_GROUP) {
            return "true".equals(config.apply("user_device_group_enabled"));
        }
        if (this == INVITE_CODE) {
            String policy = config.apply("invite_register_policy");
            return "optional".equals(policy) || "required".equals(policy);
        }
        return true;
    }

    public static boolean isValid(String code) {
        return Arrays.stream(values()).anyMatch(area -> area.code.equals(code));
    }

    public static Set<String> parse(String csv) {
        if (csv == null || csv.trim().isEmpty()) {
            return Collections.emptySet();
        }
        return Arrays.stream(csv.split(",")).map(String::trim).filter(DemoArea::isValid).collect(Collectors.toSet());
    }

    public static String join(List<String> codes) {
        return codes.stream().filter(DemoArea::isValid).distinct().collect(Collectors.joining(","));
    }
}
