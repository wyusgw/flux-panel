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
  `tunnel_id` int(10) NOT NULL,
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
  `node_id` bigint(20) NOT NULL,
  `direction` varchar(20) NOT NULL DEFAULT 'inbound',
  `user_group_id` bigint(20) DEFAULT NULL,
  `ratio` decimal(10,2) NOT NULL DEFAULT '1.00',
  `hide_in_probe` int(10) NOT NULL DEFAULT '0',
  `remark` varchar(500) DEFAULT NULL,
  `sort` int(10) NOT NULL DEFAULT '0',
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL DEFAULT '1'
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
  `status` int(10) NOT NULL
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
  `exp_time` bigint(20) NOT NULL,
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
  `package_id` bigint(20) NOT NULL,
  `discount_ratio` int(10) NOT NULL DEFAULT '100',
  `uses_remaining` int(10) NOT NULL DEFAULT '1',
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL DEFAULT '1'
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
  `num` int(10) NOT NULL,
  `flow` bigint(20) NOT NULL,
  `in_flow` bigint(20) NOT NULL DEFAULT '0',
  `out_flow` bigint(20) NOT NULL DEFAULT '0',
  `flow_reset_time` bigint(20) NOT NULL,
  `exp_time` bigint(20) NOT NULL,
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
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
