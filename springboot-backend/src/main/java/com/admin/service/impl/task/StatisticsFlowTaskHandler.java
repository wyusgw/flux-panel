package com.admin.service.impl.task;

import com.admin.common.lang.R;
import com.admin.entity.StatisticsFlow;
import com.admin.entity.TaskQueue;
import com.admin.entity.User;
import com.admin.service.StatisticsFlowService;
import com.admin.service.TaskHandler;
import com.admin.service.UserService;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import java.util.ArrayList;
import java.util.List;

/**
 * <p>
 * 任务队列的「流量统计」处理器：每小时整点由定时任务登记一条（dedupKey 为该小时的时间戳），
 * 按用户当前累计流量生成这一小时的流量增量记录；失败可重试，重试不会重复写入同一小时的记录。
 * payload 约定：{"time": 1700000000000, "hour": "14:00", "summary": "..."}
 * </p>
 */
@Component
public class StatisticsFlowTaskHandler implements TaskHandler {

    @Resource
    @Lazy
    private UserService userService;

    @Resource
    @Lazy
    private StatisticsFlowService statisticsFlowService;

    @Override
    public String getTaskType() {
        return "STATISTICS_FLOW";
    }

    @Override
    public String getLabel() {
        return "流量统计";
    }

    @Override
    public long successRetentionMs() {
        return 2L * 60 * 60 * 1000;
    }

    @Override
    public R handle(TaskQueue task) {
        JSONObject payload = JSONObject.parseObject(task.getPayload());
        Long time = payload != null ? payload.getLong("time") : null;
        String hour = payload != null ? payload.getString("hour") : null;
        if (time == null || hour == null) {
            return R.err("任务数据缺少 time/hour");
        }
        try {
            // 幂等：这一小时的记录已经写过（上一次执行写入后才失败/重复触发）就不再重复写
            long done = statisticsFlowService.count(new LambdaQueryWrapper<StatisticsFlow>().eq(StatisticsFlow::getCreatedTime, time));
            if (done > 0) {
                return R.ok();
            }
            List<StatisticsFlow> records = new ArrayList<>();
            for (User user : userService.list()) {
                long currentTotalFlow = user.getInFlow() + user.getOutFlow();
                StatisticsFlow last = statisticsFlowService.getOne(
                        new LambdaQueryWrapper<StatisticsFlow>()
                                .eq(StatisticsFlow::getUserId, user.getId())
                                .orderByDesc(StatisticsFlow::getId)
                                .last("LIMIT 1"));
                long increment = currentTotalFlow;
                if (last != null) {
                    increment = currentTotalFlow - last.getTotalFlow();
                    if (increment < 0) {
                        increment = currentTotalFlow;
                    }
                }
                StatisticsFlow record = new StatisticsFlow();
                record.setUserId(user.getId());
                record.setFlow(increment);
                record.setTotalFlow(currentTotalFlow);
                record.setTime(hour);
                record.setCreatedTime(time);
                records.add(record);
            }
            statisticsFlowService.saveBatch(records);
            return R.ok();
        } catch (Exception e) {
            return R.err("流量统计失败: " + e.getMessage());
        }
    }
}
