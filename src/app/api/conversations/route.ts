import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getOptionalAuthContext } from '@/lib/auth'
import { getPostgres, isPostgresConfigured } from '@/lib/postgres'
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

type ConversationRow = {
  id: string
  title: string
  model: string
  experience: 'chat' | 'agent' | 'studio'
  client_updated_at: string
}

type MessageRow = {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  metadata: Record<string, unknown> | null
}

function unavailable(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

export async function GET() {
  const context = await getOptionalAuthContext()
  if (!context) return unavailable(401, 'AUTH_REQUIRED', 'Sign in to sync conversations.')
  if (!isPostgresConfigured()) return unavailable(503, 'DATABASE_NOT_CONFIGURED', 'Cloud sync is not configured yet.')

  const sql = getPostgres()
  const result = await sql.begin(async (tx) => {
    await ensureWorkspaceRecord(tx, context)
    const conversationRows = await tx<ConversationRow[]>`
      select id, title, model, experience, client_updated_at
        from public.lab_conversations
       where workspace_key = ${context.workspace.key}
       order by client_updated_at desc limit 100`
    if (!conversationRows.length) return []

    const ids = conversationRows.map((row) => row.id)
    const messageRows = await tx<MessageRow[]>`
      select id, conversation_id, role, content, metadata
        from public.lab_messages
       where workspace_key = ${context.workspace.key} and conversation_id in ${tx(ids)}
       order by conversation_id, position`

    const grouped = new Map<string, MessageRow[]>()
    for (const row of messageRows) grouped.set(row.conversation_id, [...(grouped.get(row.conversation_id) || []), row])

    return conversationRows.map((row) => ({
      id: row.id,
      title: row.title,
      model: row.model,
      experience: row.experience,
      updatedAt: Number(row.client_updated_at),
      // jsonb comes back already parsed, unlike the JSON string MySQL returned.
      messages: (grouped.get(row.id) || []).map(({ id, role, content, metadata }) => ({
        id, role, content, ...(metadata ?? {}),
      })),
    }))
  })

  return NextResponse.json({ conversations: result })
}

export async function PUT(request: Request) {
  const context = await getOptionalAuthContext()
  if (!context) return unavailable(401, 'AUTH_REQUIRED', 'Sign in to sync conversations.')
  if (!isPostgresConfigured()) return unavailable(503, 'DATABASE_NOT_CONFIGURED', 'Cloud sync is not configured yet.')

  const parsed = syncSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return unavailable(400, 'INVALID_CONVERSATIONS', 'Conversation data is invalid or too large.')

  const sql = getPostgres()
  await sql.begin(async (tx) => {
    await ensureWorkspaceRecord(tx, context)

    // The client owns the list, so anything it no longer sends is gone. Messages
    // cascade from the conversation, so they do not need deleting separately.
    const incomingIds = parsed.data.conversations.map((conversation) => conversation.id)
    if (incomingIds.length) {
      await tx`
        delete from public.lab_conversations
         where workspace_key = ${context.workspace.key} and id not in ${tx(incomingIds)}`
    } else {
      await tx`delete from public.lab_conversations where workspace_key = ${context.workspace.key}`
    }

    for (const conversation of parsed.data.conversations) {
      await tx`
        insert into public.lab_conversations
          (id, owner_id, workspace_key, title, model, experience, client_updated_at)
        values (${conversation.id}, ${context.userId}, ${context.workspace.key}, ${conversation.title},
                ${conversation.model}, ${conversation.experience || 'chat'}, ${conversation.updatedAt})
        on conflict (workspace_key, id) do update set
          title = excluded.title,
          model = excluded.model,
          experience = excluded.experience,
          client_updated_at = excluded.client_updated_at,
          updated_at = now()`
      await tx`
        delete from public.lab_messages
         where workspace_key = ${context.workspace.key} and conversation_id = ${conversation.id}`
      for (const [position, message] of conversation.messages.entries()) {
        const { id, role, content, ...metadata } = message
        await tx`
          insert into public.lab_messages
            (id, owner_id, workspace_key, conversation_id, position, role, content, metadata)
          values (${id}, ${context.userId}, ${context.workspace.key}, ${conversation.id},
                  ${position}, ${role}, ${content}, ${tx.json(metadata as never)})`
      }
    }
  })

  return NextResponse.json({ ok: true, syncedAt: new Date().toISOString() })
}
