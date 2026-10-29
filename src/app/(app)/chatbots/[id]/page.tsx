import { notFound } from 'next/navigation';
import BotEditor from '@/components/BotEditor';
import { botConfigSchema } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';

export default async function BotPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; error?: string; connected?: string }> }) {
  const { id } = await params; const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: bot } = await supabase.from('chatbots').select('id, name, public_id, draft, published, published_at').eq('id', id).maybeSingle();
  if (!bot) notFound();
  return <BotEditor bot={{ id: bot.id, publicId: bot.public_id, name: bot.name, draft: botConfigSchema.parse(bot.draft), published: bot.published ? botConfigSchema.parse(bot.published) : null }} initialTab={sp.tab ?? 'configure'} flash={sp.error ? `Shopify: ${sp.error.replaceAll('_', ' ')}` : sp.connected ? 'Shopify connected. Syncing products…' : ''} />;
}
