-- Replyr schema. Run in Supabase SQL editor or `supabase db push`.
create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------- Plans (entitlements are data, not code) ----------
create table plans (
  id text primary key,
  name text not null,
  max_chatbots int not null,
  max_messages_month int not null,
  max_sources int not null,
  shopify_enabled boolean not null default false,
  display_price text not null default ''
);
insert into plans values
 ('free','Free',1,100,5,false,'£0'),
 ('starter','Starter',3,2000,50,true,'Set your price'),
 ('pro','Pro',10,10000,500,true,'Set your price');

-- ---------- Tenancy ----------
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'free' references plans(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text not null default 'none',
  created_at timestamptz not null default now()
);
create table memberships (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','member')),
  primary key (workspace_id, user_id)
);
create index on memberships(user_id);

create or replace function is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.workspace_id = ws and m.user_id = auth.uid());
$$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  insert into workspaces(name) values (coalesce(split_part(new.email,'@',1),'My') || '''s workspace') returning id into ws;
  insert into memberships(workspace_id,user_id,role) values (ws,new.id,'owner');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ---------- Chatbots (draft vs published) ----------
create table chatbots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  public_id text not null unique default ('bot_' || substr(replace(gen_random_uuid()::text,'-',''),1,16)),
  name text not null,
  draft jsonb not null,
  published jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index on chatbots(workspace_id);

create or replace function enforce_chatbot_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; cur int;
begin
  select p.max_chatbots into lim from workspaces w join plans p on p.id = (case when w.plan <> 'free' and w.subscription_status not in ('active','trialing') then 'free' else w.plan end) where w.id = new.workspace_id;
  select count(*) into cur from chatbots where workspace_id = new.workspace_id;
  if cur >= lim then raise exception 'Chatbot limit reached for your plan'; end if;
  return new;
end $$;
create trigger chatbot_limit before insert on chatbots for each row execute function enforce_chatbot_limit();

-- ---------- Knowledge ----------
create table knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  chatbot_id uuid not null references chatbots(id) on delete cascade,
  type text not null check (type in ('file','url','sitemap','text','faq')),
  name text not null,
  url text,
  status text not null default 'processing' check (status in ('processing','ready','failed')),
  error text,
  chunk_count int not null default 0,
  bytes int not null default 0,
  created_at timestamptz not null default now()
);
create index on knowledge_sources(chatbot_id);

create table chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  chatbot_id uuid not null references chatbots(id) on delete cascade,
  source_id uuid not null references knowledge_sources(id) on delete cascade,
  ordinal int not null,
  content text not null,
  embedding vector(1536) not null
);
create index on chunks(chatbot_id);
create index chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);

-- ---------- Shopify ----------
create table shopify_installations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  chatbot_id uuid not null references chatbots(id) on delete cascade,
  shop text not null,
  access_token_enc text not null,
  scopes text not null default '',
  status text not null default 'active' check (status in ('active','syncing','error','uninstalled')),
  last_error text,
  last_synced_at timestamptz,
  installed_at timestamptz not null default now(),
  unique (chatbot_id),
  unique (shop)
);
create table shopify_products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  chatbot_id uuid not null references chatbots(id) on delete cascade,
  shopify_id text not null,
  title text not null,
  description text not null default '',
  handle text not null,
  url text not null,
  image text,
  currency text,
  price_min numeric,
  price_max numeric,
  available boolean not null default true,
  variants jsonb not null default '[]',
  embedding vector(1536),
  updated_at timestamptz not null default now(),
  unique (chatbot_id, shopify_id)
);
create index on shopify_products(chatbot_id);
create index products_embedding_idx on shopify_products using hnsw (embedding vector_cosine_ops);

-- ---------- Conversations ----------
create table conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  chatbot_id uuid not null references chatbots(id) on delete cascade,
  session_id text not null,
  channel text not null default 'widget' check (channel in ('widget','playground')),
  escalated boolean not null default false,
  escalation_reason text,
  contact_email text,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index on conversations(workspace_id, created_at desc);
create index on conversations(chatbot_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  sources jsonb,
  products_shown int not null default 0,
  unanswered boolean not null default false,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  created_at timestamptz not null default now()
);
create index on messages(conversation_id, created_at);
create index on messages(workspace_id, created_at desc);

create table tool_executions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  ok boolean not null,
  detail text,
  created_at timestamptz not null default now()
);
create index on tool_executions(conversation_id, name);

-- ---------- Usage & billing ----------
create table usage_monthly (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  month text not null,
  messages int not null default 0,
  tokens bigint not null default 0,
  primary key (workspace_id, month)
);
create or replace function increment_usage(p_workspace uuid, p_month text, p_tokens int) returns void
language sql security definer set search_path = public as $$
  insert into usage_monthly(workspace_id, month, messages, tokens) values (p_workspace, p_month, 1, p_tokens)
  on conflict (workspace_id, month) do update set messages = usage_monthly.messages + 1, tokens = usage_monthly.tokens + p_tokens;
$$;
create table billing_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  type text not null,
  workspace_id uuid,
  created_at timestamptz not null default now()
);

-- ---------- Retrieval functions ----------
create or replace function match_chunks(query_embedding vector(1536), p_chatbot uuid, match_count int, min_similarity float)
returns table (id uuid, source_id uuid, source_name text, content text, similarity float)
language sql stable as $$
  select c.id, c.source_id, s.name, c.content, 1 - (c.embedding <=> query_embedding) as similarity
  from chunks c join knowledge_sources s on s.id = c.source_id
  where c.chatbot_id = p_chatbot and s.status = 'ready' and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding limit match_count;
$$;
create or replace function match_products(query_embedding vector(1536), p_chatbot uuid, match_count int, min_similarity float)
returns table (id uuid, title text, description text, url text, image text, currency text, price_min numeric, price_max numeric, available boolean, variants jsonb, similarity float)
language sql stable as $$
  select p.id, p.title, p.description, p.url, p.image, p.currency, p.price_min, p.price_max, p.available, p.variants, 1 - (p.embedding <=> query_embedding)
  from shopify_products p
  where p.chatbot_id = p_chatbot and p.embedding is not null and 1 - (p.embedding <=> query_embedding) >= min_similarity
  order by p.embedding <=> query_embedding limit match_count;
$$;
revoke execute on function match_chunks, match_products, increment_usage from public, anon, authenticated;

-- ---------- Row Level Security ----------
alter table plans enable row level security;
alter table workspaces enable row level security;
alter table memberships enable row level security;
alter table chatbots enable row level security;
alter table knowledge_sources enable row level security;
alter table chunks enable row level security;
alter table shopify_installations enable row level security;
alter table shopify_products enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table tool_executions enable row level security;
alter table usage_monthly enable row level security;
alter table billing_events enable row level security;

create policy plans_read on plans for select to authenticated using (true);
create policy ws_read on workspaces for select to authenticated using (is_member(id));
create policy ws_update on workspaces for update to authenticated using (is_member(id)) with check (is_member(id));
create policy mem_read on memberships for select to authenticated using (user_id = auth.uid() or is_member(workspace_id));
create policy bot_all on chatbots for all to authenticated using (is_member(workspace_id)) with check (is_member(workspace_id));
create policy src_read on knowledge_sources for select to authenticated using (is_member(workspace_id));
create policy src_delete on knowledge_sources for delete to authenticated using (is_member(workspace_id));
create policy chunk_read on chunks for select to authenticated using (is_member(workspace_id));
create policy shop_read on shopify_installations for select to authenticated using (is_member(workspace_id));
create policy prod_read on shopify_products for select to authenticated using (is_member(workspace_id));
create policy conv_read on conversations for select to authenticated using (is_member(workspace_id));
create policy conv_delete on conversations for delete to authenticated using (is_member(workspace_id));
create policy msg_read on messages for select to authenticated using (is_member(workspace_id));
create policy tool_read on tool_executions for select to authenticated using (is_member(workspace_id));
create policy usage_read on usage_monthly for select to authenticated using (is_member(workspace_id));
-- billing_events: no policies => service role only.

-- Column-level protection: tokens and billing fields are never readable/writable by end users.
revoke update on workspaces from authenticated;
grant update (name) on workspaces to authenticated;
revoke select on shopify_installations from authenticated;
grant select (id, workspace_id, chatbot_id, shop, scopes, status, last_error, last_synced_at, installed_at) on shopify_installations to authenticated;
revoke select on chunks from authenticated;
grant select (id, workspace_id, chatbot_id, source_id, ordinal, content) on chunks to authenticated;
revoke select on shopify_products from authenticated;
grant select (id, workspace_id, chatbot_id, shopify_id, title, handle, url, price_min, price_max, available, updated_at) on shopify_products to authenticated;
