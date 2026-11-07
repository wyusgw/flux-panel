package com.admin.common.utils;

import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * 普通用户能把流量转发到哪里。节点通常在运营方的网络里，不限制的话用户可以用转发规则或诊断工具
 * 访问节点本机和内网服务。回环、链路本地（含云厂商元数据地址）和节点自身地址始终禁止，内网地址由站点设置决定。
 * 域名按面板解析到的结果判断；节点解析结果可能不同，这里只能挡住常见情况。
 */
public final class ForwardTargetPolicy {

    public static final String CONFIG_ALLOW_PRIVATE = "allow_private_forward_target";

    private static final String BLOCKED_LOCAL = "不能转发到回环或本机地址：";
    private static final String BLOCKED_PRIVATE = "不能转发到内网地址：";
    private static final String BLOCKED_NODE = "不能转发到节点自身地址：";
    private static final String BLOCKED_FORMAT = "目标地址格式不支持：";

    @FunctionalInterface
    public interface Resolver {
        InetAddress[] resolve(String host) throws UnknownHostException;
    }

    private ForwardTargetPolicy() {
    }

    /** 检查规则的全部目标地址（逗号或换行分隔），不允许时返回原因，允许时返回 null */
    public static String checkRemoteAddrs(String remoteAddrs, boolean allowPrivate, Collection<String> nodeAddrs, Resolver resolver) {
        if (remoteAddrs == null) {
            return null;
        }
        for (String address : remoteAddrs.split("[,\\s]+")) {
            if (address.isEmpty()) {
                continue;
            }
            String reason = checkHost(extractHost(address), allowPrivate, nodeAddrs, resolver);
            if (reason != null) {
                return reason;
            }
        }
        return null;
    }

    /** 检查单个主机名或 IP，不允许时返回原因，允许时返回 null */
    public static String checkHost(String rawHost, boolean allowPrivate, Collection<String> nodeAddrs, Resolver resolver) {
        String host = normalize(rawHost);
        // % 是 IPv6 区域标识：面板上不存在这张网卡时解析失败，节点却能照常连接，不拒绝就绕过了后面的判断
        if (host.isEmpty() || host.startsWith("-") || host.contains("%")) {
            return BLOCKED_FORMAT + rawHost;
        }
        if (host.equals("localhost") || host.endsWith(".localhost")) {
            return BLOCKED_LOCAL + rawHost;
        }
        // 127.1、2130706433、0x7f.0.0.1、0177.0.0.1 这些写法各个程序解析结果不一致，只接受标准的点分十进制
        if (looksNumeric(host) && !isCanonicalIpv4(host)) {
            return BLOCKED_FORMAT + rawHost;
        }

        InetAddress[] addresses = resolve(host, resolver);
        // 解析不了的域名可以放行，但 IP 字面量解析不了说明写法有问题，判断不了指向哪里
        if (addresses.length == 0 && host.contains(":")) {
            return BLOCKED_FORMAT + rawHost;
        }
        Set<String> nodeIps = nodeIps(nodeAddrs, resolver);
        if (nodeHosts(nodeAddrs).contains(host)) {
            return BLOCKED_NODE + rawHost;
        }
        for (InetAddress address : addresses) {
            InetAddress effective = unwrapEmbeddedIpv4(address);
            if (isLocal(effective)) {
                return BLOCKED_LOCAL + rawHost;
            }
            if (nodeIps.contains(effective.getHostAddress())) {
                return BLOCKED_NODE + rawHost;
            }
            if (!allowPrivate && isPrivate(effective)) {
                return BLOCKED_PRIVATE + rawHost;
            }
        }
        return null;
    }

