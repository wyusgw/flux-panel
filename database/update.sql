-- 資料庫結構升級腳本。
-- 請指定目標資料庫後執行，例如：mysql -u <user> -p <database> < database/update.sql
-- 每項變更都會先檢查目前結構，可重複執行。
-- 数据库结构更新

-- user 表：删除 name 字段（如果存在）
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'user'
        AND column_name = 'name'
    ),
    'ALTER TABLE `user` DROP COLUMN `name`;',
    'SELECT "Column `name` not exists in `user`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- node 表：删除 port 字段、添加 server_ip 字段（如果不存在）
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'node'
        AND column_name = 'port'
    ),
    'ALTER TABLE `node` DROP COLUMN `port`;',
    'SELECT "Column `port` not exists in `node`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'node'
        AND column_name = 'server_ip'
    ),
    'ALTER TABLE `node` ADD COLUMN `server_ip` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;',
    'SELECT "Column `server_ip` already exists in `node`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 将 ip 赋值给 server_ip（如果字段都存在）
UPDATE `node`
SET `server_ip` = `ip`
WHERE `server_ip` IS NULL;

-- node 表：修改 ip 字段类型为 longtext
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'node'
        AND column_name = 'ip'
        AND data_type = 'varchar'
    ),
    'ALTER TABLE `node` MODIFY COLUMN `ip` LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;',
    'SELECT "Column `ip` not exists or already modified in `node`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- node 表：添加 version 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'node'
        AND column_name = 'version'
    ),
    'ALTER TABLE `node` ADD COLUMN `version` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL;',
    'SELECT "Column `version` already exists in `node`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- node 表：添加 port_sta 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'node'
        AND column_name = 'port_sta'
    ),
    'ALTER TABLE `node` ADD COLUMN `port_sta` INT(10) DEFAULT 1000 COMMENT "端口起始范围";',
    'SELECT "Column `port_sta` already exists in `node`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- node 表：添加 port_end 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'node'
        AND column_name = 'port_end'
    ),
    'ALTER TABLE `node` ADD COLUMN `port_end` INT(10) DEFAULT 65535 COMMENT "端口结束范围";',
    'SELECT "Column `port_end` already exists in `node`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 为现有节点设置默认端口范围
UPDATE `node`
SET `port_sta` = 1000, `port_end` = 65535
WHERE `port_sta` IS NULL OR `port_end` IS NULL;

-- node 表：添加 http、tls、socks 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'node'
        AND column_name = 'http'
    ),
    'ALTER TABLE `node` ADD COLUMN `http` INT(10) DEFAULT 0 COMMENT "HTTP 服务端口";',
    'SELECT "Column `http` already exists in `node`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'node'
        AND column_name = 'tls'
    ),
    'ALTER TABLE `node` ADD COLUMN `tls` INT(10) DEFAULT 0 COMMENT "TLS 服务端口";',
    'SELECT "Column `tls` already exists in `node`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'node'
        AND column_name = 'socks'
    ),
    'ALTER TABLE `node` ADD COLUMN `socks` INT(10) DEFAULT 0 COMMENT "SOCKS 服务端口";',
    'SELECT "Column `socks` already exists in `node`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 为现有节点设置 http、tls、socks 默认值
UPDATE `node`
SET `http` = IFNULL(`http`, 0),
    `tls` = IFNULL(`tls`, 0),
    `socks` = IFNULL(`socks`, 0);

-- tunnel 表：删除废弃字段（如果存在）
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'tunnel'
        AND column_name = 'in_port_sta'
    ),
    'ALTER TABLE `tunnel` DROP COLUMN `in_port_sta`;',
    'SELECT "Column `in_port_sta` not exists in `tunnel`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'tunnel'
        AND column_name = 'in_port_end'
    ),
    'ALTER TABLE `tunnel` DROP COLUMN `in_port_end`;',
    'SELECT "Column `in_port_end` not exists in `tunnel`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'tunnel'
        AND column_name = 'out_ip_sta'
    ),
    'ALTER TABLE `tunnel` DROP COLUMN `out_ip_sta`;',
    'SELECT "Column `out_ip_sta` not exists in `tunnel`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'tunnel'
        AND column_name = 'out_ip_end'
    ),
    'ALTER TABLE `tunnel` DROP COLUMN `out_ip_end`;',
    'SELECT "Column `out_ip_end` not exists in `tunnel`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- tunnel 表：添加 tcp_listen_addr、udp_listen_addr、protocol（如果不存在）

