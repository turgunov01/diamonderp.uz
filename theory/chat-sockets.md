# Theory: Realtime sockets for chats

## Goal
Add a WebSocket (or Postgres-backed realtime) channel per chat so messages deliver instantly to all open clients without manual refresh.

## Suggested stack
- Postgres-backed realtime (Postgres replication) or a dedicated WS server (Socket.IO / ws) behind Nuxt server middleware.
- Channel name convention: `chat:<chatId>`.
- Event types: `message:new`, `message:update`, `message:delete`, `chat:meta` (title/isGroup updates), optionally `typing`.

## Data flow
1. Client subscribes to `chat:<chatId>` when it opens a conversation; unsubscribes on close/route change.
2. Server emits to the channel on:
   - New message insert (from API POST /api/chats/:id/messages or Telegram webhook).
   - Delivery status change (sent→delivered/error).
   - Chat metadata change (rename/delete).
3. Client reducer updates local state (prepend/append), shows toast on errors, auto-scrolls only if user is near bottom.

## Back-end hooks
- In `messages.post` after DB insert, publish payload `{ chatId, message }` to `chat:<chatId>`.
- In Telegram webhook after saving inbound message, publish same event.
- On chat delete, emit `chat:deleted` so clients close the view and show banner.

## Security
- Require auth; scope channels by membership/tenant if applicable.
- For Postgres-backed realtime: configure RLS + row-level filters; for custom WS: verify session JWT before joining channel.

## Client handling
- use composable `useChatChannel(chatId)` that handles subscribe/unsubscribe and exposes `onEvent` callbacks.
- Debounce UI scroll; batch updates if many events arrive.

---

# Theory: Adding users to chats via sockets

## Goal
Allow adding/removing users in real time and notifying online members.

## Flow
1. API endpoint `POST /api/chats/:id/members` accepts userId(s); inserts into `chat_members` with chat_id/object_id.
2. Emit `member:added` event to `chat:<chatId>` with minimal profile (id, username/avatar if available).
3. Client updates member list badge and shows inline notice.
4. On remove: `DELETE /api/chats/:id/members/:userId` → emit `member:removed`.
5. Optionally: `typing` presence can reuse same channel with throttling.

## UI hooks
- When members change, refresh unread counters if you track per-user.
- In conversation header, show online indicators fed by a presence sub-channel `presence:chat:<chatId>`; update every 30–60s.

## DB considerations
- Ensure `chat_members` has indexes on (chat_id) and (user_id).
- For Postgres-backed realtime, listen on `chat_members` table filtered by chat_id.

---

# Notes
- Start with Postgres-backed notifications if you already have replication configured; otherwise Socket.IO behind `/api/socket` is fine.
- Keep payloads small; avoid sending full history—only deltas.
- Handle reconnect/backfill: on reconnect, refetch last N messages to close any gaps.
