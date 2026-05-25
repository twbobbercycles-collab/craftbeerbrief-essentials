-- 035_playbook.sql
-- Tracks document generation activity for the Full Suite Regulation Playbook module.
-- Each row records one document a brewery generated, what template it used, and the
-- brewery-specific data that was submitted — useful for audit trails and analytics.

create table if not exists playbook_generations (
  id             uuid        primary key default gen_random_uuid(),
  brewery_id     uuid        not null references breweries(id) on delete cascade,
  template_id    text        not null,
  template_name  text,
  generated_at   timestamptz not null default now(),
  brewery_data   jsonb       -- the field values submitted when the document was generated
);

create index if not exists idx_playbook_generations_brewery_id
  on playbook_generations(brewery_id);

create index if not exists idx_playbook_generations_template_id
  on playbook_generations(brewery_id, template_id);

alter table playbook_generations enable row level security;

create policy "brewery members can view their own playbook generations"
  on playbook_generations for select
  using (
    brewery_id = (select brewery_id from users where id = auth.uid())
  );

-- Insertions are handled by the Edge Function using the service role key,
-- so no INSERT policy is needed here (service role bypasses RLS).
