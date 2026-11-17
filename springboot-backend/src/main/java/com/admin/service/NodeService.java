package com.admin.service;

import com.admin.common.dto.NodeDto;
import com.admin.common.dto.NodeUpdateDto;
import com.admin.common.lang.R;
import com.admin.entity.Node;
import com.baomidou.mybatisplus.extension.service.IService;

/**
 * <p>
 *  服务类
 * </p>
 *
 * @author QAQ
 * @since 2025-06-03
 */
public interface NodeService extends IService<Node> {

    R createNode(NodeDto nodeDto);

    R getAllNodes();

    /** 普通用户能看到的节点ID，与节点列表接口的范围一致 */
    java.util.Set<Long> getVisibleNodeIds(Integer userId);

    /** 节点状态页的 IPv4 / IPv6 地区：当前账号能看到的节点，每项为 {id, v4, v6}（两位国家代码，小写，查不到为空） */
    R getNodeRegions();

    R updateNode(NodeUpdateDto nodeUpdateDto);

    R deleteNode(Long id);

    Node getNodeById(Long id);

    R getInstallCommand(Long id);

    /**
     * 查询节点配置：节点信息、所属设备组和用到这些设备组的转发规则，不含节点密钥
     */
    R getNodeConfig(Long id);

    R resetSecret(Long id);

}