-- tcp_listen_addr
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'tunnel'
        AND column_name = 'tcp_listen_addr'
    ),
    'ALTER TABLE `tunnel` ADD COLUMN `tcp_listen_addr` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT "0.0.0.0";',
    'SELECT "Column `tcp_listen_addr` already exists in `tunnel`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- udp_listen_addr
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'tunnel'
        AND column_name = 'udp_listen_addr'
    ),
    'ALTER TABLE `tunnel` ADD COLUMN `udp_listen_addr` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT "0.0.0.0";',
    'SELECT "Column `udp_listen_addr` already exists in `tunnel`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- protocol
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'tunnel'
        AND column_name = 'protocol'
    ),
    'ALTER TABLE `tunnel` ADD COLUMN `protocol` VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT "tls";',
    'SELECT "Column `protocol` already exists in `tunnel`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- traffic_ratio (流量倍率)
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'tunnel'
        AND column_name = 'traffic_ratio'
    ),
    'ALTER TABLE `tunnel` ADD COLUMN `traffic_ratio` DECIMAL(5,1) DEFAULT 1.0 COMMENT "流量倍率";',
    'SELECT "Column `traffic_ratio` already exists in `tunnel`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 为现有数据设置默认流量倍率
UPDATE `tunnel`
SET `traffic_ratio` = 1.0
WHERE `traffic_ratio` IS NULL;

-- forward 表：删除 proxy_protocol 字段（如果存在）
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'forward'
        AND column_name = 'proxy_protocol'
    ),
    'ALTER TABLE `forward` DROP COLUMN `proxy_protocol`;',
    'SELECT "Column `proxy_protocol` not exists in `forward`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- forward 表：修改 remote_addr 字段类型为 longtext
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'forward'
        AND column_name = 'remote_addr'
        AND data_type = 'varchar'
    ),
    'ALTER TABLE `forward` MODIFY COLUMN `remote_addr` LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL;',
    'SELECT "Column `remote_addr` not exists or already modified in `forward`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- forward 表：添加 strategy 字段（负载均衡策略）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'forward'
        AND column_name = 'strategy'
    ),
    'ALTER TABLE `forward` ADD COLUMN `strategy` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT "fifo" COMMENT "负载均衡策略";',
    'SELECT "Column `strategy` already exists in `forward`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 为现有数据设置默认负载均衡策略
UPDATE `forward`
SET `strategy` = 'fifo'
WHERE `strategy` IS NULL;

-- forward 表：添加 inx 字段（排序索引）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'forward'
        AND column_name = 'inx'
    ),
    'ALTER TABLE `forward` ADD COLUMN `inx` INT(10) DEFAULT 0 COMMENT "排序索引";',
    'SELECT "Column `inx` already exists in `forward`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 为现有数据设置默认排序索引
UPDATE `forward`
SET `inx` = 0
WHERE `inx` IS NULL;

-- tunnel 表：添加 interface_name 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'tunnel'
        AND column_name = 'interface_name'
    ),
    'ALTER TABLE `tunnel` ADD COLUMN `interface_name` VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL;',
    'SELECT "Column `interface_name` already exists in `tunnel`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- tunnel 表：添加 is_auto 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'tunnel'
        AND column_name = 'is_auto'
    ),
    'ALTER TABLE `tunnel` ADD COLUMN `is_auto` INT(10) NOT NULL DEFAULT 0;',
    'SELECT "Column `is_auto` already exists in `tunnel`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- forward 表：添加 interface_name 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'forward'
        AND column_name = 'interface_name'
    ),
    'ALTER TABLE `forward` ADD COLUMN `interface_name` VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL;',
    'SELECT "Column `interface_name` already exists in `forward`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 创建 vite_config 表（如果不存在）
CREATE TABLE IF NOT EXISTS `vite_config` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `value` varchar(200) NOT NULL,
  `time` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 创建 statistics_flow 表（如果不存在）
