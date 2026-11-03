package com.admin.service;

import com.admin.common.dto.ForwardDto;
import com.admin.common.dto.ForwardUpdateDto;
import com.admin.common.lang.R;
import com.admin.entity.Forward;
import com.baomidou.mybatisplus.extension.service.IService;
import java.util.Map;

/**
 * <p>
 *  服务类
 * </p>
 *
 * @author QAQ
 * @since 2025-06-03
 */
public interface ForwardService extends IService<Forward> {

    /**
     * 创建端口转发
     * @param forwardDto 转发数据
     * @return 结果
     */
    R createForward(ForwardDto forwardDto);

    /**
     * 获取端口转发列表
     * @return 结果
     */
    R getAllForwards();

    /**
     * 更新端口转发
     * @param forwardUpdateDto 更新数据
     * @return 结果
     */
    R updateForward(ForwardUpdateDto forwardUpdateDto);

    /**
     * 删除端口转发
     * @param id 转发ID
     * @return 结果
     */
    R deleteForward(Long id);

    /**
     * 强制删除端口转发
     * 跳过GOST节点验证，直接删除数据库记录
     * @param id 转发ID
     * @return 结果
     */
    R forceDeleteForward(Long id);

    /**
     * 暂停转发服务
     * @param id 转发ID
     * @return 结果
     */
    R pauseForward(Long id);

    /**
     * 恢复转发服务
     * @param id 转发ID
     * @return 结果
     */
    R resumeForward(Long id);

    /**
     * 转发诊断功能
     * @param id 转发ID
     * @return 诊断结果
     */
    R diagnoseForward(Long id);

    /** 诊断详情：只对某一段重新测试，按「诊断详情连接次数」执行 */
    R diagnoseForwardDetail(Long id, String leg, String targetIp, Integer targetPort);

    /**
     * 更新转发排序
     * @param params 包含forwards数组的参数
     * @return 更新结果
     */
    R updateForwardOrder(Map<String, Object> params);


    void updateForwardA(Forward forward);

    /**
     * 用户的套餐变化（换套餐、套餐限速被修改）后，把这些用户名下正在运行的转发规则的限速重新下发到入口节点，
     * 让新的套餐限速立刻生效，不必逐条规则手动保存。
     * 在事务提交之后异步执行（调用方处于事务中时等提交完成再刷新，避免读到旧的套餐），不阻塞调用方，失败只记日志。
     */
    void refreshLimitsAfterCommit(java.util.Collection<Integer> userIds);

    /**
     * 重新推送一条转发规则的 gost 配置（用于节点离线补推队列的重试）。
     * 与 {@link #updateForwardA} 不同的是这里会返回推送结果，供队列判断是否重试成功。
     * @param forwardId 转发ID
     * @return 结果（code=0 表示推送成功）
     */
    R retrySyncForward(Long forwardId);
}
