package com.admin.common.utils;

import cn.hutool.http.HttpUtil;
import com.admin.entity.Node;
import com.alibaba.fastjson.JSONObject;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

/**
 * 节点状态页的「IPv4 地区 / IPv6 地区」：在节点的服务器地址和连接地址里分别找第一个公网 IPv4、IPv6
 * （填的是域名时先解析），再查所在国家 / 地区。
 * <p>
 * 原来是每个浏览者的浏览器直接拿第一个连接地址去问 ipwho.is：不分 IPv4 / IPv6，域名查不到，IPv6 地区一列从来没有数据，
 * 节点地址还会从每个浏览者那里发给第三方。现在由面板后端查询并缓存（成功缓存 1 天、失败 10 分钟），页面只拿到国家代码。
 * </p>
 */
@Slf4j
@Component
public class NodeRegionLookup {

    private static final String LOOKUP_URL = "https://ipwho.is/";
    private static final int LOOKUP_TIMEOUT_MS = 4000;
    private static final long DNS_TIMEOUT_MS = 3000;
    private static final long SUCCESS_TTL_MS = 24L * 60 * 60 * 1000;
    private static final long FAILURE_TTL_MS = 10L * 60 * 1000;
    private static final long DNS_TTL_MS = 10L * 60 * 1000;

    /** 两位国家代码（小写），查不到时为空串 */
    private final Map<String, Cached<String>> countryByIp = new ConcurrentHashMap<>();
    private final Map<String, Cached<List<InetAddress>>> addressesByHost = new ConcurrentHashMap<>();

    private final ExecutorService dnsExecutor = Executors.newFixedThreadPool(4, runnable -> {
        Thread thread = new Thread(runnable, "node-region-dns");
        thread.setDaemon(true);
        return thread;
    });

    private final ExecutorService lookupExecutor = Executors.newFixedThreadPool(8, runnable -> {
        Thread thread = new Thread(runnable, "node-region-lookup");
        thread.setDaemon(true);
        return thread;
    });

    /** 整批查询最多等这么久；没查完的节点本次返回空，后台继续查完并缓存，下次打开页面就有 */
    private static final long BATCH_DEADLINE_MS = 8000;

    /** 测试时替换：查询某个 IP 的国家代码（大小写均可），查不到返回 null */
    Function<String, String> countryFetcher = NodeRegionLookup::fetchCountry;
    /** 测试时替换：解析域名 */
    Function<String, List<InetAddress>> resolver = this::resolveWithTimeout;

    private static final class Cached<T> {
        final T value;
        final long expiresAt;

        Cached(T value, long ttl) {
            this.value = value;
            this.expiresAt = System.currentTimeMillis() + ttl;
        }

        boolean fresh() {
            return System.currentTimeMillis() < expiresAt;
        }
    }

    /** 一批节点并行查询，返回 节点 ID → {"v4", "v6"} */
    public Map<Long, Map<String, String>> regionsOf(List<Node> nodes) {
        Map<Long, Future<Map<String, String>>> futures = new LinkedHashMap<>();
        for (Node node : nodes) {
            futures.put(node.getId(), lookupExecutor.submit(() -> regionsOf(node)));
        }
        long deadline = System.currentTimeMillis() + BATCH_DEADLINE_MS;
        Map<Long, Map<String, String>> result = new LinkedHashMap<>();
        for (Map.Entry<Long, Future<Map<String, String>>> entry : futures.entrySet()) {
            try {
                long wait = Math.max(0, deadline - System.currentTimeMillis());
                result.put(entry.getKey(), entry.getValue().get(wait, TimeUnit.MILLISECONDS));
            } catch (Exception e) {
                Map<String, String> empty = new LinkedHashMap<>();
                empty.put("v4", null);
                empty.put("v6", null);
                result.put(entry.getKey(), empty);
            }
        }
        return result;
    }

    /** 节点的 IPv4 / IPv6 地区：{"v4": "us", "v6": "jp"}，查不到的为 null */
    public Map<String, String> regionsOf(Node node) {
        InetAddress v4 = null;
        InetAddress v6 = null;
        for (String host : candidateHosts(node.getServerIp(), node.getIp())) {
            for (InetAddress address : addressesOf(host)) {
                if (!isPublic(address)) {
                    continue;
                }
                if (v4 == null && address instanceof Inet4Address) {
                    v4 = address;
                } else if (v6 == null && address instanceof Inet6Address) {
                    v6 = address;
                }
            }
            if (v4 != null && v6 != null) {
                break;
            }
        }
        Map<String, String> result = new LinkedHashMap<>();
        result.put("v4", v4 == null ? null : countryOf(v4.getHostAddress()));
        result.put("v6", v6 == null ? null : countryOf(v6.getHostAddress()));
        return result;
    }

