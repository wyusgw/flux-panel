package com.admin.common.task;


import com.admin.entity.StatisticsFlow;
import com.admin.entity.UserDailyRawFlow;
import com.admin.service.StatisticsFlowService;
import com.admin.service.UserDailyRawFlowService;
import com.admin.service.TaskQueueService;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import javax.annotation.PostConstruct;
import javax.annotation.Resource;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.Date;

@Slf4j
@Configuration
@EnableScheduling
public class StatisticsFlowAsync {

    @Resource
    TaskQueueService taskQueueService;

    @Resource
    StatisticsFlowService statisticsFlowService;

    @Resource
    UserDailyRawFlowService userDailyRawFlowService;

    @Scheduled(cron = "0 0 * * * ?")
    public void statistics_flow() {
        LocalDateTime currentHour = LocalDateTime.now().withMinute(0).withSecond(0).withNano(0);
        String hourString = currentHour.format(DateTimeFormatter.ofPattern("HH:mm"));
        long time = new Date().getTime();

        // 删除48小时前的数据
        long nowMs = new Date().getTime();
        long cutoffMs = nowMs - 48L * 60 * 60 * 1000;
        statisticsFlowService.remove(
                new LambdaQueryWrapper<StatisticsFlow>()
                        .lt(StatisticsFlow::getCreatedTime, cutoffMs)
        );

        // 顺带清理 3 天前的每日原始流量记录（"统计数据"弹窗只需要今日/昨日，留 3 天余量足够）
        String keepFromDay = LocalDate.now().minusDays(3).format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        userDailyRawFlowService.remove(
                new LambdaQueryWrapper<UserDailyRawFlow>()
                        .lt(UserDailyRawFlow::getDay, keepFromDay)
        );





        // 实际的统计计算交给任务队列：失败可重试，并能在队列监控里看到执行情况
        JSONObject payload = new JSONObject();
        payload.put("time", time);
        payload.put("hour", hourString);
        payload.put("summary", "每小时流量统计 " + hourString);
        Long queueId = taskQueueService.enqueue("STATISTICS_FLOW", String.valueOf(time), payload.toJSONString(),
                Collections.emptyList(), null);
        taskQueueService.dispatch(queueId);

    }

}
