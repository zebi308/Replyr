import BillingActions from '@/components/BillingActions';
import { createClient } from '@/lib/supabase/server';
import { monthKey } from '@/lib/billing/entitlements';

export default async function Billing() {
  const supabase = await createClient();
  const { data: ws } = await supabase.from('workspaces').select('plan, subscription_status, stripe_customer_id').limit(1).single();
  const { data: plans } = await supabase.from('plans').select('*').order('max_chatbots');
  const { data: usage } = await supabase.from('usage_monthly').select('messages, tokens').eq('month', monthKey()).maybeSingle();
  const { count: bots } = await supabase.from('chatbots').select('id', { count: 'exact', head: true });
  const plan = plans?.find((p) => p.id === ws?.plan);
  const rows: [string, string][] = plan ? [['Messages this month', `${usage?.messages ?? 0} / ${plan.max_messages_month}`], ['Chatbots', `${bots ?? 0} / ${plan.max_chatbots}`], ['Knowledge sources per workspace', `up to ${plan.max_sources}`], ['Shopify', plan.shopify_enabled ? 'Included' : 'Not included'], ['AI tokens this month', String(usage?.tokens ?? 0)]] : [];
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Usage & billing</h1>
      <div className="card p-5"><p className="text-sm text-ink/60">Current plan</p><p className="text-xl font-bold">{plan?.name} <span className="text-sm font-normal text-ink/60">({ws?.subscription_status})</span></p>
        <dl className="mt-4 divide-y divide-line text-sm">{rows.map(([k, v]) => <div key={k} className="flex justify-between py-2"><dt>{k}</dt><dd className="font-semibold">{v}</dd></div>)}</dl></div>
      <BillingActions plans={plans ?? []} current={ws?.plan ?? 'free'} hasCustomer={!!ws?.stripe_customer_id} />
    </div>
  );
}
