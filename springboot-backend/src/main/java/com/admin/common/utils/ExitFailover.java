package com.admin.common.utils;

import com.admin.entity.Tunnel;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 出口故障转移的小工具：备用出口节点 ID 列表与逗号分隔字符串互转，以及汇总一条规则涉及的全部出口节点。
 */
public final class ExitFailover {

    /** 最多串联的备用出口个数（不含主出口） */
    public static final int MAX_BACKUPS = 3;

    private ExitFailover() {
    }

    public static String join(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return null;
        }
        StringBuilder sb = new StringBuilder();
        for (Long id : ids) {
            if (sb.length() > 0) {
                sb.append(',');
            }
            sb.append(id);
        }
        return sb.toString();
    }

    /** 解析逗号分隔的节点 ID；空、格式不对的项忽略，重复的只保留第一个 */
    public static List<Long> parse(String csv) {
        if (csv == null || csv.trim().isEmpty()) {
            return Collections.emptyList();
        }
        Set<Long> ids = new LinkedHashSet<>();
        for (String part : csv.split(",")) {
            String s = part.trim();
            if (s.matches("\\d{1,18}")) {
                ids.add(Long.parseLong(s));
            }
        }
        return new ArrayList<>(ids);
    }

    /** 主出口节点在前，备用出口节点按优先级在后；没有出口（直接转发）返回空列表 */
    public static List<Long> allOutNodeIds(Tunnel tunnel) {
        List<Long> all = new ArrayList<>();
        if (tunnel == null || tunnel.getOutNodeId() == null) {
            return all;
        }
        all.add(tunnel.getOutNodeId());
        if (tunnel.getBackupOutNodeIds() != null) {
            for (Long id : tunnel.getBackupOutNodeIds()) {
                if (id != null && !all.contains(id)) {
                    all.add(id);
                }
            }
        }
        return all;
    }

    /** 主出口地址在前，备用出口地址按优先级在后，用于下发给入口节点的链 */
    public static List<String> allOutIps(Tunnel tunnel) {
        List<String> all = new ArrayList<>();
        if (tunnel == null || tunnel.getOutIp() == null) {
            return all;
        }
        all.add(tunnel.getOutIp());
        if (tunnel.getBackupOutIps() != null) {
            all.addAll(tunnel.getBackupOutIps());
        }
        return all;
    }
}
