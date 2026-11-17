package com.admin.common.utils;

import com.admin.entity.DeviceGroup;
import com.admin.entity.DeviceGroupChainHop;
import com.admin.entity.NodeGroupRelation;
import com.admin.entity.User;
import com.admin.entity.UserGroup;
import com.admin.mapper.DeviceGroupChainHopMapper;
import com.admin.mapper.DeviceGroupMapper;
import com.admin.mapper.NodeGroupRelationMapper;
import com.admin.mapper.UserGroupMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class NodeGroupScopeTest {

    private NodeGroupScope scope;
    private UserGroupMapper userGroups;
    private NodeGroupRelationMapper relations;
    private DeviceGroupMapper deviceGroups;
    private DeviceGroupChainHopMapper hops;
    private final List<NodeGroupRelation> relationRows = new ArrayList<>();
    private final List<DeviceGroupChainHop> hopRows = new ArrayList<>();

    @BeforeEach
    void setUp() {
        scope = new NodeGroupScope();
        userGroups = mock(UserGroupMapper.class);
        relations = mock(NodeGroupRelationMapper.class);
        deviceGroups = mock(DeviceGroupMapper.class);
        hops = mock(DeviceGroupChainHopMapper.class);
        ReflectionTestUtils.setField(scope, "userGroupMapper", userGroups);
        ReflectionTestUtils.setField(scope, "nodeGroupRelationMapper", relations);
        ReflectionTestUtils.setField(scope, "deviceGroupMapper", deviceGroups);
        ReflectionTestUtils.setField(scope, "chainHopMapper", hops);
        when(relations.selectList(any())).thenReturn(relationRows);
        when(hops.selectList(any())).thenReturn(hopRows);
        // 节点 10 属于节点组 1，节点 20 属于节点组 2，节点 30 不属于任何节点组
        relation(10L, 1L);
        relation(20L, 2L);
    }

    private void relation(Long nodeId, Long nodeGroupId) {
        NodeGroupRelation r = new NodeGroupRelation();
        r.setNodeId(nodeId);
        r.setNodeGroupId(nodeGroupId);
        relationRows.add(r);
    }

    private DeviceGroup group(Long id, String direction, Long nodeId) {
        DeviceGroup g = new DeviceGroup();
        g.setId(id);
        g.setDirection(direction);
        g.setNodeId(nodeId);
        when(deviceGroups.selectById(id)).thenReturn(g);
        return g;
    }

    private User userInGroup(Long groupId, String nodeGroupIds) {
        UserGroup ug = new UserGroup();
        ug.setId(groupId);
        ug.setNodeGroupIds(nodeGroupIds);
        when(userGroups.selectById(groupId)).thenReturn(ug);
        User user = new User();
        user.setGroupId(groupId);
        return user;
    }

    @Test
    void idsRoundTripAndEmptyMeansUnlimited() {
        assertEquals("1,3", NodeGroupScope.joinIds(Arrays.asList(1L, 3L, 1L, 0L, null)));
        assertEquals("", NodeGroupScope.joinIds(Collections.emptyList()));
        assertEquals("", NodeGroupScope.joinIds(null));
        assertEquals(new HashSet<>(Arrays.asList(1L, 3L)), NodeGroupScope.parseIds(" 1, x,3,,-2"));
        assertTrue(NodeGroupScope.parseIds(null).isEmpty());

        assertNull(scope.allowedNodeGroups(userInGroup(5L, "")));
        assertNull(scope.allowedNodeGroups(userInGroup(6L, null)));
        assertNull(scope.allowedNodeGroups(new User()));
        assertEquals(Collections.singleton(1L), scope.allowedNodeGroups(userInGroup(7L, "1")));
    }

    @Test
    void onlyDevicesOnAllowedNodeGroupsPass() {
        Set<Long> allowed = Collections.singleton(1L);
        assertTrue(scope.groupAllowed(group(100L, "outbound", 10L), allowed));
        assertFalse(scope.groupAllowed(group(101L, "outbound", 20L), allowed));
        // 不属于任何节点组、没绑定设备的设备组在设置了限制时都不能用
        assertFalse(scope.groupAllowed(group(102L, "inbound", 30L), allowed));
        assertFalse(scope.groupAllowed(group(103L, "inbound", null), allowed));
        // 不限制时都能用
        assertTrue(scope.groupAllowed(group(104L, "inbound", 30L), null));
    }

    @Test
    void chainExitNeedsEveryHopInsideTheAllowedNodeGroups() {
        group(200L, "outbound", 10L);
        group(201L, "outbound", 20L);
        DeviceGroup chain = group(300L, "chain", null);
        DeviceGroupChainHop first = new DeviceGroupChainHop();
        first.setTargetDeviceGroupId(200L);
        DeviceGroupChainHop second = new DeviceGroupChainHop();
        second.setTargetDeviceGroupId(201L);
        hopRows.add(first);
        hopRows.add(second);

        assertFalse(scope.groupAllowed(chain, Collections.singleton(1L)));
        assertTrue(scope.groupAllowed(chain, new HashSet<>(Arrays.asList(1L, 2L))));
    }

    @Test
    void nodeCheckUsesThePreloadedMembership() {
        Map<Long, Set<Long>> membership = new HashMap<>();
        membership.put(10L, new HashSet<>(Arrays.asList(1L, 4L)));
        assertTrue(NodeGroupScope.nodeAllowed(10L, Collections.singleton(4L), membership));
        assertFalse(NodeGroupScope.nodeAllowed(10L, Collections.singleton(9L), membership));
        assertFalse(NodeGroupScope.nodeAllowed(null, Collections.singleton(9L), membership));
        assertTrue(NodeGroupScope.nodeAllowed(null, null, membership));
    }
}
