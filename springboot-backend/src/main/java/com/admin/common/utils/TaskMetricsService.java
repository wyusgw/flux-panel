package com.admin.common.utils;

import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLongArray;

/**
 * <p>
 * 转发同步 / Telegram 通知的轻量级处理量统计：按分钟分桶累加成功/失败次数，只保留最近 24 小时，
 * 纯内存计数，不落库、不影响转发同步与通知发送本身的执行逻辑，仅用于仪表盘展示「近一小时处理量」
 * 「24 小时内成功」这类总量指标（区别于 task_queue 表——那张表只登记失败重试的任务）。
 * </p>
 *
 * @author QAQ
 * @since 2026-09-28
 */
@Component
public class TaskMetricsService {

    private final Counter success = new Counter();
    private final Counter failure = new Counter();

    public void recordSuccess() {
        success.record();
    }

    public void recordFailure() {
        failure.record();
    }

    public long successInLastHour() {
        return success.sum(60);
    }

    public long failureInLastHour() {
        return failure.sum(60);
    }

    public long successInLast24h() {
        return success.sum(24 * 60);
    }

    public long failureInLast24h() {
        return failure.sum(24 * 60);
    }

    /**
     * 环形缓冲区：每分钟一个桶，24 小时共 1440 个桶。桶被复用时靠 stamps 记录的「分钟序号」
     * 判断这个桶上一次写入是否就是当前分钟——不是的话说明是 24 小时前留下的旧数据，先清零再累加。
     */
    private static final class Counter {
        private static final int MINUTES = 24 * 60;
        private final AtomicLongArray counts = new AtomicLongArray(MINUTES);
        private final AtomicLongArray stamps = new AtomicLongArray(MINUTES);

        void record() {
            long minuteSeq = System.currentTimeMillis() / 60_000L;
            int idx = (int) (minuteSeq % MINUTES);
            if (stamps.get(idx) != minuteSeq) {
                synchronized (this) {
                    if (stamps.get(idx) != minuteSeq) {
                        counts.set(idx, 0);
                        stamps.set(idx, minuteSeq);
                    }
                }
            }
            counts.incrementAndGet(idx);
        }

        long sum(int minutesBack) {
            long nowMinuteSeq = System.currentTimeMillis() / 60_000L;
            long total = 0;
            for (int i = 0; i < minutesBack; i++) {
                long minuteSeq = nowMinuteSeq - i;
                int idx = (int) (minuteSeq % MINUTES);
                if (stamps.get(idx) == minuteSeq) {
                    total += counts.get(idx);
                }
            }
            return total;
        }
    }
}
