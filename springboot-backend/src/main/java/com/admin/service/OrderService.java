package com.admin.service;

import com.admin.common.lang.R;
import com.admin.entity.Order;
import com.admin.entity.User;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.List;
import java.util.Map;

public interface OrderService extends IService<Order> {

    /**
     * 自助购买套餐（使用钱包余额结算）
     * @param packageId 套餐ID
     * @param redeemCode 兑换码（可为空）
     * @return 结果
     */
    R purchasePackage(Long packageId, String redeemCode);

    /**
     * 购买/续费套餐的核心逻辑，不依赖 JWT 上下文（供自动续费等定时任务直接调用）
     * @param user 目标用户（调用方已解析好，不从 JWT 读取）
     * @param packageId 套餐ID
     * @param redeemCode 兑换码（可为空）
     * @return 结果
     */
    R purchasePackageForUser(User user, Long packageId, String redeemCode);

    /**
     * 仅凭兑换码兑换套餐：根据兑换码反查其绑定的套餐后按该套餐结算
     * @param redeemCode 兑换码
     * @return 结果
     */
    R redeemCode(String redeemCode);

    /**
     * 获取当前登录用户自己的订单列表（"我的订单"页专用，无论角色，仅返回本人订单）
     * @return 结果
     */
    R getOrders();

    /**
     * 管理员查看全部用户的订单列表（"订单管理"页专用）
     * @return 结果
     */
    R getAllOrdersForAdmin();

    /**
     * 管理员手动记账：为指定用户创建一条不经过实际支付流程的订单记录（如线下收款、补偿等）
     * @param params 包含 userId、info、amount
     * @return 结果
     */
    R manualCreateOrder(Map<String, Object> params);

    /**
     * 管理员批量删除订单
     * @param ids 订单ID列表
     * @return 结果
     */
    R batchDeleteOrders(List<Long> ids);

    /**
     * 管理员手动更改订单状态（待支付/已完成/已取消）。
     * 若目标订单为充值类型且从"待支付"改为"已完成"，会一并完成钱包加值（与支付网关回调等效）；
     * 其余方向的变更仅更新状态字段，不会自动增减用户余额或回滚已发放的套餐权益。
     * @param id 订单ID
     * @param orderStatus 目标状态（0-待支付，1-已完成，2-已取消）
     * @return 结果
     */
    R updateOrderStatus(Long id, Integer orderStatus);
}
