package com.admin.service.impl;

import com.admin.entity.NodeDailyRawFlow;
import com.admin.mapper.NodeDailyRawFlowMapper;
import com.admin.service.NodeDailyRawFlowService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class NodeDailyRawFlowServiceImpl extends ServiceImpl<NodeDailyRawFlowMapper, NodeDailyRawFlow> implements NodeDailyRawFlowService {

    private static final DateTimeFormatter DAY_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    // 对同一节点同一天的累加做同步，避免并发上报时的读-改-写竞态覆盖彼此的增量
    private static final ConcurrentHashMap<String, Object> DAY_LOCKS = new ConcurrentHashMap<>();

    @Override
    public void recordRaw(Long nodeId, long rawBytes) {
        if (nodeId == null || rawBytes <= 0) return;
        String today = LocalDate.now().format(DAY_FORMAT);
        String lockKey = nodeId + "_" + today;

        synchronized (DAY_LOCKS.computeIfAbsent(lockKey, k -> new Object())) {
            NodeDailyRawFlow existing = this.getOne(new QueryWrapper<NodeDailyRawFlow>()
                    .eq("node_id", nodeId).eq("day", today));

            if (existing != null) {
                UpdateWrapper<NodeDailyRawFlow> updateWrapper = new UpdateWrapper<>();
                updateWrapper.eq("id", existing.getId());
                updateWrapper.setSql("raw_bytes = raw_bytes + " + rawBytes);
                updateWrapper.set("updated_time", System.currentTimeMillis());
                this.update(null, updateWrapper);
            } else {
                NodeDailyRawFlow record = new NodeDailyRawFlow();
                record.setNodeId(nodeId);
                record.setDay(today);
                record.setRawBytes(rawBytes);
                record.setUpdatedTime(System.currentTimeMillis());
                this.save(record);
            }
        }
    }

    @Override
    public List<NodeDailyRawFlow> listByDay(String day) {
        return this.list(new QueryWrapper<NodeDailyRawFlow>().eq("day", day));
    }
}
