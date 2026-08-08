export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestId = request.headers.get('x-request-id')?.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80)
    || crypto.randomUUID()
  return Response.json(
    {
      status: 'ok',
      service: 'AI360 Lab',
      environment: process.env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      requestId,
      time: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } },
  )
}
