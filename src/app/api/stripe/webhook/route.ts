import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { adminClient } from '@/lib/supabase/admin';
import { planForPrice, stripe } from '@/lib/billing/stripe';

/** Stripe is the source of truth for plan + status. Events are de-duplicated via billing_events.stripe_event_id. */
export async function POST(req: Request) {
  const raw = await req.text();
  let event: Stripe.Event;
  try { event = stripe().webhooks.constructEvent(raw, req.headers.get('stripe-signature') ?? '', process.env.STRIPE_WEBHOOK_SECRET || ''); }
  catch { return new NextResponse('Invalid signature', { status: 400 }); }

  const db = adminClient();
  const { error: dup } = await db.from('billing_events').insert({ stripe_event_id: event.id, type: event.type });
  if (dup) return NextResponse.json({ received: true, duplicate: true });

  const apply = async (sub: Stripe.Subscription) => {
    const ws = sub.metadata?.workspace_id ?? (await db.from('workspaces').select('id').eq('stripe_customer_id', String(sub.customer)).maybeSingle()).data?.id;
    if (!ws) return;
    const plan = planForPrice(sub.items.data[0]?.price.id);
    const lapsed = ['canceled', 'unpaid', 'incomplete_expired'].includes(sub.status);
    await db.from('workspaces').update({ plan: lapsed || !plan ? 'free' : plan, stripe_subscription_id: sub.id, subscription_status: sub.status }).eq('id', ws);
    await db.from('billing_events').update({ workspace_id: ws }).eq('stripe_event_id', event.id);
  };

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.mode === 'subscription' && s.subscription) await apply(await stripe().subscriptions.retrieve(String(s.subscription)));
    } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      await apply(event.data.object as Stripe.Subscription);
    }
  } catch {
    await db.from('billing_events').delete().eq('stripe_event_id', event.id); // allow Stripe to retry
    return new NextResponse('Retry', { status: 500 });
  }
  return NextResponse.json({ received: true });
}
