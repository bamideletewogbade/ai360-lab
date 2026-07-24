import { rateLimit, rejectLargeRequest } from '@/lib/guardrails'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ActionPayload = {
  recipient?: string
  subject?: string
  body?: string
  title?: string
  notes?: string
  start?: string
  durationMinutes?: number
}

type ActionRequest = {
  kind?: 'email' | 'calendar' | 'task'
  approved?: boolean
  payload?: ActionPayload
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : ''
}

function icsText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function icsDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function safeFilename(value: string) {
  const name = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 52)
  return `${name || 'ai-360-event'}.ics`
}

export async function POST(request: Request) {
  const tooLarge = rejectLargeRequest(request, 30_000)
  if (tooLarge) return tooLarge
  const limited = rateLimit(request, 'action', { minute: 20, daily: 100 })
  if (limited) return limited

  let body: ActionRequest
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid action request' }, { status: 400 })
  }

  if (body.approved !== true) {
    return Response.json(
      { error: 'This action needs explicit user approval before it can run.' },
      { status: 409 },
    )
  }

  const payload = body.payload ?? {}

  if (body.kind === 'email') {
    const recipient = clean(payload.recipient, 254)
    const subject = clean(payload.subject, 140)
    const messageBody = clean(payload.body, 8_000)
    if (!subject || !messageBody) {
      return Response.json({ error: 'The email needs a subject and message.' }, { status: 400 })
    }
    if (recipient && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return Response.json({ error: 'Enter a valid email address or leave it blank.' }, { status: 400 })
    }
    const url = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(messageBody)}`
    return Response.json({
      ok: true,
      kind: 'email',
      url,
      message: 'Email draft prepared. It has not been sent.',
    })
  }

  if (body.kind === 'calendar') {
    const title = clean(payload.title, 160)
    const notes = clean(payload.notes, 3_000)
    const start = new Date(clean(payload.start, 40))
    const durationMinutes = Math.min(1_440, Math.max(15, Number(payload.durationMinutes) || 60))
    if (!title || Number.isNaN(start.getTime())) {
      return Response.json({ error: 'Choose a valid event title and start time.' }, { status: 400 })
    }
    const end = new Date(start.getTime() + durationMinutes * 60_000)
    const calendar = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//AI Three Sixty//AI 360 Lab//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${crypto.randomUUID()}@aithreesixty.tech`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsText(title)}`,
      `DESCRIPTION:${icsText(notes)}`,
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n')
    return new Response(calendar, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeFilename(title)}"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  if (body.kind === 'task') {
    const title = clean(payload.title, 180)
    const notes = clean(payload.notes, 3_000)
    if (!title) return Response.json({ error: 'The task needs a title.' }, { status: 400 })
    return Response.json({
      ok: true,
      kind: 'task',
      task: { id: crypto.randomUUID(), title, notes, savedAt: new Date().toISOString() },
      message: 'Task saved to this conversation.',
    })
  }

  return Response.json({ error: 'Unsupported action type' }, { status: 400 })
}
