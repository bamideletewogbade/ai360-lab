import { config } from 'dotenv'
import { readFile } from 'node:fs/promises'
import mysql from 'mysql2/promise'

// Next.js reads .env.local automatically; a plain Node script does not.
config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

const required = ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD']
const missing = required.filter((name) => !process.env[name])
if (missing.length) {
  throw new Error(`Missing database environment variables: ${missing.join(', ')}`)
}

const sql = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8')
const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  multipleStatements: true,
  charset: 'utf8mb4',
})

async function columnExists(table, column) {
  const [rows] = await connection.execute(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [process.env.MYSQL_DATABASE, table, column],
  )
  return rows.length > 0
}

async function indexExists(table, index) {
  const [rows] = await connection.execute(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [process.env.MYSQL_DATABASE, table, index],
  )
  return rows.length > 0
}

async function constraintExists(table, constraint) {
  const [rows] = await connection.execute(
    `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`,
    [process.env.MYSQL_DATABASE, table, constraint],
  )
  return rows.length > 0
}

async function primaryKeyColumns(table) {
  const [rows] = await connection.execute(
    `SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
     ORDER BY ORDINAL_POSITION`,
    [process.env.MYSQL_DATABASE, table],
  )
  return rows.map((row) => row.COLUMN_NAME)
}

async function addColumn(table, definition) {
  const column = definition.trim().split(/\s+/, 1)[0]
  if (!(await columnExists(table, column))) {
    await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`)
  }
}

async function addIndex(table, name, definition) {
  if (!(await indexExists(table, name))) {
    await connection.query(`ALTER TABLE \`${table}\` ADD ${definition}`)
  }
}

async function addConstraint(table, name, definition) {
  if (!(await constraintExists(table, name))) {
    await connection.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\` ${definition}`)
  }
}

async function dropConstraint(table, name) {
  if (await constraintExists(table, name)) {
    await connection.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${name}\``)
  }
}

async function dropIndex(table, name) {
  if (await indexExists(table, name)) {
    await connection.query(`ALTER TABLE \`${table}\` DROP INDEX \`${name}\``)
  }
}

