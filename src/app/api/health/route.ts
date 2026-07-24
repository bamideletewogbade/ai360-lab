export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json(
    {
      status: 'ok',
      service: 'AI 360 Lab',
      aiConfigured: Boolean(process.env.OPENROUTER_API_KEY),
      time: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
