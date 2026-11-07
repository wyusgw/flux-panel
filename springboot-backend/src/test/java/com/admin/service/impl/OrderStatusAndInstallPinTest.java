package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.Order;
import com.admin.service.RechargeService;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OrderStatusAndInstallPinTest {

    private static final int PENDING = 0;
    private static final int PAID = 1;
    private static final int CANCELLED = 2;

    private OrderServiceImpl orders;
    private RechargeService recharge;

    @BeforeEach
    void setUp() {
        orders = spy(new OrderServiceImpl());
        recharge = mock(RechargeService.class);
        ReflectionTestUtils.setField(orders, "rechargeService", recharge);
    }

    private void order(String type, int status) {
        Order order = new Order();
        order.setId(1L);
        order.setType(type);
        order.setOrderStatus(status);
        doReturn(order).when(orders).getById(1L);
        doReturn(true).when(orders).update(any(Wrapper.class));
    }

    @Test
    void paidRechargeCannotBeReverted() {
        order("recharge", PAID);

        assertNotEquals(0, orders.updateOrderStatus(1L, PENDING).getCode());
        assertNotEquals(0, orders.updateOrderStatus(1L, CANCELLED).getCode());

        verify(orders, never()).update(any(Wrapper.class));
    }

    @Test
    void pendingRechargeMarkedPaidGoesThroughTheCreditPath() {
        order("recharge", PENDING);
        when(recharge.markOrderPaidManually(1L)).thenReturn(R.ok());

        assertEquals(0, orders.updateOrderStatus(1L, PAID).getCode());

        verify(recharge).markOrderPaidManually(1L);
        verify(orders, never()).update(any(Wrapper.class));
    }

    @Test
    void cancelledRechargeCannotJumpToPaidWithoutCredit() {
        order("recharge", CANCELLED);

        assertNotEquals(0, orders.updateOrderStatus(1L, PAID).getCode());

        verify(orders, never()).update(any(Wrapper.class));
        verify(recharge, never()).markOrderPaidManually(1L);
    }

    @Test
    void pendingAndCancelledRechargeCanSwitchBetweenEachOther() {
        order("recharge", PENDING);
        assertEquals(0, orders.updateOrderStatus(1L, CANCELLED).getCode());
        order("recharge", CANCELLED);
        assertEquals(0, orders.updateOrderStatus(1L, PENDING).getCode());
    }

    @Test
    void packageOrdersKeepExistingBehaviour() {
        order("package", PAID);
        assertEquals(0, orders.updateOrderStatus(1L, CANCELLED).getCode());
    }

    @Test
    void lostRaceReportsThatTheStatusChanged() {
        order("recharge", PENDING);
        doReturn(false).when(orders).update(any(Wrapper.class));

        assertEquals("订单状态已变化，请刷新后重试", orders.updateOrderStatus(1L, CANCELLED).getMsg());
    }

    @Test
    void telegramBindCodeIsLongAndFitsTheColumn() {
        Set<String> codes = new HashSet<>();
        for (int i = 0; i < 1000; i++) {
            String code = UserServiceImpl.generateTelegramBindCode();
            assertTrue(code.matches("[0-9a-f]{16}"), code);
            codes.add(code);
        }
        assertEquals(1000, codes.size());
    }

    @Test
    void installPinRejectsAnythingThatCouldBreakTheShellCommand() {
        String sha = "a".repeat(64);
        assertTrue(NodeServiceImpl.isValidInstallPin("1.4.4", sha));
        assertFalse(NodeServiceImpl.isValidInstallPin("", sha));
        assertFalse(NodeServiceImpl.isValidInstallPin(null, sha));
        assertFalse(NodeServiceImpl.isValidInstallPin("1.4.4; rm -rf /", sha));
        assertFalse(NodeServiceImpl.isValidInstallPin("1.4.4", ""));
        assertFalse(NodeServiceImpl.isValidInstallPin("1.4.4", "A".repeat(64)));
        assertFalse(NodeServiceImpl.isValidInstallPin("1.4.4", sha + "\"; id; \""));
    }
}
