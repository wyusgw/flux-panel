package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.TaskQueue;
import com.admin.service.TaskErrorLogService;
import com.admin.service.TaskHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TaskQueueStaleExecuteTest {

    private TaskQueueServiceImpl service;
    private TaskHandler handler;

    @BeforeEach
    void setUp() {
        service = spy(new TaskQueueServiceImpl());
        handler = mock(TaskHandler.class);
        when(handler.handle(any())).thenReturn(R.ok());
        ReflectionTestUtils.setField(service, "handlerMap", Collections.singletonMap("ORDER_PURCHASE", handler));
        ReflectionTestUtils.setField(service, "taskErrorLogService", mock(TaskErrorLogService.class));
        doReturn(true).when(service).update(any());
    }

    private TaskQueue item(String status, int retryCount) {
        TaskQueue item = new TaskQueue();
        item.setId(9L);
        item.setTaskType("ORDER_PURCHASE");
        item.setStatus(status);
        item.setRetryCount(retryCount);
        return item;
    }

    private R execute(TaskQueue snapshot, TaskQueue latest) {
        doReturn(latest).when(service).getById(9L);
        return ReflectionTestUtils.invokeMethod(service, "execute", snapshot);
    }

    @Test
    void taskCompletedWhileWaitingIsNotExecutedAgain() {
        assertEquals(0, execute(item("PENDING", 0), item("SUCCESS", 0)).getCode());

        verify(handler, never()).handle(any());
    }

    @Test
    void taskThatFailedWhileWaitingIsNotExecutedAgain() {
        // 失败的购买不重试，状态仍是 PENDING：不能因为用户后来充了钱就替他买
        execute(item("PENDING", 0), item("PENDING", 20));

        verify(handler, never()).handle(any());
    }

    @Test
    void deletedTaskIsSkipped() {
        execute(item("PENDING", 0), null);

        verify(handler, never()).handle(any());
    }

    @Test
    void unchangedTaskRunsNormally() {
        execute(item("PENDING", 0), item("PENDING", 0));

        verify(handler).handle(any());
    }

    @Test
    void manualRetryOfExhaustedTaskStillRuns() {
        TaskQueue exhausted = item("PENDING", 20);
        doReturn(exhausted).when(service).getById(9L);

        assertEquals(0, service.retryOne(9L).getCode());

        verify(handler).handle(any());
    }
}
