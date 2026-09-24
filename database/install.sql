-- phpMyAdmin SQL Dump
-- version 5.2.0
-- https://www.phpmyadmin.net/
--
-- 主机： localhost
-- 生成日期： 2025-08-14 21:52:52
-- 服务器版本： 5.7.40-log
-- PHP 版本： 7.4.33

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- 数据库： `gost`
--

-- --------------------------------------------------------

--
-- 表的结构 `forward`
--

CREATE TABLE `forward` (
  `id` int(10) NOT NULL,
  `user_id` int(10) NOT NULL,
  `user_name` varchar(100) NOT NULL,
  `name` varchar(100) NOT NULL,
  `tunnel_id` int(10) DEFAULT NULL,
  `in_port` int(10) NOT NULL,
  `out_port` int(10) DEFAULT NULL,
  `remote_addr` longtext NOT NULL,
  `strategy` varchar(100) NOT NULL DEFAULT 'fifo',
  `interface_name` varchar(200) DEFAULT NULL,
  `in_flow` bigint(20) NOT NULL DEFAULT '0',
  `out_flow` bigint(20) NOT NULL DEFAULT '0',
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) NOT NULL,
  `status` int(10) NOT NULL,
  `inx` int(10) NOT NULL DEFAULT '0',
  `group_id` bigint(20) DEFAULT NULL,
  `accept_proxy_protocol` int(10) NOT NULL DEFAULT '0',
  `send_proxy_protocol` int(10) NOT NULL DEFAULT '0',
  `ip_limit` int(10) NOT NULL DEFAULT '0',
  `conn_limit` int(10) NOT NULL DEFAULT '0',
  `in_device_group_id` bigint(20) DEFAULT NULL,
  `out_device_group_id` bigint(20) DEFAULT NULL,
  `speed_limit` int(11) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `device_group`
--

