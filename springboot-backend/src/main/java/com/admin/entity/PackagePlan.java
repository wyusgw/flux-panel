package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.List;

/**
 * <p>
 * 套餐
 * </p>
 *
 * @author QAQ
 * @since 2026-09-21
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("package_plan")
public class PackagePlan extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private String name;

    /** 不限时流量包：购买后覆盖用户组、流量、规则数，清零已用流量，到期时间设为 9999-09-09 08:09:09 */
    public static final String TYPE_TRAFFIC = "traffic";
    /** 不限时流量包（可叠加）：只把套餐流量加到用户当前的流量额度上，不改用户组、到期时间、规则数和已用流量 */
    public static final String TYPE_TRAFFIC_STACK = "traffic_stack";
    /** 月付：到期时间按自然月顺延 时长倍数 个月 */
    public static final String TYPE_MONTHLY = "monthly";
    /** 日付：到期时间顺延 时长倍数 天 */
    public static final String TYPE_DAILY = "daily";
    /** 周付：到期时间顺延 时长倍数 × 7 天 */
    public static final String TYPE_WEEKLY = "weekly";
    /** 半年付：到期时间按自然月顺延 时长倍数 × 6 个月 */
    public static final String TYPE_SEMIANNUAL = "semiannual";
    /** 一年付：到期时间按自然月顺延 时长倍数 × 12 个月 */
    public static final String TYPE_YEARLY = "yearly";
    public static final List<String> TYPES = Arrays.asList(TYPE_TRAFFIC, TYPE_TRAFFIC_STACK, TYPE_MONTHLY, TYPE_DAILY,
            TYPE_WEEKLY, TYPE_SEMIANNUAL, TYPE_YEARLY);
    /** 按时长倍数顺延到期时间的类型（时长倍数至少为 1） */
    public static final List<String> DURATION_TYPES = Arrays.asList(TYPE_MONTHLY, TYPE_DAILY, TYPE_WEEKLY, TYPE_SEMIANNUAL, TYPE_YEARLY);

    /** 永久（不限时）套餐的到期时间：9999-09-09 08:09:09（UTC+8）；旧版本写入的是 2099-12-31 23:59:59（4102415999000），升级脚本会改成新值 */
    public static final long PERMANENT_EXP_TIME = 253392451749000L;

    /**
     * 套餐类型：traffic-不限时流量包，traffic_stack-不限时流量包（可叠加），monthly-月付，daily-日付，
     * weekly-周付，semiannual-半年付，yearly-一年付；
     * 旧数据为 normal（有效天数大于 0 视为日付，否则视为不限时流量包），升级脚本会改为新类型
     */
    private String type;

    /**
     * 购买后分配的用户组ID
     */
    private Long groupId;

    /**
     * 可用流量（GiB，0 为不限流量）
     */
    private Long traffic;

    /**
     * 时长倍数：月付为月数，日付为天数；不限时流量包不使用（为 0）
     */
    private Integer durationDays;

    /**
     * 规则数（0 为不限规则数）
     */
    private Integer maxRules;

    /**
     * 价格（元，0 为免费）
     */
    private BigDecimal price;

    /**
     * 是否在商城隐藏（0-显示，1-隐藏）
     */
    private Integer hidden;

    private Integer sort;

    /**
     * 套餐用户限速（Mbps，0 为不限速；与转发规则限速、管理员指派的限速取较严格值）
     */
    private Integer userSpeedLimit;

    /**
     * 套餐流量重置日（-1 沿用用户当前的重置设置，0 不重置，1-31 每月第几日重置）；
     * 用户购买/续费该套餐时，非 -1 的值会写入用户的流量重置日
     */
    private Long flowResetTime;

    /**
     * 套餐流量重置时刻（HH:mm，默认 00:00），与 flowResetTime 配合使用
     */
    private String flowResetClock;

    /** 实际生效的类型：兼容旧的 normal / 空值 */
    public String effectiveType() {
        if (TYPES.contains(type)) {
            return type;
        }
        return durationDays != null && durationDays > 0 ? TYPE_DAILY : TYPE_TRAFFIC;
    }

    /**
     * 购买后用户的新到期时间；可叠加流量包不修改到期时间，返回 null
     *
     * @param baseExpTime 顺延起点：当前到期时间与现在中较晚的一个
     */
    public Long computeExpTime(long baseExpTime) {
        String t = effectiveType();
        int n = durationDays == null ? 0 : durationDays;
        if (TYPE_TRAFFIC_STACK.equals(t)) {
            return null;
        }
        // 月付 / 半年付 / 一年付按自然月顺延；月末日期自动落到目标月最后一天（如 1/31 + 1 个月 = 2/28 或 2/29）
        int months = TYPE_MONTHLY.equals(t) ? n : TYPE_SEMIANNUAL.equals(t) ? n * 6 : TYPE_YEARLY.equals(t) ? n * 12 : 0;
        if (months > 0) {
            return Instant.ofEpochMilli(baseExpTime).atZone(ZoneId.systemDefault()).plusMonths(months).toInstant().toEpochMilli();
        }
        int days = TYPE_DAILY.equals(t) ? n : TYPE_WEEKLY.equals(t) ? n * 7 : 0;
        if (days > 0) {
            return baseExpTime + days * 24L * 60L * 60L * 1000L;
        }
        return PERMANENT_EXP_TIME;
    }
}
