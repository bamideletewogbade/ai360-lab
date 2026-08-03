import { NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { getOptionalAuthContext } from '@/lib/auth'
import { isDatabaseConfigured, withTransaction } from '@/lib/mysql'
import { ensureWorkspaceRecord } from '@/lib/workspace-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const messageSchema = z.object({
  id: z.string().min(1).max(64),
  role: z.enum(['user', 'assistant']),
  content: z.string().max(250_000),
  attachments: z.array(z.object({ name: z.string().max(255), kind: z.enum(['image', 'video', 'pdf', 'text']) })).max(10).optional(),
  agent: z.boolean().optional(),
  agentSteps: z.array(z.unknown()).max(30).optional(),
  sources: z.array(z.unknown()).max(50).optional(),
  usage: z.record(z.string(), z.unknown()).optional(),
  actions: z.array(z.unknown()).max(30).optional(),
})

const conversationSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(255),
  messages: z.array(messageSchema).max(500),
  updatedAt: z.number().int().nonnegative(),
  model: z.enum(['auto', 'gemini', 'claude', 'kimi', 'gpt']),
  experience: z.enum(['chat', 'agent', 'studio']).optional(),
})

const syncSchema = z.object({ conversations: z.array(conversationSchema).max(100) })

type ConversationRow = RowDataPacket & {
  id: string
  title: string
  model: string
  experience: 'chat' | 'agent' | 'studio'
  client_updated_at: string
}

type MessageRow = RowDataPacket & {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  metadata: string | Record<string, unknown> | null
}

function unavailable(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

export async function GET() {
  const context = await getOptionalAuthContext()
  if (!context) return unavailable(401, 'AUTH_REQUIRED', 'Sign in to sync conversations.')
  if (!isDatabaseConfigured()) return unavailable(503, 'DATABASE_NOT_CONFIGURED', 'Cloud sync is not configured yet.')

  const result = await withTransaction(async (connection) => {
    await ensureWorkspaceRecord(connection, context)
    const [conversationRows] = await connection.query<ConversationRow[]>(
      `SELECT id, title, model, experience, client_updated_at
       FROM lab_conversations WHERE workspace_key = ? ORDER BY client_updated_at DESC LIMIT 100`,
      [context.workspace.key],
    )
    if (!conversationRows.length) return []

    const ids = conversationRows.map((row) => row.id)
    const [messageRows] = await connection.query<MessageRow[]>(
      `SELECT id, conversation_id, role, content, metadata
       FROM lab_messages WHERE workspace_key = ? AND conversation_id IN (?) ORDER BY conversation_id, position`,
      [context.workspace.key, ids],
    )
    const grouped = new Map<string, MessageRow[]>()
    for (const row of messageRows) grouped.set(row.conversation_id, [...(grouped.get(row.conversation_id) || []), row])

    return conversationRows.map((row) => ({
      id: row.id,
      title: row.title,
      model: row.model,
      experience: row.experience,
      updatedAt: Number(row.client_updated_at),
      messages: (grouped.get(row.id) || []).map(({ id, role, content, metadata }) => {
        const extras = typeof metadata === 'string' ? JSON.parse(metadata) : metadata || {}
        return { id, role, content, ...extras }
      }),
    }))
  })

  return NextResponse.json({ conversations: result })
}

export async function PUT(request: Request) {
  const context = await getOptionalAuthContext()
  if (!context) return unavailable(401, 'AUTH_REQUIRED', 'Sign in to sync conversations.')
  if (!isDatabaseConfigured()) return unavailable(503, 'DATABASE_NOT_CONFIGURED', 'Cloud sync is not configured yet.')

  const parsed = syncSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return unavailable(400, 'INVALID_CONVERSATIONS', 'Conversation data is invalid or too large.')

  await withTransaction(async (connection) => {
    await ensureWorkspaceRecord(connection, context)

    const incomingIds = parsed.data.conversations.map((conversation) => conversation.id)
    if (incomingIds.length) {
      await connection.query(
        'DELETE FROM lab_conversations WHERE workspace_key = ? AND id NOT IN (?)',
        [context.workspace.key, incomingIds],
      )
    } else {
      await connection.execute('DELETE FROM lab_conversations WHERE workspace_key = ?', [context.workspace.key])
    }

    for (const conversation of parsed.data.conversations) {
      await connection.execute(
        `INSERT INTO lab_conversations (id, owner_id, workspace_key, title, model, experience, client_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title = VALUES(title), model = VALUES(model),
           experience = VALUES(experience), client_updated_at = VALUES(client_updated_at)`,
        [conversation.id, context.userId, context.workspace.key, conversation.title, conversation.model, conversation.experience || 'chat', conversation.updatedAt],
      )
      await connection.execute(
        'DELETE FROM lab_messages WHERE workspace_key = ? AND conversation_id = ?',
        [context.workspace.key, conversation.id],
      )
      for (const [position, message] of conversation.messages.entries()) {
        const { id, role, content, ...metadata } = message
        await connection.execute(
          `INSERT INTO lab_messages (id, owner_id, workspace_key, conversation_id, position, role, content, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, context.userId, context.workspace.key, conversation.id, position, role, content, JSON.stringify(metadata)],
        )
      }
    }
  })

  return NextResponse.json({ ok: true, syncedAt: new Date().toISOString() })
}
