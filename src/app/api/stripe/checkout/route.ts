import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspace } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { priceForPlan, stripe } from '@/lib/billing/stripe';

export async function POST(req: Request) {
  const ctx = await requireWorkspace(); if ('error' in ctx) return ctx.error;
  const p = z.object({ plan: z.enum(['starter', 'pro']) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  const price = priceForPlan(p.data.plan);
  if (!price) return NextResponse.json({ error: 'Stripe price not configured for this plan' }, { status: 500 });
  const db = adminClient(); const s = stripe();
  const { data: ws } = await db.from('workspaces').select('stripe_customer_id, name').eq('id', ctx.workspaceId).single();
  let customer = ws?.stripe_customer_id as string | null;
  if (!customer) {
    customer = (await s.customers.create({ email: ctx.user.email, name: ws?.name, metadata: { workspace_id: ctx.workspaceId } })).id;
    await db.from('workspaces').update({ stripe_customer_id: customer }).eq('id', ctx.workspaceId);
  }
  const app = process.env.NEXT_PUBLIC_APP_URL;
  const session = await s.checkout.sessions.create({
    mode: 'subscription', customer, line_items: [{ price, quantity: 1 }], allow_promotion_codes: true,
    subscription_data: { metadata: { workspace_id: ctx.workspaceId } }, metadata: { workspace_id: ctx.workspaceId },
    success_url: `${app}/billing?success=1`, cancel_url: `${app}/billing`,
  });
  return NextResponse.json({ url: session.url });
}
