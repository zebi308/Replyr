import { NextResponse } from 'next/server';
import { requireWorkspace } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/billing/stripe';

export async function POST() {
  const ctx = await requireWorkspace(); if ('error' in ctx) return ctx.error;
  const { data: ws } = await adminClient().from('workspaces').select('stripe_customer_id').eq('id', ctx.workspaceId).single();
  if (!ws?.stripe_customer_id) return NextResponse.json({ error: 'No billing account yet' }, { status: 400 });
  const session = await stripe().billingPortal.sessions.create({ customer: ws.stripe_customer_id, return_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing` });
  return NextResponse.json({ url: session.url });
}
