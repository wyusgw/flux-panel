package com.admin.config;

import com.alibaba.fastjson.parser.ParserConfig;
import org.springframework.context.annotation.Configuration;

import javax.annotation.PostConstruct;

/**
 * 关闭 fastjson 的 autoType：节点上报的内容由 fastjson 解析，而普通用户也能拿到自建节点的密钥。
 * safeMode 下带 @type 的内容一律拒绝，项目本身不依赖 autoType。
 */
@Configuration
public class FastjsonSafeModeConfig {

    @PostConstruct
    public void enableSafeMode() {
        ParserConfig.getGlobalInstance().setSafeMode(true);
    }
}
