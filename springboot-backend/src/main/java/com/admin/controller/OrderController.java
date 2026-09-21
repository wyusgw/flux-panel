package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.lang.R;
import com.admin.service.OrderService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

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
}
