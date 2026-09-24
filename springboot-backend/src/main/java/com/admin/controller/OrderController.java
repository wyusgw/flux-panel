package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.annotation.RequireRole;
import com.admin.common.lang.R;
import com.admin.service.OrderService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * <p>
 * 订单前端控制器
 * </p>
 *
 * @author QAQ
 * @since 2026-09-21
 */
@RestController
@RequestMapping("/api/v1/order")
@CrossOrigin
public class OrderController extends BaseController {

    @Autowired
    private OrderService orderService;

    @LogAnnotation
    @PostMapping("/purchase")
    public R purchase(@RequestBody Map<String, Object> params) {
        Long packageId = Long.valueOf(params.get("packageId").toString());
        Object redeemCodeObj = params.get("redeemCode");
        String redeemCode = redeemCodeObj != null ? redeemCodeObj.toString() : null;
        return orderService.purchasePackage(packageId, redeemCode);
    }

    @LogAnnotation
    @PostMapping("/redeem")
    public R redeem(@RequestBody Map<String, Object> params) {
        Object codeObj = params.get("redeemCode");
        String redeemCode = codeObj != null ? codeObj.toString() : null;
        return orderService.redeemCode(redeemCode);
    }

    @LogAnnotation
    @PostMapping("/list")
    public R list() {
        return orderService.getOrders();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/admin/list")
    public R adminList() {
        return orderService.getAllOrdersForAdmin();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/manual-create")
    public R manualCreate(@RequestBody Map<String, Object> params) {
        return orderService.manualCreateOrder(params);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/update-status")
    public R updateStatus(@RequestBody Map<String, Object> params) {
        Long id = Long.valueOf(params.get("id").toString());
        Integer orderStatus = Integer.valueOf(params.get("orderStatus").toString());
        return orderService.updateOrderStatus(id, orderStatus);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/batch-delete")
    public R batchDelete(@RequestBody Map<String, Object> params) {
        @SuppressWarnings("unchecked")
        List<Object> rawIds = (List<Object>) params.get("ids");
        List<Long> ids = rawIds == null ? null : rawIds.stream().map(id -> Long.valueOf(id.toString())).collect(java.util.stream.Collectors.toList());
        return orderService.batchDeleteOrders(ids);
    }
}
