package com.admin.service;

import com.admin.common.lang.R;
import com.admin.entity.Order;
import com.admin.entity.User;
import com.baomidou.mybatisplus.extension.service.IService;

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
     * 获取订单列表（管理员查看全部，普通用户仅查看自己的）
     * @return 结果
     */
    R getOrders();
}
