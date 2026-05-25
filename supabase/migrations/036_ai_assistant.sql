-- 036_ai_assistant.sql
-- Tracks per-user daily message usage and stores chat conversation history
-- for the brewery-specific AI assistant widget.

-- Tracks how many messages a user has sent today so we can enforce daily limits.
create table if not exists assistant_usage (
  id           uuid    primary key default gen_random_uuid(),
  user_id      uuid    not null references auth.users(id) on delete cascade,
  brewery_id   uuid    references breweries(id) on delete cascade,
  usage_date   date    not null default current_date,
  message_count integer not null default 0,
  unique (user_id, usage_date)
);

create index if not exists idx_assistant_usage_user_date
  on assistant_usage(user_id, usage_date);

alter table assistant_usage enable row level security;

create policy "users can read their own assistant usage"
  on assistant_usage for select
  using (user_id = auth.uid());

-- Stores full conversation histories so they can be retrieved across sessions.
-- The messages array is a JSONB array of {role, content, timestamp} objects.
create table if not exists assistant_conversations (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  brewery_id uuid        references breweries(id) on delete cascade,
  messages   jsonb       not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_assistant_conversations_user_id
  on assistant_conversations(user_id);

alter table assistant_conversations enable row level security;

create policy "users can read their own assistant conversations"
  on assistant_conversations for select
  using (user_id = auth.uid());
