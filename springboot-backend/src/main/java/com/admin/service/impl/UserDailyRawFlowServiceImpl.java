package com.admin.service.impl;

import com.admin.entity.UserDailyRawFlow;
import com.admin.mapper.UserDailyRawFlowMapper;
import com.admin.service.UserDailyRawFlowService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class UserDailyRawFlowServiceImpl extends ServiceImpl<UserDailyRawFlowMapper, UserDailyRawFlow> implements UserDailyRawFlowService {

    private static final DateTimeFormatter DAY_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    // 对同一用户同一天的累加做同步，避免并发上报时的读-改-写竞态覆盖彼此的增量
    private static final ConcurrentHashMap<String, Object> DAY_LOCKS = new ConcurrentHashMap<>();

    @Override
    public void recordRaw(Integer userId, long rawBytes) {
        if (userId == null || rawBytes <= 0) return;
        String today = LocalDate.now().format(DAY_FORMAT);
        String lockKey = userId + "_" + today;

        synchronized (DAY_LOCKS.computeIfAbsent(lockKey, k -> new Object())) {
            UserDailyRawFlow existing = this.getOne(new QueryWrapper<UserDailyRawFlow>()
                    .eq("user_id", userId).eq("day", today));

            if (existing != null) {
                UpdateWrapper<UserDailyRawFlow> updateWrapper = new UpdateWrapper<>();
                updateWrapper.eq("id", existing.getId());
                updateWrapper.setSql("raw_bytes = raw_bytes + " + rawBytes);
                updateWrapper.set("updated_time", System.currentTimeMillis());
                this.update(null, updateWrapper);
            } else {
                UserDailyRawFlow record = new UserDailyRawFlow();
                record.setUserId(userId);
                record.setDay(today);
                record.setRawBytes(rawBytes);
                record.setUpdatedTime(System.currentTimeMillis());
                this.save(record);
            }
        }
    }

    @Override
    public long[] getTodayAndYesterday(Integer userId) {
        if (userId == null) return new long[]{0L, 0L};
        String today = LocalDate.now().format(DAY_FORMAT);
        String yesterday = LocalDate.now().minusDays(1).format(DAY_FORMAT);

        UserDailyRawFlow todayRecord = this.getOne(new QueryWrapper<UserDailyRawFlow>()
                .eq("user_id", userId).eq("day", today));
        UserDailyRawFlow yesterdayRecord = this.getOne(new QueryWrapper<UserDailyRawFlow>()
                .eq("user_id", userId).eq("day", yesterday));

        return new long[]{
                todayRecord != null && todayRecord.getRawBytes() != null ? todayRecord.getRawBytes() : 0L,
                yesterdayRecord != null && yesterdayRecord.getRawBytes() != null ? yesterdayRecord.getRawBytes() : 0L
        };
    }
}
