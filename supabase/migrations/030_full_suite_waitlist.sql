-- Full Suite waitlist — stores emails from users who want to be notified when Full Suite launches.
-- RLS: anyone can insert; no select policy for regular users (service role reads for admin).

create table if not exists full_suite_waitlist (
  id           uuid        primary key default gen_random_uuid(),
  email        text        not null,
  brewery_name text,
  created_at   timestamptz not null default now()
);

alter table full_suite_waitlist enable row level security;

-- Anyone (authenticated or anonymous) can join the waitlist
create policy "Anyone can join waitlist"
  on full_suite_waitlist
  for insert
  with check (true);

-- No select policy for regular users — only service role (admin) can read entries