    /** 候选地址：服务器地址在前，连接地址（英文逗号分隔）在后；去掉 IPv6 的方括号和空项，去重 */
    static List<String> candidateHosts(String serverIp, String entryIps) {
        List<String> hosts = new ArrayList<>();
        List<String> raw = new ArrayList<>();
        raw.add(serverIp);
        if (entryIps != null) {
            raw.addAll(Arrays.asList(entryIps.split(",")));
        }
        for (String value : raw) {
            if (value == null) {
                continue;
            }
            String host = value.trim();
            if (host.startsWith("[") && host.endsWith("]")) {
                host = host.substring(1, host.length() - 1);
            }
            if (!host.isEmpty() && !hosts.contains(host)) {
                hosts.add(host);
            }
        }
        return hosts;
    }

    /** IP 字面量直接解析（不走 DNS）；域名按缓存解析 */
    List<InetAddress> addressesOf(String host) {
        if (isIpLiteral(host)) {
            try {
                return Collections.singletonList(InetAddress.getByName(host));
            } catch (Exception e) {
                return Collections.emptyList();
            }
        }
        String key = host.toLowerCase(Locale.ROOT);
        Cached<List<InetAddress>> cached = addressesByHost.get(key);
        if (cached != null && cached.fresh()) {
            return cached.value;
        }
        List<InetAddress> resolved = resolver.apply(host);
        List<InetAddress> value = resolved == null ? Collections.emptyList() : resolved;
        addressesByHost.put(key, new Cached<>(value, DNS_TTL_MS));
        return value;
    }

    /** 域名里不会有冒号，带冒号的就是 IPv6 字面量 */
    static boolean isIpLiteral(String host) {
        return host.matches("\\d{1,3}(\\.\\d{1,3}){3}") || host.contains(":");
    }

    private List<InetAddress> resolveWithTimeout(String host) {
        Future<InetAddress[]> future = dnsExecutor.submit(() -> InetAddress.getAllByName(host));
        try {
            return Arrays.asList(future.get(DNS_TIMEOUT_MS, TimeUnit.MILLISECONDS));
        } catch (Exception e) {
            future.cancel(true);
            return Collections.emptyList();
        }
    }

    /** 公网地址才查地区：排除内网、回环、链路本地、组播、CGNAT（100.64.0.0/10）、IPv6 唯一本地地址（fc00::/7） */
    static boolean isPublic(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                || address.isSiteLocalAddress() || address.isMulticastAddress()) {
            return false;
        }
        byte[] b = address.getAddress();
        if (address instanceof Inet4Address) {
            int first = b[0] & 0xff;
            int second = b[1] & 0xff;
            return !(first == 100 && second >= 64 && second <= 127) && first != 0;
        }
        return (b[0] & 0xfe) != 0xfc;
    }

    String countryOf(String ip) {
        Cached<String> cached = countryByIp.get(ip);
        if (cached != null && cached.fresh()) {
            return cached.value.isEmpty() ? null : cached.value;
        }
        String code = null;
        try {
            code = countryFetcher.apply(ip);
        } catch (Exception e) {
            log.info("查询 {} 的地区失败: {}", ip, e.getMessage());
        }
        String normalized = code == null || !code.trim().matches("[A-Za-z]{2}") ? "" : code.trim().toLowerCase(Locale.ROOT);
        countryByIp.put(ip, new Cached<>(normalized, normalized.isEmpty() ? FAILURE_TTL_MS : SUCCESS_TTL_MS));
        return normalized.isEmpty() ? null : normalized;
    }

    private static String fetchCountry(String ip) {
        String body = HttpUtil.get(LOOKUP_URL + ip, LOOKUP_TIMEOUT_MS);
        JSONObject json = JSONObject.parseObject(body);
        if (json == null || !json.getBooleanValue("success")) {
            return null;
        }
        return json.getString("country_code");
    }
}