CREATE TABLE `device_group` (
  `id` int(10) NOT NULL,
  `name` varchar(200) NOT NULL,
  `node_id` bigint(20) DEFAULT NULL COMMENT '链式出口设备组（direction=chain）没有自己的物理节点，此字段为空',
  `direction` varchar(20) NOT NULL DEFAULT 'inbound',
  `protocol` varchar(20) NOT NULL DEFAULT 'tls' COMMENT '出口协议类型（TLS/WSS/TCP/MTLS/MWSS/MTCP），仅出口/入口＋出口设备组用到',
  `user_group_id` bigint(20) DEFAULT NULL,
  `owner_user_id` bigint(20) DEFAULT NULL COMMENT '单端隧道用户自建设备组的拥有者用户ID；管理员建立的设备组此字段为空',
  `single_tunnel_group_id` int(10) DEFAULT NULL COMMENT '单端隧道设备所属的单端组ID（用户自建设备时选择），管理员建立的设备组此字段为空',
  `shared` tinyint(1) NOT NULL DEFAULT '0' COMMENT '仅 owner_user_id 非空时有意义：0-仅拥有者自己可用，1-开放给所有用户在添加转发规则时选用',
  `ratio` decimal(10,2) NOT NULL DEFAULT '1.00',
  `hide_in_probe` int(10) NOT NULL DEFAULT '0',
  `remark` varchar(500) DEFAULT NULL,
  `sort` int(10) NOT NULL DEFAULT '0',
  `offline_grace_enabled` tinyint(1) DEFAULT NULL,
  `offline_grace_seconds` int(10) DEFAULT NULL,
  `offline_retain_enabled` tinyint(1) DEFAULT NULL,
  `offline_retain_seconds` int(10) DEFAULT NULL,
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `device_group_chain_hop`：链式出口设备组（direction='chain'）的多跳配置，
-- 每一跳复用一个已存在的出口（direction='outbound'）设备组作为中继节点
--

CREATE TABLE `device_group_chain_hop` (
  `id` int(10) NOT NULL,
  `device_group_id` bigint(20) NOT NULL,
  `hop_order` int(10) NOT NULL,
  `target_device_group_id` bigint(20) NOT NULL,
  `mux` tinyint(1) NOT NULL DEFAULT '0',
  `created_time` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `user_daily_raw_flow`：用户按自然日累计的原始流量（不计设备组流量倍率），
-- 供"我的转发规则"页「统计数据」弹窗的今日/昨日流量展示使用
--

CREATE TABLE `user_daily_raw_flow` (
  `id` int(10) NOT NULL,
  `user_id` int(10) NOT NULL,
  `day` varchar(10) NOT NULL,
  `raw_bytes` bigint(20) NOT NULL DEFAULT '0',
  `updated_time` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `forward_group`
--

CREATE TABLE `forward_group` (
  `id` int(10) NOT NULL,
  `user_id` int(10) DEFAULT NULL,
  `name` varchar(200) NOT NULL,
  `sort` int(10) NOT NULL DEFAULT '0',
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `node`
--

CREATE TABLE `node` (
  `id` int(10) NOT NULL,
  `name` varchar(100) NOT NULL,
  `secret` varchar(100) NOT NULL,
  `ip` longtext,
  `server_ip` varchar(100) NOT NULL,
  `port_sta` int(10) NOT NULL,
  `port_end` int(10) NOT NULL,
  `version` varchar(100) DEFAULT NULL,
  `http` int(10) NOT NULL DEFAULT '0',
  `tls` int(10) NOT NULL DEFAULT '0',
  `socks` int(10) NOT NULL DEFAULT '0',
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `speed_limit`
--

CREATE TABLE `speed_limit` (
  `id` int(10) NOT NULL,
  `name` varchar(100) NOT NULL,
  `speed` int(10) NOT NULL,
  `tunnel_id` int(10) NOT NULL,
  `tunnel_name` varchar(100) NOT NULL,
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `statistics_flow`
--

CREATE TABLE `statistics_flow` (
  `id` int(10) NOT NULL,
  `user_id` int(10) NOT NULL,
  `flow` bigint(20) NOT NULL,
  `total_flow` bigint(20) NOT NULL,
  `time` varchar(100) NOT NULL,
  `created_time` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `tunnel`
--

CREATE TABLE `tunnel` (
  `id` int(10) NOT NULL,
  `name` varchar(100) NOT NULL,
  `traffic_ratio` decimal(10,1) NOT NULL DEFAULT '1.0',
  `in_node_id` int(10) NOT NULL,
  `in_ip` varchar(100) NOT NULL,
  `out_node_id` int(10) NOT NULL,
  `out_ip` varchar(100) NOT NULL,
  `type` int(10) NOT NULL,
  `protocol` varchar(10) NOT NULL DEFAULT 'tls',
  `flow` int(10) NOT NULL,
  `tcp_listen_addr` varchar(100) NOT NULL DEFAULT '[::]',
  `udp_listen_addr` varchar(100) NOT NULL DEFAULT '[::]',
  `interface_name` varchar(200) DEFAULT NULL,
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) NOT NULL,
  `status` int(10) NOT NULL,
  `is_auto` int(10) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `user`
--

CREATE TABLE `user` (
  `id` int(10) NOT NULL,
  `user` varchar(100) NOT NULL,
  `pwd` varchar(100) NOT NULL,
  `role_id` int(10) NOT NULL,
  `exp_time` bigint(20) DEFAULT NULL,
  `flow` bigint(20) NOT NULL,
  `in_flow` bigint(20) NOT NULL DEFAULT '0',
  `out_flow` bigint(20) NOT NULL DEFAULT '0',
  `flow_reset_time` bigint(20) NOT NULL,
  `num` int(10) NOT NULL,
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL,
  `group_id` bigint(20) DEFAULT NULL,
  `package_id` bigint(20) DEFAULT NULL,
  `wallet_balance` decimal(10,2) NOT NULL DEFAULT '0.00',
  `auto_renew` int(10) NOT NULL DEFAULT '0',
  `telegram_chat_id` varchar(64) DEFAULT NULL,
  `telegram_bind_code` varchar(16) DEFAULT NULL,
  `telegram_bind_time` bigint(20) DEFAULT NULL,
  `notify_payment_mode` tinyint(4) NOT NULL DEFAULT '0',
  `notify_device_mode` tinyint(4) NOT NULL DEFAULT '0',
  `notify_device_groups` varchar(500) DEFAULT NULL,
  `telegram_last_reminder_date` varchar(10) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- 转存表中的数据 `user`
--

INSERT INTO `user` (`id`, `user`, `pwd`, `role_id`, `exp_time`, `flow`, `in_flow`, `out_flow`, `flow_reset_time`, `num`, `created_time`, `updated_time`, `status`) VALUES
(1, 'admin_user', '3c85cdebade1c51cf64ca9f3c09d182d', 0, 2727251700000, 99999, 0, 0, 1, 99999, 1748914865000, 1754011744252, 1);

-- --------------------------------------------------------

--
-- 表的结构 `user_group`
--

CREATE TABLE `user_group` (
  `id` int(10) NOT NULL,
  `name` varchar(200) DEFAULT NULL,
  `sort` int(10) NOT NULL DEFAULT '0',
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `single_tunnel_group`
-- 单端组：普通用户自己建立、用来给自己的单端隧道设备分组分类，每个用户只能看到/管理自己建立的单端组
--

CREATE TABLE `single_tunnel_group` (
  `id` int(10) NOT NULL,
  `name` varchar(200) DEFAULT NULL,
  `owner_user_id` bigint(20) DEFAULT NULL COMMENT '拥有者用户ID，该单端组只属于这个用户',
  `sort` int(10) NOT NULL DEFAULT '0',
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `package_plan`
--

CREATE TABLE `package_plan` (
  `id` int(10) NOT NULL,
  `name` varchar(200) NOT NULL,
  `type` varchar(50) NOT NULL DEFAULT 'normal',
  `group_id` bigint(20) NOT NULL,
  `traffic` bigint(20) NOT NULL DEFAULT '0',
  `duration_days` int(10) NOT NULL DEFAULT '0',
  `max_rules` int(10) NOT NULL DEFAULT '0',
  `price` decimal(10,2) NOT NULL DEFAULT '0.00',
  `hidden` int(10) NOT NULL DEFAULT '0',
  `sort` int(10) NOT NULL DEFAULT '0',
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL DEFAULT '1',
  `user_speed_limit` int(11) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `orders`
--

CREATE TABLE `orders` (
  `id` int(10) NOT NULL,
  `order_no` varchar(64) NOT NULL,
  `user_id` int(10) NOT NULL,
  `user_name` varchar(100) DEFAULT NULL,
  `type` varchar(50) NOT NULL DEFAULT 'package',
  `package_id` bigint(20) DEFAULT NULL,
  `redeem_code` varchar(100) DEFAULT NULL,
  `channel_id` varchar(64) DEFAULT NULL,
  `trade_no` varchar(64) DEFAULT NULL,
  `info` varchar(500) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `order_status` int(10) NOT NULL DEFAULT '1',
  `paid_time` bigint(20) DEFAULT NULL,
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `redeem_code`
--

CREATE TABLE `redeem_code` (
  `id` int(10) NOT NULL,
  `code` varchar(100) NOT NULL,
  `type` varchar(20) NOT NULL DEFAULT 'discount',
  `package_id` bigint(20) DEFAULT NULL,
  `discount_ratio` int(10) NOT NULL DEFAULT '100',
  `amount` decimal(10,2) DEFAULT NULL,
  `uses_remaining` int(10) NOT NULL DEFAULT '1',
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `invite_code`
--

CREATE TABLE `invite_code` (
  `id` int(10) NOT NULL,
  `code` varchar(100) NOT NULL,
  `uses_remaining` int(10) NOT NULL DEFAULT '1',
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `task_queue`
-- 通用异步任务重试队列：任务（如转发同步、Telegram 通知发送）失败时登记在这里，
-- 由对应的 TaskHandler 重试；重试成功后状态转为 SUCCESS 并保留 24 小时供查看（由定时任务清理），
-- 仍失败则累加 retry_count 并记录 last_error，状态保持 PENDING，等待下一次触发（节点上线、定时兜底扫描）再试。
-- payload 为任务自描述的 JSON，dedup_key 配合 task_type 去重（同一任务类型+key 只保留一条记录）
--

CREATE TABLE `task_queue` (
  `id` int(10) NOT NULL,
  `task_type` varchar(50) NOT NULL,
  `dedup_key` varchar(100) DEFAULT NULL,
  `payload` text,
  `status` varchar(20) NOT NULL DEFAULT 'PENDING',
  `retry_count` int(10) NOT NULL DEFAULT '0',
  `last_error` varchar(500) DEFAULT NULL,
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) NOT NULL,
  `completed_time` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `task_queue_node`
-- task_queue 记录与节点的关联表：节点重新上线时，据此找出所有与该节点相关、待重试的任务
--

CREATE TABLE `task_queue_node` (
  `id` int(10) NOT NULL,
  `task_queue_id` bigint(20) NOT NULL,
  `node_id` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `user_tunnel`
--

CREATE TABLE `user_tunnel` (
  `id` int(10) NOT NULL,
  `user_id` int(10) NOT NULL,
  `tunnel_id` int(10) NOT NULL,
  `speed_id` int(10) DEFAULT NULL,
  `num` int(10) DEFAULT NULL,
  `flow` bigint(20) DEFAULT NULL,
  `in_flow` bigint(20) NOT NULL DEFAULT '0',
  `out_flow` bigint(20) NOT NULL DEFAULT '0',
  `flow_reset_time` bigint(20) DEFAULT NULL,
  `exp_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `vite_config`
--

CREATE TABLE `vite_config` (
  `id` int(10) NOT NULL,
  `name` varchar(200) NOT NULL,
  `value` varchar(200) NOT NULL,
  `time` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- 转存表中的数据 `vite_config`
--

INSERT INTO `vite_config` (`id`, `name`, `value`, `time`) VALUES
(1, 'app_name', 'flux', 1755147963000);

--
-- 转储表的索引
--

--
-- 表的索引 `forward`
--
ALTER TABLE `forward`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `device_group`
--
ALTER TABLE `device_group`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `device_group_chain_hop`
--
ALTER TABLE `device_group_chain_hop`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_device_group_id` (`device_group_id`);

--
-- 表的索引 `user_daily_raw_flow`
--
ALTER TABLE `user_daily_raw_flow`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_user_day` (`user_id`,`day`);

--
-- 表的索引 `node`
--
ALTER TABLE `node`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `speed_limit`
--
ALTER TABLE `speed_limit`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `statistics_flow`
--
ALTER TABLE `statistics_flow`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `tunnel`
--
ALTER TABLE `tunnel`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `user`
--
ALTER TABLE `user`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `user_tunnel`
--
ALTER TABLE `user_tunnel`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `vite_config`
--
ALTER TABLE `vite_config`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- 表的索引 `user_group`
--
ALTER TABLE `user_group`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `single_tunnel_group`
--
ALTER TABLE `single_tunnel_group`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_single_tunnel_group_owner` (`owner_user_id`);

--
-- 表的索引 `package_plan`
--
ALTER TABLE `package_plan`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `forward_group`
--
ALTER TABLE `forward_group`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_order_no` (`order_no`);

--
-- 表的索引 `redeem_code`
--
ALTER TABLE `redeem_code`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_redeem_code` (`code`);

--
-- 表的索引 `invite_code`
--
ALTER TABLE `invite_code`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_invite_code` (`code`);

--
-- 表的索引 `task_queue`
--
ALTER TABLE `task_queue`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_task_queue_type_dedup` (`task_type`,`dedup_key`),
  ADD KEY `idx_task_queue_status` (`status`,`completed_time`);

--
-- 表的索引 `task_queue_node`
--
ALTER TABLE `task_queue_node`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_task_queue_node_task` (`task_queue_id`),
  ADD KEY `idx_task_queue_node_node` (`node_id`);

--
-- 在导出的表使用AUTO_INCREMENT
--

--
-- 使用表AUTO_INCREMENT `forward`
--
ALTER TABLE `forward`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

--
-- 使用表AUTO_INCREMENT `device_group`
--
ALTER TABLE `device_group`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

--
-- 使用表AUTO_INCREMENT `device_group_chain_hop`
--
ALTER TABLE `device_group_chain_hop`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

--
-- 使用表AUTO_INCREMENT `user_daily_raw_flow`
--
ALTER TABLE `user_daily_raw_flow`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

--
-- 使用表AUTO_INCREMENT `node`
--
ALTER TABLE `node`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

--
-- 使用表AUTO_INCREMENT `speed_limit`
--
ALTER TABLE `speed_limit`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

--
-- 使用表AUTO_INCREMENT `statistics_flow`
--
ALTER TABLE `statistics_flow`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

--
-- 使用表AUTO_INCREMENT `tunnel`
--
ALTER TABLE `tunnel`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

--
-- 使用表AUTO_INCREMENT `user`
--
ALTER TABLE `user`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

--
-- 使用表AUTO_INCREMENT `user_tunnel`
--
ALTER TABLE `user_tunnel`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

--
-- 使用表AUTO_INCREMENT `vite_config`
--
ALTER TABLE `vite_config`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

--
-- 使用表AUTO_INCREMENT `user_group`
--
ALTER TABLE `user_group`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

--
-- 使用表AUTO_INCREMENT `single_tunnel_group`
--
ALTER TABLE `single_tunnel_group`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

--
-- 使用表AUTO_INCREMENT `package_plan`
--
ALTER TABLE `package_plan`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

--
-- 使用表AUTO_INCREMENT `forward_group`
--
ALTER TABLE `forward_group`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

--
-- 使用表AUTO_INCREMENT `orders`
--
ALTER TABLE `orders`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

--
-- 使用表AUTO_INCREMENT `redeem_code`
--
ALTER TABLE `redeem_code`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

--
-- 使用表AUTO_INCREMENT `invite_code`
--
ALTER TABLE `invite_code`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

--
-- 使用表AUTO_INCREMENT `task_queue`
--
ALTER TABLE `task_queue`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;

--
-- 使用表AUTO_INCREMENT `task_queue_node`
--
ALTER TABLE `task_queue_node`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
