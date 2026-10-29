import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/admin';
import { botConfigSchema } from '@/lib/config';
import { corsHeaders, originAllowed } from '@/lib/security/origin';

export async function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) }); }

export async function GET(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const origin = req.headers.get('origin'); const cors = corsHeaders(origin);
  const { publicId } = await params;
  const { data: bot } = await adminClient().from('chatbots').select('published').eq('public_id', publicId).maybeSingle();
  if (!bot?.published) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: cors });
  const c = botConfigSchema.parse(bot.published);
  if (!originAllowed(origin, c.widget.allowedDomains)) return NextResponse.json({ error: 'Domain not allowed' }, { status: 403, headers: cors });
  // Only public, non-sensitive fields are exposed to the browser.
  return NextResponse.json({ title: c.widget.title, color: c.widget.color, position: c.widget.position, avatar: c.widget.avatar, welcome: c.welcome, suggested: c.suggested }, { headers: { ...cors, 'Cache-Control': 'public, max-age=60' } });
}