    static String extractHost(String address) {
        String value = address.trim();
        int scheme = value.indexOf("://");
        if (scheme >= 0) {
            value = value.substring(scheme + 3);
        }
        int slash = value.indexOf('/');
        if (slash >= 0) {
            value = value.substring(0, slash);
        }
        int at = value.lastIndexOf('@');
        if (at >= 0) {
            value = value.substring(at + 1);
        }
        if (value.startsWith("[")) {
            int close = value.indexOf(']');
            return close > 1 ? value.substring(1, close) : value;
        }
        // 没加方括号的 IPv6 有多个冒号，整段都是地址
        int first = value.indexOf(':');
        int last = value.lastIndexOf(':');
        if (first != last) {
            return value;
        }
        return last > 0 ? value.substring(0, last) : value;
    }

    private static String normalize(String host) {
        String value = host == null ? "" : host.trim().toLowerCase(Locale.ROOT);
        while (value.endsWith(".")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    private static boolean looksNumeric(String host) {
        return host.matches("[0-9.]+") || host.startsWith("0x");
    }

    private static boolean isCanonicalIpv4(String host) {
        return host.matches("(0|[1-9][0-9]{0,2})(\\.(0|[1-9][0-9]{0,2})){3}")
                && Arrays.stream(host.split("\\.")).allMatch(part -> Integer.parseInt(part) <= 255);
    }

    private static InetAddress[] resolve(String host, Resolver resolver) {
        try {
            return resolver.resolve(host);
        } catch (UnknownHostException e) {
            // 面板解析不了不代表节点解析不了（如节点内部的 DNS），不因此拒绝
            return new InetAddress[0];
        }
    }

    private static Set<String> nodeHosts(Collection<String> nodeAddrs) {
        Set<String> hosts = new HashSet<>();
        if (nodeAddrs != null) {
            for (String addr : nodeAddrs) {
                if (addr != null) {
                    for (String part : addr.split("[,\\s]+")) {
                        if (!part.isEmpty()) {
                            hosts.add(normalize(extractHost(part)));
                        }
                    }
                }
            }
        }
        return hosts;
    }

    private static Set<String> nodeIps(Collection<String> nodeAddrs, Resolver resolver) {
        Set<String> ips = new HashSet<>();
        for (String host : nodeHosts(nodeAddrs)) {
            for (InetAddress address : resolve(host, resolver)) {
                ips.add(unwrapEmbeddedIpv4(address).getHostAddress());
            }
        }
        return ips;
    }

    /** ::127.0.0.1 和 64:ff9b::7f00:1 实际指向其中的 IPv4 地址 */
    private static InetAddress unwrapEmbeddedIpv4(InetAddress address) {
        if (!(address instanceof Inet6Address)) {
            return address;
        }
        byte[] b = address.getAddress();
        boolean compatible = allZero(b, 0, 12) && !allZero(b, 12, 15);
        boolean nat64 = b[0] == 0x00 && b[1] == 0x64 && (b[2] & 0xff) == 0xff && (b[3] & 0xff) == 0x9b && allZero(b, 4, 12);
        if (compatible || nat64) {
            try {
                return InetAddress.getByAddress(Arrays.copyOfRange(b, 12, 16));
            } catch (UnknownHostException e) {
                return address;
            }
        }
        return address;
    }

    private static boolean allZero(byte[] bytes, int from, int to) {
        for (int i = from; i < to; i++) {
            if (bytes[i] != 0) {
                return false;
            }
        }
        return true;
    }

    private static boolean isLocal(InetAddress address) {
        byte[] b = address.getAddress();
        return address.isLoopbackAddress() || address.isAnyLocalAddress() || address.isLinkLocalAddress()
                || address.isMulticastAddress() || (b.length == 4 && b[0] == 0);
    }

    private static boolean isPrivate(InetAddress address) {
        byte[] b = address.getAddress();
        if (address.isSiteLocalAddress()) {
            return true;
        }
        if (b.length == 16) {
            return (b[0] & 0xfe) == 0xfc; // fc00::/7
        }
        int first = b[0] & 0xff;
        int second = b[1] & 0xff;
        return (first == 100 && second >= 64 && second <= 127) // 100.64.0.0/10（运营商和云厂商内网）
                || (first == 198 && (second == 18 || second == 19)); // 198.18.0.0/15
    }
}
