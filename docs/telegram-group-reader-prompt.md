Build a production Telegram group reader for this product.

Product context:
- Stack: Nuxt 3 + Nuxt UI + Postgres.
- Backend entrypoint already exists at `server/api/telegram/webhook.post.ts`.
- Shared Telegram helpers already exist at `server/utils/telegram.ts`.
- The app now uses a real hierarchy:
  - `buildings`
  - `objects`
  - `customers`
  - `chats`
  - `chat_messages`
- The dashboard is scoped by selected building and selected object.
- Chats must belong to an `object_id`.
- Buildings are top-level workspaces, but Telegram ingestion should attach directly to `object_id`.
- The current code already supports:
  - webhook secret verification
  - `TELEGRAM_DEFAULT_OBJECT_ID` fallback
  - chat/message persistence into Postgres
  - `telegram_group_bindings` lookup
- The improved implementation should keep that structure and harden it.

Goal:
- Read incoming Telegram group messages for this security/building management dashboard.
- Route each Telegram group to the correct object in the product.
- Persist chats and messages in Postgres so the dashboard `/chats` page shows only object-scoped conversations.
- Keep the solution production-oriented and ready for later media support.

Business rules for this product:
- One building can contain many objects.
- One Telegram group should map to one object through `telegram_group_bindings`.
- The same object may have multiple Telegram groups if needed.
- Incoming Telegram messages must appear inside the object-specific chats UI.
- If a Telegram group is not bound, the system may:
  - use `TELEGRAM_DEFAULT_OBJECT_ID` as a fallback, or
  - skip persistence with a structured log
- Prefer binding-table routing first, fallback second.

Existing relevant files:
- `server/api/telegram/webhook.post.ts`
- `server/utils/telegram.ts`
- `server/api/chats/index.get.ts`
- `server/api/chats/index.post.ts`
- `server/api/chats/[id].get.ts`
- `server/api/chats/[id]/messages.post.ts`
- `app/pages/chats.vue`
- `db/postgres/telegram.sql`
- `db/postgres/telegram_group_bindings.sql`
- `db/postgres/buildings_rebuild.sql`

Existing relevant tables:
- `public.buildings`
- `public.objects`
- `public.customers`
- `public.chats`
- `public.chat_messages`
- `public.chat_members`
- `public.telegram_group_bindings`

Current schema expectations:
- `buildings`
  - `id`
  - `name`
  - `logo`
  - `description`
- `objects`
  - `id`
  - `building_id`
  - `name`
  - `address`
  - `description`
  - `code`
- `telegram_group_bindings`
  - `id`
  - `tg_chat_id bigint unique`
  - `object_id bigint not null`
  - `title text`
  - `is_active boolean default true`
  - `created_at timestamptz default now()`
  - `updated_at timestamptz default now()`
- `chats`
  - `id`
  - `title`
  - `is_group`
  - `tg_chat_id`
  - `tg_type`
  - `object_id`
  - `updated_at`
- `chat_messages`
  - `id`
  - `chat_id`
  - `author_id`
  - `content`
  - `external_id`
  - `direction`
  - `status`
  - `object_id`
  - `created_at`

Implementation requirements:
- Use Telegram Bot API webhooks, not polling.
- Verify requests using `x-telegram-bot-api-secret-token`.
- Ignore unsupported update types safely.
- Support text messages first.
- Design the parser so media support can be added next:
  - photo
  - document
  - video
  - voice
- Preserve idempotency:
  - do not insert duplicate `chat_messages` for the same `chat_id + external_id`
- Upsert the Telegram chat by `tg_chat_id`.
- Keep `chats.updated_at` fresh when a new inbound or outbound message is written.
- Persist all chat/message rows with the resolved `object_id`.
- Keep the code modular and reusable.

Expected routing logic:
1. Receive Telegram webhook update.
2. Verify secret token.
3. Extract `message.chat.id`, `message.message_id`, sender, text, and chat metadata.
4. Resolve `object_id`:
   - first from `telegram_group_bindings` where `tg_chat_id` matches and `is_active = true`
   - otherwise from `TELEGRAM_DEFAULT_OBJECT_ID` if configured
   - otherwise skip persistence with a clear error/log response
5. Upsert `chats` row:
   - match by `tg_chat_id`
   - set `title`
   - set `is_group`
   - set `tg_type`
   - set `object_id`
6. Check whether message already exists by `chat_id + external_id`.
7. If not duplicated, insert into `chat_messages`.
8. Update `chats.updated_at`.

Required code organization:
- `server/utils/telegram.ts`
  - webhook verification
  - sending Telegram messages
  - optional helpers for payload normalization
- `server/api/telegram/webhook.post.ts`
  - main webhook handler
  - update parsing
  - object resolution
  - chat upsert
  - message persistence
- optional extraction helpers:
  - `server/utils/telegram-bindings.ts`
  - `server/utils/telegram-chat-sync.ts`
  - `server/utils/telegram-message-sync.ts`

Important product-specific behavior:
- The dashboard page `app/pages/chats.vue` already loads chats by `objectId`.
- The webhook implementation must therefore ensure every stored chat belongs to the correct object.
- Do not attach Telegram groups directly to `building_id`; building context is derived through `objects.building_id`.
- Keep the binding granularity at object level.
- Do not break existing outbound sending from `server/api/chats/[id]/messages.post.ts`.

Environment variables:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_DEFAULT_OBJECT_ID`
- `POSTGRES_HOST`
- `APP_INTERNAL_API_SECRET`

Ask for these deliverables:
- Complete Nuxt server implementation for webhook-based Telegram ingestion
- Any extracted helper utilities
- SQL needed to create or update `telegram_group_bindings`
- Optional admin API endpoints to manage bindings:
  - `GET /api/telegram/bindings`
  - `POST /api/telegram/bindings`
  - `PATCH /api/telegram/bindings/:id`
- Setup instructions for this product
- Notes about Telegram privacy mode and group permissions

Setup steps the answer must include:
1. Create the bot with BotFather.
2. Disable privacy mode if group-wide reading is required.
3. Add the bot to the Telegram group.
4. Grant required permissions for reading/sending messages.
5. Insert or manage a `telegram_group_bindings` row that maps the Telegram group id to the target object id.
6. Set the webhook URL and secret.
7. Verify that inbound messages appear on the object-specific chats page.

Telegram limitations the answer must explicitly mention:
- Bots do not automatically see every group message.
- Privacy mode affects visibility.
- Permissions differ between basic groups, supergroups, and channels.
- Channel reading/sending rules are different from regular group chats.

Output format required from the implementation:
- show final file structure
- provide complete code, not pseudo-code
- provide SQL
- provide setup steps
- explain how the binding maps Telegram groups into this product's building/object model
- keep it production-oriented and consistent with the existing repository structure
