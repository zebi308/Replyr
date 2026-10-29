import SettingsForm from '@/components/SettingsForm';
import { createClient } from '@/lib/supabase/server';

export default async function Settings() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: ws } = await supabase.from('workspaces').select('id, name').limit(1).single();
  return (
    <div className="space-y-5"><h1 className="text-2xl font-bold">Settings</h1>
      <p className="text-sm text-ink/70">Signed in as {user?.email}</p>
      {ws && <SettingsForm id={ws.id} name={ws.name} />}
      <p className="hint max-w-md">Conversation retention: delete individual conversations from your database console, or delete a chatbot to remove all its conversations, knowledge and Shopify data.</p></div>
  );
}
