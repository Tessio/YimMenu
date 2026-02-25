-- ============================================
-- SISTEMA DE AUTENTICACIÓN - YIMMENU (Railway)
-- PostgreSQL Version
-- ============================================
-- Ejecuta este SQL en tu base de datos PostgreSQL de Railway
-- ============================================

-- Tabla de cuentas
CREATE TABLE IF NOT EXISTS accounts (
  id VARCHAR(31) NOT NULL,
  activation_key VARCHAR(31) NOT NULL,
  privilege SMALLINT NOT NULL DEFAULT 1,
  created INT NOT NULL,
  dev SMALLINT NOT NULL DEFAULT 0,
  suspended_for VARCHAR(255) DEFAULT '',
  last_known_identity VARCHAR(14) DEFAULT '',
  last_hwid VARCHAR(16) DEFAULT '',
  hwid_changes INT NOT NULL DEFAULT 0,
  last_regen_ip VARCHAR(45) DEFAULT '',
  last_regen_ua_hash VARCHAR(32) DEFAULT '',
  last_regen_time INT NOT NULL DEFAULT 0,
  regens INT NOT NULL DEFAULT 0,
  switch_regens INT NOT NULL DEFAULT 0,
  custom_root_name VARCHAR(255) DEFAULT '',
  early_toxic SMALLINT NOT NULL DEFAULT 0,
  pre100 SMALLINT NOT NULL DEFAULT 0,
  used100 SMALLINT NOT NULL DEFAULT 0,
  rndbool SMALLINT NOT NULL DEFAULT 0,
  migrated_from VARCHAR(31) DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE (activation_key)
);

-- Tabla de menús activos
CREATE TABLE IF NOT EXISTS menus (
  id SERIAL PRIMARY KEY,
  account_id VARCHAR(31) NOT NULL,
  hwid VARCHAR(16) NOT NULL,
  identity VARCHAR(14) NOT NULL,
  session VARCHAR(255) DEFAULT '',
  version VARCHAR(50) NOT NULL,
  lang VARCHAR(10) NOT NULL,
  last_heartbeat INT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_menus_account_id ON menus (account_id);
CREATE INDEX IF NOT EXISTS idx_menus_session ON menus (session);

-- Tabla de license keys
CREATE TABLE IF NOT EXISTS license_keys (
  id SERIAL PRIMARY KEY,
  key VARCHAR(30) NOT NULL,
  privilege SMALLINT NOT NULL DEFAULT 1,
  used_by VARCHAR(31) DEFAULT '',
  created INT NOT NULL,
  UNIQUE (key)
);

-- Tabla de topup keys
CREATE TABLE IF NOT EXISTS topup_keys (
  id SERIAL PRIMARY KEY,
  key VARCHAR(31) NOT NULL,
  coins INT NOT NULL DEFAULT 0,
  used_by VARCHAR(31) DEFAULT '',
  created INT NOT NULL,
  UNIQUE (key)
);

-- Tabla de logs de autenticación
CREATE TABLE IF NOT EXISTS auth_logs (
  id SERIAL PRIMARY KEY,
  account_id VARCHAR(31),
  hwid VARCHAR(16),
  identity VARCHAR(14),
  ip VARCHAR(45),
  action VARCHAR(50) NOT NULL,
  result VARCHAR(50) NOT NULL,
  message TEXT,
  created INT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_logs_account_id ON auth_logs (account_id);
CREATE INDEX IF NOT EXISTS idx_auth_logs_created ON auth_logs (created);

-- ============================================
-- PRIVILEGIOS:
-- 1 = Basic
-- 2 = Regular
-- 3 = Ultimate
-- ============================================