async function ensurePrimaryKey(table, columns) {
  const current = await primaryKeyColumns(table)
  if (current.join(',') === columns.join(',')) return
  await connection.query(
    `ALTER TABLE \`${table}\` ${current.length ? 'DROP PRIMARY KEY, ' : ''}ADD PRIMARY KEY (${columns.map((column) => `\`${column}\``).join(', ')})`,
  )
}

async function migrateWorkspaceOwnership() {
  await addColumn('lab_users', 'deleted_at TIMESTAMP NULL AFTER image_url')
  await addColumn('lab_workspaces', 'display_name VARCHAR(180) NULL AFTER created_by_user_id')
  await addColumn('lab_workspaces', 'slug VARCHAR(120) NULL AFTER display_name')
  await addColumn('lab_workspaces', 'deleted_at TIMESTAMP NULL AFTER slug')
  await addColumn('lab_conversations', 'workspace_key VARCHAR(140) NULL AFTER owner_id')
  await addColumn('lab_messages', 'workspace_key VARCHAR(140) NULL AFTER owner_id')
  await addColumn('lab_studio_projects', 'workspace_key VARCHAR(140) NULL AFTER owner_id')
  await addColumn('lab_usage_events', 'workspace_key VARCHAR(140) NULL AFTER owner_id')
  await addColumn('lab_studio_projects', 'archived_at BIGINT UNSIGNED NULL AFTER client_updated_at')
  await addColumn('lab_usage_events', "feature VARCHAR(80) NOT NULL DEFAULT 'unknown' AFTER route")
  await addColumn('lab_usage_events', 'provider VARCHAR(80) NULL AFTER feature')
  await addColumn('lab_usage_events', 'actual_cost_usd DECIMAL(12, 6) NULL AFTER estimated_cost_usd')
  await addColumn('lab_usage_events', 'latency_ms INT UNSIGNED NULL AFTER actual_cost_usd')
  await addColumn('lab_usage_events', 'metadata JSON NULL AFTER outcome')
  await addColumn('lab_usage_events', 'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at')

  await connection.query(
    `INSERT IGNORE INTO lab_workspaces (workspace_key, workspace_type, subject_id, created_by_user_id)
     SELECT CONCAT('user:', clerk_user_id), 'user', clerk_user_id, clerk_user_id FROM lab_users`,
  )
  await connection.query(
    `UPDATE lab_conversations SET workspace_key = CONCAT('user:', owner_id) WHERE workspace_key IS NULL`,
  )
  await connection.query(
    `UPDATE lab_studio_projects SET workspace_key = CONCAT('user:', owner_id) WHERE workspace_key IS NULL`,
  )
  await connection.query(
    `UPDATE lab_usage_events SET workspace_key = CONCAT('user:', owner_id)
     WHERE workspace_key IS NULL AND owner_id IS NOT NULL`,
  )
  await connection.query(
    `UPDATE lab_messages AS message
     JOIN lab_conversations AS conversation
       ON conversation.owner_id = message.owner_id AND conversation.id = message.conversation_id
     SET message.workspace_key = conversation.workspace_key
     WHERE message.workspace_key IS NULL`,
  )

  await connection.query('ALTER TABLE lab_conversations MODIFY workspace_key VARCHAR(140) NOT NULL')
  await connection.query('ALTER TABLE lab_messages MODIFY workspace_key VARCHAR(140) NOT NULL')
  await connection.query('ALTER TABLE lab_studio_projects MODIFY workspace_key VARCHAR(140) NOT NULL')

  await dropConstraint('lab_messages', 'fk_lab_messages_conversation')
  await dropConstraint('lab_messages', 'fk_lab_messages_workspace_conversation')
  await dropIndex('lab_messages', 'uq_lab_messages_position')
  await dropIndex('lab_conversations', 'uq_lab_conversations_workspace_id')
  await dropIndex('lab_messages', 'uq_lab_messages_workspace_id')
  await dropIndex('lab_studio_projects', 'uq_lab_projects_workspace_id')

  await ensurePrimaryKey('lab_conversations', ['workspace_key', 'id'])
  await ensurePrimaryKey('lab_messages', ['workspace_key', 'id'])
  await ensurePrimaryKey('lab_studio_projects', ['workspace_key', 'id'])

  await addIndex('lab_conversations', 'idx_lab_conversations_workspace_updated', 'KEY idx_lab_conversations_workspace_updated (workspace_key, client_updated_at)')
  await addIndex('lab_messages', 'uq_lab_messages_workspace_position', 'UNIQUE KEY uq_lab_messages_workspace_position (workspace_key, conversation_id, position)')
  await addIndex('lab_messages', 'idx_lab_messages_owner', 'KEY idx_lab_messages_owner (owner_id)')
  await addIndex('lab_studio_projects', 'idx_lab_projects_workspace_updated', 'KEY idx_lab_projects_workspace_updated (workspace_key, client_updated_at)')
  await addIndex('lab_studio_projects', 'idx_lab_projects_workspace_archive', 'KEY idx_lab_projects_workspace_archive (workspace_key, archived_at, client_updated_at)')
  await addIndex('lab_usage_events', 'idx_lab_usage_workspace_created', 'KEY idx_lab_usage_workspace_created (workspace_key, created_at)')
  await connection.query(
    `DELETE duplicate_event FROM lab_usage_events AS duplicate_event
     JOIN lab_usage_events AS retained_event
       ON retained_event.request_id = duplicate_event.request_id
      AND retained_event.route = duplicate_event.route
      AND retained_event.id < duplicate_event.id`,
  )
  await addIndex('lab_usage_events', 'uq_lab_usage_request_route', 'UNIQUE KEY uq_lab_usage_request_route (request_id, route)')

  await addConstraint('lab_conversations', 'fk_lab_conversations_workspace',
    'FOREIGN KEY (workspace_key) REFERENCES lab_workspaces (workspace_key) ON DELETE CASCADE')
  await addConstraint('lab_messages', 'fk_lab_messages_workspace_conversation',
    'FOREIGN KEY (workspace_key, conversation_id) REFERENCES lab_conversations (workspace_key, id) ON DELETE CASCADE')
  await addConstraint('lab_studio_projects', 'fk_lab_projects_workspace',
    'FOREIGN KEY (workspace_key) REFERENCES lab_workspaces (workspace_key) ON DELETE CASCADE')
  await addConstraint('lab_usage_events', 'fk_lab_usage_workspace',
    'FOREIGN KEY (workspace_key) REFERENCES lab_workspaces (workspace_key) ON DELETE SET NULL')
}

try {
  await connection.query(sql)
  await migrateWorkspaceOwnership()
  console.log(`AI 360 Lab schema is ready in database ${process.env.MYSQL_DATABASE}.`)
} finally {
  await connection.end()
}
