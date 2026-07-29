-- TradeCore Unified ERP & POS - cPanel MySQL Schema
-- Import this SQL file into phpMyAdmin in your cPanel dashboard

CREATE DATABASE IF NOT EXISTS `tanzatrade_tanzatrade` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `tanzatrade_tanzatrade`;

-- Core System State Table
CREATE TABLE IF NOT EXISTS `tradecore_system_state` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `doc_key` VARCHAR(100) UNIQUE NOT NULL,
    `json_data` LONGTEXT NOT NULL,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Initial empty record seed
INSERT INTO `tradecore_system_state` (`doc_key`, `json_data`) 
VALUES ('main_state', '{}')
ON DUPLICATE KEY UPDATE `id` = `id`;
