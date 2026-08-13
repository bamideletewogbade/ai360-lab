export const dynamic = 'force-dynamic'

export async function POST() {
  return Response.json({
    error: 'Clerk webhooks are retired. AI360 now uses Supabase Auth.',
  }, { status: 410, headers: { 'Cache-Control': 'no-store' } })
}
