# Replyr

AI support chatbots for websites and Shopify stores. One conversation engine, three ways to configure it (Shopify, knowledge base, custom instructions, or all combined), an embeddable widget, a playground, a dashboard, human handoff and Stripe billing.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind · Supabase (Auth, Postgres, pgvector, RLS) · Stripe · OpenAI-compatible or Anthropic models.

## 1. Setup (about 15 minutes)

```bash
npm install
cp .env.example .env.local     # fill in values, see section 2
```

1. Create a Supabase project. In the SQL editor run `supabase/migrations/001_init.sql` (enables pgvector, creates tables, RLS, plans, retrieval functions).
2. Supabase → Authentication → URL configuration: set Site URL to your app URL and add `<APP_URL>/dashboard` to redirect URLs.
3. `npm run dev` → open http://localhost:3000 → sign up. A workspace is created automatically.

## 2. Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Public base URL (used for Shopify/Stripe redirects and webhooks) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase API settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Never expose to the browser |
| `AI_PROVIDER` | `openai` (any OpenAI-compatible endpoint) or `anthropic` |
| `AI_MODEL` | Default chat model (per-chatbot override available) |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` | OpenAI or compatible (OpenRouter, Groq, Azure, local) |
| `ANTHROPIC_API_KEY` | When `AI_PROVIDER=anthropic` |
| `EMBEDDING_MODEL`, `EMBEDDING_API_KEY`, `EMBEDDING_BASE_URL` | Embeddings (OpenAI-compatible, 1536 dimensions). Defaults to the OpenAI key |
| `ENCRYPTION_KEY` | 32 random bytes, base64: `openssl rand -base64 32`. Encrypts Shopify tokens |
| `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_SCOPES`, `SHOPIFY_API_VERSION` | Shopify app credentials |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO` | Billing |

If you change the embedding model to one with a different vector size, change `vector(1536)` in the migration.

## 3. Shopify setup (requires your own credentials)

1. Create an app in the Shopify Partner Dashboard. App URL: `<APP_URL>`. Allowed redirection URL: `<APP_URL>/api/shopify/callback`.
2. Put the client ID/secret in `.env.local`. Scopes default to `read_products,read_orders`.
3. Webhooks (products create/update/delete, app/uninstalled) are registered automatically after install, pointing to `<APP_URL>/api/shopify/webhooks`. Your app URL must be publicly reachable (use a tunnel in development).
4. Test on a development store first: Dashboard → chatbot → Shopify tab → enter `store.myshopify.com` → Connect.
5. **Before real merchants:** order lookups read customer name/email fields, which Shopify classes as *protected customer data*. Public apps must request and be approved for this in the Partner Dashboard (and complete the data-protection review). Also verify `SHOPIFY_API_VERSION` against Shopify's current supported versions, and consider moving to Shopify's managed installation/token-exchange flow, which Shopify now recommends for new apps. Orders older than 60 days need the `read_all_orders` scope, which also needs approval.
6. The mandatory privacy webhooks are handled in `/api/shopify/webhooks` (register `customers/data_request`, `customers/redact`, `shop/redact` in the Partner Dashboard to that URL). Replyr stores no Shopify customer data beyond what a customer chooses to give during a handoff.

## 4. Stripe setup

Create two recurring prices (Starter, Pro) and set `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_PRO`. Add a webhook to `<APP_URL>/api/stripe/webhook` for `checkout.session.completed` and `customer.subscription.created|updated|deleted`. Enable the customer portal in Stripe settings.

Plan limits live in the `plans` table (chatbots, messages per month, sources, Shopify on/off, display price). Edit rows to change entitlements. Prices shown are placeholders; set pricing only after you have measured AI cost per conversation. A paid plan with a lapsed subscription automatically falls back to Free limits.

## 5. Deploy

Vercel works out of the box (set all env vars, set `NEXT_PUBLIC_APP_URL` to the production URL). Routes that ingest documents or sync Shopify set `maxDuration` up to 300s, which needs a Vercel plan that allows it; otherwise use a Node host (`npm run build && npm start`).

## 6. How it works

- **Tenancy:** every row carries `workspace_id`. RLS (`is_member()`) protects dashboard access. Secrets (Shopify tokens) and embeddings are not readable by end-user sessions (column grants). The public widget and ingestion use the service role and always scope by a verified chatbot/workspace id.
- **Draft vs published:** the editor and playground use `draft`; the widget only serves `published` until you click Publish.
- **Engine** (`src/lib/engine`): retrieve (knowledge chunks + products via pgvector) → build prompt with fixed precedence (platform rules › verified tool results › retrieved knowledge › business instructions) → provider call with tools (`lookup_order`, `request_human`) → post-processing. The model replies `[[NO_ANSWER]]` when sources do not support an answer; the server then returns your fallback and flags the message as unanswered.
- **Order privacy:** `lookup_order` requires order number AND checkout email; the server compares the email to the Shopify order and returns identical responses for "not found" and "mismatch". Max 5 lookups per conversation. Only status/fulfilment/tracking fields are returned, never addresses or contact data.
- **Injection defence:** retrieved text and product data are fenced and sanitised, treated as untrusted, tools are bound server-side to the chatbot's own store, and the model can only call tools offered for that chatbot.
- **Widget:** `public/widget.js`, Shadow DOM, no secrets, domain allowlist + CORS check, per-IP and per-session rate limits, per-workspace monthly quota.
- **Metrics:** conversation volume, unanswered questions, handoffs, product cards shown. No "resolved" rate is shown because there is no defensible way to infer it.

## 7. Tests actually run

`npm run typecheck` (passes), `npm test` (12 unit tests pass: chunking, prompt fencing/precedence, config validation, domain allowlist, rate limiting, SSRF guard, token encryption, Shopify webhook and OAuth HMAC verification), `next build` (passes).

**Not run (needs your credentials):** live Supabase, AI provider, Shopify and Stripe calls; cross-tenant RLS testing; end-to-end browser tests. Run a manual cross-tenant check by creating two accounts and confirming that one cannot open the other's `/chatbots/<id>` URL (returns 404).

## 8. Known limitations and roadmap

1. Ingestion and Shopify sync run inside request handlers, not a queue. Move to a worker (Inngest, Trigger.dev, pg-boss) for large catalogues and documents.
2. Raw uploaded files are not retained (text is extracted, chunked and embedded). Add private object storage for re-processing and downloads.
3. Replies are returned as complete messages, not token-streamed.
4. Rate limiting is in-memory per instance; use Redis/Upstash when running several instances.
5. Product stock comes from the last sync/webhook, not a live check. Add a live inventory tool for high-churn stores.
6. Scanned/image PDFs are not supported (no OCR).
7. Single workspace per user in the UI; the schema supports teams and roles but invitations are not built.
8. No automated retention job; delete a chatbot to remove its data.
9. Add integration tests (Playwright) and an RLS test suite against a Supabase test project.