CREATE TABLE IF NOT EXISTS `statistics_flow` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(10) NOT NULL,
  `flow` bigint(20) NOT NULL,
  `total_flow` bigint(20) NOT NULL,
  `time` varchar(100) NOT NULL,
  `created_time` bigint(20) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- statistics_flow 表：添加 created_time 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'statistics_flow'
        AND column_name = 'created_time'
    ),
    'ALTER TABLE `statistics_flow` ADD COLUMN `created_time` BIGINT(20) NOT NULL DEFAULT 0 COMMENT "创建时间毫秒时间戳";',
    'SELECT "Column `created_time` already exists in `statistics_flow`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 为现有记录设置当前毫秒时间戳（仅当 created_time 为 0 或 NULL 时）
UPDATE `statistics_flow`
SET `created_time` = UNIX_TIMESTAMP() * 1000
WHERE `created_time` = 0 OR `created_time` IS NULL;

-- 创建 user_group 表（如果不存在）
CREATE TABLE IF NOT EXISTS `user_group` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `name` varchar(200) DEFAULT NULL,
  `sort` int(10) NOT NULL DEFAULT 0,
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 创建 package_plan 表（如果不存在）
CREATE TABLE IF NOT EXISTS `package_plan` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `type` varchar(50) NOT NULL DEFAULT 'normal',
  `group_id` bigint(20) NOT NULL,
  `traffic` bigint(20) NOT NULL DEFAULT 0,
  `max_rules` int(10) NOT NULL DEFAULT 0,
  `price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `hidden` int(10) NOT NULL DEFAULT 0,
  `sort` int(10) NOT NULL DEFAULT 0,
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- user 表：添加 group_id 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'user'
        AND column_name = 'group_id'
    ),
    'ALTER TABLE `user` ADD COLUMN `group_id` BIGINT(20) DEFAULT NULL;',
    'SELECT "Column `group_id` already exists in `user`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- user 表：添加 package_id 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'user'
        AND column_name = 'package_id'
    ),
    'ALTER TABLE `user` ADD COLUMN `package_id` BIGINT(20) DEFAULT NULL;',
    'SELECT "Column `package_id` already exists in `user`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- user 表：添加 wallet_balance 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'user'
        AND column_name = 'wallet_balance'
    ),
    'ALTER TABLE `user` ADD COLUMN `wallet_balance` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT "钱包余额";',
    'SELECT "Column `wallet_balance` already exists in `user`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- user 表：添加 auto_renew 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'user'
        AND column_name = 'auto_renew'
    ),
    'ALTER TABLE `user` ADD COLUMN `auto_renew` INT(10) NOT NULL DEFAULT 0 COMMENT "自动续费";',
    'SELECT "Column `auto_renew` already exists in `user`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 创建 forward_group 表（如果不存在）
CREATE TABLE IF NOT EXISTS `forward_group` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `user_id` int(10) DEFAULT NULL,
  `name` varchar(200) NOT NULL,
  `sort` int(10) NOT NULL DEFAULT 0,
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- forward 表：添加 group_id 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'forward'
        AND column_name = 'group_id'
    ),
    'ALTER TABLE `forward` ADD COLUMN `group_id` BIGINT(20) DEFAULT NULL;',
    'SELECT "Column `group_id` already exists in `forward`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- forward 表：添加 accept_proxy_protocol 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'forward'
        AND column_name = 'accept_proxy_protocol'
    ),
    'ALTER TABLE `forward` ADD COLUMN `accept_proxy_protocol` INT(10) NOT NULL DEFAULT 0 COMMENT "接受Proxy Protocol";',
    'SELECT "Column `accept_proxy_protocol` already exists in `forward`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- forward 表：添加 send_proxy_protocol 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'forward'
        AND column_name = 'send_proxy_protocol'
    ),
    'ALTER TABLE `forward` ADD COLUMN `send_proxy_protocol` INT(10) NOT NULL DEFAULT 0 COMMENT "发送Proxy Protocol";',
    'SELECT "Column `send_proxy_protocol` already exists in `forward`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- forward 表：添加 ip_limit 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'forward'
        AND column_name = 'ip_limit'
    ),
    'ALTER TABLE `forward` ADD COLUMN `ip_limit` INT(10) NOT NULL DEFAULT 0 COMMENT "单IP连接数限制";',
    'SELECT "Column `ip_limit` already exists in `forward`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- forward 表：添加 conn_limit 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'forward'
        AND column_name = 'conn_limit'
    ),
    'ALTER TABLE `forward` ADD COLUMN `conn_limit` INT(10) NOT NULL DEFAULT 0 COMMENT "总连接数限制";',
    'SELECT "Column `conn_limit` already exists in `forward`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- package_plan 表：添加 duration_days 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'package_plan'
        AND column_name = 'duration_days'
    ),
    'ALTER TABLE `package_plan` ADD COLUMN `duration_days` INT(10) NOT NULL DEFAULT 0 COMMENT "有效天数，0为永久";',
    'SELECT "Column `duration_days` already exists in `package_plan`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 创建 device_group 表（如果不存在）
CREATE TABLE IF NOT EXISTS `device_group` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `node_id` bigint(20) NOT NULL,
  `user_group_id` bigint(20) DEFAULT NULL,
  `ratio` decimal(10,2) NOT NULL DEFAULT 1.00,
  `hide_in_probe` int(10) NOT NULL DEFAULT 0,
  `remark` varchar(500) DEFAULT NULL,
  `sort` int(10) NOT NULL DEFAULT 0,
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- forward 表：添加 in_device_group_id 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'forward'
        AND column_name = 'in_device_group_id'
    ),
    'ALTER TABLE `forward` ADD COLUMN `in_device_group_id` BIGINT(20) DEFAULT NULL;',
    'SELECT "Column `in_device_group_id` already exists in `forward`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- forward 表：添加 out_device_group_id 字段（如果不存在）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'forward'
        AND column_name = 'out_device_group_id'
    ),
    'ALTER TABLE `forward` ADD COLUMN `out_device_group_id` BIGINT(20) DEFAULT NULL;',
    'SELECT "Column `out_device_group_id` already exists in `forward`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- forward 表：设备组模式不创建 tunnel 记录，tunnel_id 必须允许为空
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'forward'
        AND column_name = 'tunnel_id'
        AND is_nullable = 'NO'
    ),
    'ALTER TABLE `forward` MODIFY COLUMN `tunnel_id` INT(10) DEFAULT NULL;',
    'SELECT "Column `tunnel_id` already allows NULL";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 创建 orders 表（如果不存在）
CREATE TABLE IF NOT EXISTS `orders` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `order_no` varchar(64) NOT NULL,
  `user_id` int(10) NOT NULL,
  `user_name` varchar(100) DEFAULT NULL,
  `type` varchar(50) NOT NULL DEFAULT 'package',
  `package_id` bigint(20) DEFAULT NULL,
  `redeem_code` varchar(100) DEFAULT NULL,
  `info` varchar(500) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `order_status` int(10) NOT NULL DEFAULT 1,
  `paid_time` bigint(20) DEFAULT NULL,
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_order_no` (`order_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- orders 表：添加 redeem_code 字段（如果不存在，兼容已创建过 orders 表但缺少该字段的情况）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'orders'
        AND column_name = 'redeem_code'
    ),
    'ALTER TABLE `orders` ADD COLUMN `redeem_code` VARCHAR(100) DEFAULT NULL;',
    'SELECT "Column `redeem_code` already exists in `orders`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 创建 redeem_code 表（如果不存在）
CREATE TABLE IF NOT EXISTS `redeem_code` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `code` varchar(100) NOT NULL,
  `type` varchar(20) NOT NULL DEFAULT 'discount',
  `package_id` bigint(20) DEFAULT NULL,
  `discount_ratio` int(10) NOT NULL DEFAULT 100,
  `amount` decimal(10,2) DEFAULT NULL,
  `uses_remaining` int(10) NOT NULL DEFAULT 1,
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_redeem_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 兑换码新增「兑换套餐（免费）」「兑换余额」两种类型：type 字段区分兑换类型（discount-折扣购买套餐，package-直接免费兑换套餐，balance-直接兑换钱包余额），
-- amount 字段供 balance 类型使用；package_id 改为允许为空（balance 类型不关联套餐）
ALTER TABLE `redeem_code` MODIFY `package_id` bigint(20) DEFAULT NULL;
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE() AND table_name = 'redeem_code' AND column_name = 'type'
    ),
    'ALTER TABLE `redeem_code` ADD COLUMN `type` VARCHAR(20) NOT NULL DEFAULT ''discount'' AFTER `code`, ADD COLUMN `amount` DECIMAL(10,2) DEFAULT NULL AFTER `discount_ratio`;',
    'SELECT "Columns `type`/`amount` already exist in `redeem_code`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 创建 device_group_chain_hop 表（如果不存在）：链式出口设备组（direction='chain'）的多跳配置
CREATE TABLE IF NOT EXISTS `device_group_chain_hop` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `device_group_id` bigint(20) NOT NULL,
  `hop_order` int(10) NOT NULL,
  `target_device_group_id` bigint(20) NOT NULL,
  `mux` tinyint(1) NOT NULL DEFAULT '0',
  `created_time` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_device_group_id` (`device_group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- device_group.node_id 允许为空：链式出口设备组（direction='chain'）没有自己的物理节点
ALTER TABLE `device_group` MODIFY `node_id` bigint(20) DEFAULT NULL;

-- 设备离线通知：device_group 按设备组覆盖的离线宽限期/保留期（为空则继承全局默认设置）
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE() AND table_name = 'device_group' AND column_name = 'offline_grace_enabled'
    ),
    'ALTER TABLE `device_group` ADD COLUMN `offline_grace_enabled` TINYINT(1) DEFAULT NULL, ADD COLUMN `offline_grace_seconds` INT(10) DEFAULT NULL, ADD COLUMN `offline_retain_enabled` TINYINT(1) DEFAULT NULL, ADD COLUMN `offline_retain_seconds` INT(10) DEFAULT NULL;',
    'SELECT "Columns `offline_*` already exist in `device_group`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 创建 user_daily_raw_flow 表（如果不存在）：用户按自然日累计的原始流量（不计流量倍率），
-- 供"我的转发规则"页「统计数据」弹窗的今日/昨日流量展示使用
CREATE TABLE IF NOT EXISTS `user_daily_raw_flow` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `user_id` int(10) NOT NULL,
  `day` varchar(10) NOT NULL,
  `raw_bytes` bigint(20) NOT NULL DEFAULT '0',
  `updated_time` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_day` (`user_id`,`day`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 简化"分配隧道权限"：不再让管理员为每个用户隧道权限单独设置 流量限制/转发数量/流量重置日期/到期时间/限速规则，
-- 这些改由账号本身的套餐额度统一控制（避免账号层与隧道层两套限制重复配置、互相打架）。
-- 放开这几列的 NOT NULL 约束，新建/编辑的记录不再写入这些字段（保留旧数据，不做破坏性删除）。
ALTER TABLE `user_tunnel`
  MODIFY `num` int(10) DEFAULT NULL,
  MODIFY `flow` bigint(20) DEFAULT NULL,
  MODIFY `flow_reset_time` bigint(20) DEFAULT NULL,
  MODIFY `exp_time` bigint(20) DEFAULT NULL;

-- 创建 invite_code 表（如果不存在）：邀请码/注册码，配合站点设置里的 invite_register_policy 使用
CREATE TABLE IF NOT EXISTS `invite_code` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `code` varchar(100) NOT NULL,
  `uses_remaining` int(10) NOT NULL DEFAULT 1,
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_invite_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- user.exp_time 允许为空：支持新增/编辑用户时把过期时间留空表示"永不过期"
ALTER TABLE `user` MODIFY `exp_time` bigint(20) DEFAULT NULL;

-- 创建通用任务重试队列 task_queue / task_queue_node（如果不存在）：
-- 任务类型化的异步重试队列，取代原先只服务转发同步的 forward_sync_queue，
-- 目前接入了 FORWARD_SYNC（转发同步）与 TELEGRAM_NOTIFY（Telegram 通知发送）两种任务类型
CREATE TABLE IF NOT EXISTS `task_queue` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `task_type` varchar(50) NOT NULL,
  `dedup_key` varchar(100) DEFAULT NULL,
  `payload` text,
  `status` varchar(20) NOT NULL DEFAULT 'PENDING',
  `retry_count` int(10) NOT NULL DEFAULT 0,
  `last_error` varchar(500) DEFAULT NULL,
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) NOT NULL,
  `completed_time` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_task_queue_type_dedup` (`task_type`,`dedup_key`),
  KEY `idx_task_queue_status` (`status`,`completed_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `task_queue_node` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `task_queue_id` bigint(20) NOT NULL,
  `node_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_task_queue_node_task` (`task_queue_id`),
  KEY `idx_task_queue_node_node` (`node_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- task_queue 表在本次更新之前已存在时（上一版 update.sql 已跑过），为其补上 status/completed_time 字段
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'task_queue'
        AND column_name = 'status'
    ),
    'SELECT "Column `status` already exists in `task_queue`";',
    'ALTER TABLE `task_queue` ADD COLUMN `status` varchar(20) NOT NULL DEFAULT ''PENDING'' AFTER `payload`, ADD COLUMN `completed_time` bigint(20) DEFAULT NULL AFTER `updated_time`, ADD KEY `idx_task_queue_status` (`status`,`completed_time`);'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- forward_sync_queue 已被 task_queue 取代（本次更新一并引入，未见于早期版本），此前若已执行过
-- 上一版 update.sql 创建过该表，这里清理掉，避免和新的通用队列表混淆
DROP TABLE IF EXISTS `forward_sync_queue`;

-- device_group 表：添加 protocol 字段（如果不存在），出口/入口＋出口设备组用来配置出口协议类型
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'device_group'
        AND column_name = 'protocol'
    ),
    'SELECT "Column `protocol` already exists in `device_group`";',
    'ALTER TABLE `device_group` ADD COLUMN `protocol` varchar(20) NOT NULL DEFAULT ''tls'' AFTER `direction`;'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- device_group 表：添加 owner_user_id / shared 字段（如果不存在），用于"单端隧道"用户自建设备组
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'device_group'
        AND column_name = 'owner_user_id'
    ),
    'SELECT "Column `owner_user_id` already exists in `device_group`";',
    'ALTER TABLE `device_group` ADD COLUMN `owner_user_id` bigint(20) DEFAULT NULL AFTER `user_group_id`, ADD COLUMN `shared` tinyint(1) NOT NULL DEFAULT 0 AFTER `owner_user_id`;'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 创建 single_tunnel_group 表（如果不存在）：单端组，普通用户自己建立用来给自己的单端隧道设备分组分类
CREATE TABLE IF NOT EXISTS `single_tunnel_group` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `name` varchar(200) DEFAULT NULL,
  `owner_user_id` bigint(20) DEFAULT NULL,
  `sort` int(10) NOT NULL DEFAULT 0,
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_single_tunnel_group_owner` (`owner_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- single_tunnel_group 表在本次更新之前已存在时（上一版 update.sql 已跑过，当时还是管理员共用名单），
-- 为其补上 owner_user_id 字段，并把既有记录清空一次（旧数据是管理员建立的全局名单，跟新的
-- "用户自建、互不相通"语义不符）；用 @single_tunnel_group_owner_existed 记录字段是否原本就存在，
-- 确保清理只在这次真正做了迁移时执行一次，往后重复执行 update.sql 不会误删用户后续建立的数据
SET @single_tunnel_group_owner_existed = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'single_tunnel_group'
    AND column_name = 'owner_user_id'
);

SET @sql = IF(@single_tunnel_group_owner_existed > 0,
  'SELECT "Column `owner_user_id` already exists in `single_tunnel_group`";',
  'ALTER TABLE `single_tunnel_group` ADD COLUMN `owner_user_id` bigint(20) DEFAULT NULL AFTER `name`, ADD KEY `idx_single_tunnel_group_owner` (`owner_user_id`);'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@single_tunnel_group_owner_existed = 0,
  'DELETE FROM `single_tunnel_group`;',
  'SELECT "single_tunnel_group already migrated to per-user ownership, skip cleanup";'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@single_tunnel_group_owner_existed = 0,
  'UPDATE `device_group` SET `single_tunnel_group_id` = NULL WHERE `single_tunnel_group_id` IS NOT NULL;',
  'SELECT "device_group.single_tunnel_group_id already migrated, skip cleanup";'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- device_group 表：添加 single_tunnel_group_id 字段（如果不存在），用户自建单端隧道设备时选择所属单端组
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'device_group'
        AND column_name = 'single_tunnel_group_id'
    ),
    'SELECT "Column `single_tunnel_group_id` already exists in `device_group`";',
    'ALTER TABLE `device_group` ADD COLUMN `single_tunnel_group_id` int(10) DEFAULT NULL AFTER `owner_user_id`;'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
