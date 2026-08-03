CREATE TABLE IF NOT EXISTS lab_users (
  clerk_user_id VARCHAR(64) NOT NULL,
  email VARCHAR(320) NULL,
  display_name VARCHAR(160) NULL,
  image_url VARCHAR(2048) NULL,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (clerk_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lab_workspaces (
  workspace_key VARCHAR(140) NOT NULL,
  workspace_type ENUM('user', 'organization') NOT NULL,
  subject_id VARCHAR(64) NOT NULL,
  created_by_user_id VARCHAR(64) NULL,
  display_name VARCHAR(180) NULL,
  slug VARCHAR(120) NULL,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_key),
  UNIQUE KEY uq_lab_workspaces_subject (workspace_type, subject_id),
  KEY idx_lab_workspaces_created_by (created_by_user_id),
  CONSTRAINT fk_lab_workspaces_creator FOREIGN KEY (created_by_user_id)
    REFERENCES lab_users (clerk_user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lab_workspace_memberships (
  workspace_key VARCHAR(140) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  role VARCHAR(80) NOT NULL DEFAULT 'org:member',
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_key, user_id),
  KEY idx_lab_memberships_user_status (user_id, status),
  CONSTRAINT fk_lab_memberships_workspace FOREIGN KEY (workspace_key)
    REFERENCES lab_workspaces (workspace_key) ON DELETE CASCADE,
  CONSTRAINT fk_lab_memberships_user FOREIGN KEY (user_id)
    REFERENCES lab_users (clerk_user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lab_webhook_events (
  event_id VARCHAR(160) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id),
  KEY idx_lab_webhooks_type_processed (event_type, processed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lab_conversations (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  workspace_key VARCHAR(140) NOT NULL,
  title VARCHAR(255) NOT NULL,
  model VARCHAR(80) NOT NULL DEFAULT 'auto',
  experience ENUM('chat', 'agent', 'studio') NOT NULL DEFAULT 'chat',
  client_updated_at BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_key, id),
  KEY idx_lab_conversations_workspace_updated (workspace_key, client_updated_at),
  KEY idx_lab_conversations_owner_updated (owner_id, client_updated_at),
  CONSTRAINT fk_lab_conversations_workspace FOREIGN KEY (workspace_key)
    REFERENCES lab_workspaces (workspace_key) ON DELETE CASCADE,
  CONSTRAINT fk_lab_conversations_owner FOREIGN KEY (owner_id)
    REFERENCES lab_users (clerk_user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lab_messages (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  workspace_key VARCHAR(140) NOT NULL,
  conversation_id VARCHAR(64) NOT NULL,
  position INT UNSIGNED NOT NULL,
  role ENUM('user', 'assistant') NOT NULL,
  content MEDIUMTEXT NOT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_key, id),
  UNIQUE KEY uq_lab_messages_workspace_position (workspace_key, conversation_id, position),
  KEY idx_lab_messages_owner (owner_id),
  CONSTRAINT fk_lab_messages_workspace_conversation FOREIGN KEY (workspace_key, conversation_id)
    REFERENCES lab_conversations (workspace_key, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lab_studio_projects (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  workspace_key VARCHAR(140) NOT NULL,
  name VARCHAR(255) NOT NULL,
  project_data JSON NOT NULL,
  client_updated_at BIGINT UNSIGNED NOT NULL,
  archived_at BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_key, id),
  KEY idx_lab_projects_workspace_updated (workspace_key, client_updated_at),
  KEY idx_lab_projects_workspace_archive (workspace_key, archived_at, client_updated_at),
  KEY idx_lab_projects_owner_updated (owner_id, client_updated_at),
  CONSTRAINT fk_lab_projects_workspace FOREIGN KEY (workspace_key)
    REFERENCES lab_workspaces (workspace_key) ON DELETE CASCADE,
  CONSTRAINT fk_lab_projects_owner FOREIGN KEY (owner_id)
    REFERENCES lab_users (clerk_user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lab_usage_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id VARCHAR(64) NULL,
  workspace_key VARCHAR(140) NULL,
  request_id VARCHAR(64) NOT NULL,
  route VARCHAR(120) NOT NULL,
  feature VARCHAR(80) NOT NULL,
  provider VARCHAR(80) NULL,
  model VARCHAR(120) NULL,
  input_tokens INT UNSIGNED NULL,
  output_tokens INT UNSIGNED NULL,
  estimated_cost_usd DECIMAL(12, 6) NULL,
  actual_cost_usd DECIMAL(12, 6) NULL,
  latency_ms INT UNSIGNED NULL,
  outcome VARCHAR(40) NOT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lab_usage_request_route (request_id, route),
  KEY idx_lab_usage_workspace_created (workspace_key, created_at),
  KEY idx_lab_usage_owner_created (owner_id, created_at),
  KEY idx_lab_usage_request (request_id),
  CONSTRAINT fk_lab_usage_workspace FOREIGN KEY (workspace_key)
    REFERENCES lab_workspaces (workspace_key) ON DELETE SET NULL,
  CONSTRAINT fk_lab_usage_owner FOREIGN KEY (owner_id)
    REFERENCES lab_users (clerk_user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lab_billing_customers (
  workspace_key VARCHAR(140) NOT NULL,
  provider VARCHAR(40) NOT NULL,
  provider_customer_id VARCHAR(160) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'GHS',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_key, provider),
  UNIQUE KEY uq_lab_billing_provider_customer (provider, provider_customer_id),
  CONSTRAINT fk_lab_billing_customer_workspace FOREIGN KEY (workspace_key)
    REFERENCES lab_workspaces (workspace_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lab_payment_attempts (
  id VARCHAR(64) NOT NULL,
  workspace_key VARCHAR(140) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  provider VARCHAR(40) NOT NULL,
  provider_reference VARCHAR(160) NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  plan_slug VARCHAR(80) NOT NULL,
  cadence ENUM('monthly', 'annual', 'one_time') NOT NULL,
  payment_method ENUM('mobile_money', 'card', 'bank', 'unknown') NOT NULL DEFAULT 'unknown',
  amount_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'GHS',
  status VARCHAR(40) NOT NULL DEFAULT 'created',
  failure_code VARCHAR(100) NULL,
  checkout_url VARCHAR(2048) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lab_payment_idempotency (idempotency_key),
  UNIQUE KEY uq_lab_payment_provider_reference (provider, provider_reference),
  KEY idx_lab_payment_workspace_created (workspace_key, created_at),
  KEY idx_lab_payment_status_updated (status, updated_at),
  CONSTRAINT fk_lab_payment_workspace FOREIGN KEY (workspace_key)
    REFERENCES lab_workspaces (workspace_key) ON DELETE CASCADE,
  CONSTRAINT fk_lab_payment_owner FOREIGN KEY (owner_id)
    REFERENCES lab_users (clerk_user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lab_subscriptions (
  id VARCHAR(64) NOT NULL,
  workspace_key VARCHAR(140) NOT NULL,
  provider VARCHAR(40) NOT NULL,
  provider_subscription_id VARCHAR(160) NULL,
  plan_slug VARCHAR(80) NOT NULL,
  catalog_version VARCHAR(80) NOT NULL,
  cadence ENUM('monthly', 'annual') NOT NULL,
  status VARCHAR(40) NOT NULL,
  current_period_start TIMESTAMP NULL,
  current_period_end TIMESTAMP NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lab_subscription_provider_id (provider, provider_subscription_id),
  KEY idx_lab_subscription_workspace_status (workspace_key, status),
  CONSTRAINT fk_lab_subscription_workspace FOREIGN KEY (workspace_key)
    REFERENCES lab_workspaces (workspace_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lab_credit_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_key VARCHAR(140) NOT NULL,
  entry_type ENUM('grant', 'reservation', 'settlement', 'release', 'top_up', 'refund', 'adjustment', 'expiry') NOT NULL,
  credits_delta BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  source_type VARCHAR(60) NOT NULL,
  source_id VARCHAR(160) NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  expires_at TIMESTAMP NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lab_credit_idempotency (idempotency_key),
  KEY idx_lab_credit_workspace_created (workspace_key, created_at),
  KEY idx_lab_credit_expiry (expires_at),
  CONSTRAINT fk_lab_credit_workspace FOREIGN KEY (workspace_key)
    REFERENCES lab_workspaces (workspace_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lab_billing_webhook_events (
  provider VARCHAR(40) NOT NULL,
  event_id VARCHAR(160) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, event_id),
  KEY idx_lab_billing_webhooks_processed (processed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
