package com.admin.service.impl;

import com.admin.common.dto.NodeGroupDto;
import com.admin.common.dto.UserGroupDto;
import com.admin.entity.NodeGroup;
import com.admin.entity.UserGroup;
import com.admin.mapper.NodeGroupMapper;
import com.admin.mapper.UserGroupMapper;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.session.defaults.DefaultSqlSession;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/** 添加用户组、节点组时可以自定义 ID，且必须是正数、不能重复；不传时自动生成 */
class GroupCustomIdTest {

    private UserGroupServiceImpl userGroups;
    private NodeGroupServiceImpl nodeGroups;

    @BeforeEach
    void setUp() throws Exception {
        DataSource ds = new DriverManagerDataSource("jdbc:h2:mem:groupid" + System.nanoTime() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        try (Connection c = ds.getConnection(); Statement s = c.createStatement()) {
            for (String table : new String[]{"user_group", "node_group"}) {
                s.execute("CREATE TABLE " + table + " (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), sort INT, created_time BIGINT, updated_time BIGINT, status INT)");
            }
        }
        MybatisConfiguration cfg = new MybatisConfiguration();
        cfg.setEnvironment(new Environment("t", new JdbcTransactionFactory(), ds));
        cfg.addMapper(UserGroupMapper.class);
        cfg.addMapper(NodeGroupMapper.class);
        GlobalConfig global = GlobalConfigUtils.defaults();
        GlobalConfigUtils.setGlobalConfig(cfg, global);
        MybatisSqlSessionFactoryBean bean = new MybatisSqlSessionFactoryBean();
        bean.setDataSource(ds);
        bean.setConfiguration(cfg);
        bean.setGlobalConfig(global);
        SqlSessionFactory factory = bean.getObject();
        SqlSession session = new org.mybatis.spring.SqlSessionTemplate(factory);

        userGroups = new UserGroupServiceImpl();
        ReflectionTestUtils.setField(userGroups, "baseMapper", session.getMapper(UserGroupMapper.class));
        nodeGroups = new NodeGroupServiceImpl();
        ReflectionTestUtils.setField(nodeGroups, "baseMapper", session.getMapper(NodeGroupMapper.class));
    }

    private static UserGroupDto user(Long id, String name) {
        UserGroupDto dto = new UserGroupDto();
        dto.setId(id);
        dto.setName(name);
        return dto;
    }

    private static NodeGroupDto node(Long id, String name) {
        NodeGroupDto dto = new NodeGroupDto();
        dto.setId(id);
        dto.setName(name);
        return dto;
    }

    @Test
    void userGroupUsesTheGivenId() {
        assertEquals(0, userGroups.createUserGroup(user(500L, "a")).getCode());
        UserGroup saved = userGroups.getById(500L);
        assertNotNull(saved);
        assertEquals("a", saved.getName());
    }

    @Test
    void userGroupIdIsGeneratedWhenOmitted() {
        assertEquals(0, userGroups.createUserGroup(user(null, "auto")).getCode());
        assertEquals(1, userGroups.list().size());
    }

    @Test
    void userGroupRejectsDuplicateAndNonPositiveIds() {
        assertEquals(0, userGroups.createUserGroup(user(7L, "a")).getCode());
        assertEquals(-1, userGroups.createUserGroup(user(7L, "b")).getCode());
        assertEquals(-1, userGroups.createUserGroup(user(0L, "c")).getCode());
        assertEquals(-1, userGroups.createUserGroup(user(-3L, "d")).getCode());
        assertEquals(1, userGroups.list().size());
    }

    @Test
    void nodeGroupUsesTheGivenIdAndRejectsDuplicates() {
        assertEquals(0, nodeGroups.createNodeGroup(node(900L, "a")).getCode());
        NodeGroup saved = nodeGroups.getById(900L);
        assertNotNull(saved);
        assertEquals(-1, nodeGroups.createNodeGroup(node(900L, "b")).getCode());
        assertEquals(0, nodeGroups.createNodeGroup(node(null, "auto")).getCode());
        assertEquals(2, nodeGroups.list().size());
    }
}
