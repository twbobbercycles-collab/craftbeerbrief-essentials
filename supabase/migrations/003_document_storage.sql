-- =============================================================================
-- Migration 003: License & Permit Document Storage
-- =============================================================================
-- Adds the brewery_documents table so users can track and retrieve their
-- license files, and configures a private Supabase Storage bucket with
-- per-brewery folder-level RLS so each brewery only accesses its own files.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run multiple times — uses IF NOT EXISTS and ON CONFLICT DO NOTHING.
-- =============================================================================

-- ── brewery_documents table ───────────────────────────────────────────────────

create table if not exists brewery_documents (
  id              uuid primary key default uuid_generate_v4(),
  brewery_id      uuid not null references breweries(id) on delete cascade,
  document_name   text not null,
  document_type   text not null check (document_type in (
    'federal_license',     -- Brewer's Notice and TTB documents
    'state_license',       -- State brewery and manufacturer licenses
    'taproom_permit',      -- Taproom and retail permits
    'health_permit',       -- Health department permits and inspections
    'insurance',           -- Insurance certificates and policies
    'local_permit',        -- Municipal and zoning permits
    'staff_certification', -- Staff alcohol service certifications
    'other'                -- Anything else
  )),
  file_path       text not null,      -- Storage path used to generate signed download URLs
  file_size       bigint,             -- File size in bytes for display
  file_url        text,               -- Reserved; populated for public buckets if needed
  expiration_date date,               -- Optional license/permit expiration date
  notes           text,               -- Free-text notes (max 500 chars enforced in app)
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Fast lookup of all documents for a brewery (primary access pattern)
create index if not exists brewery_documents_brewery_idx
  on brewery_documents(brewery_id);

-- Fast lookup of expiring documents for dashboard alerts
create index if not exists brewery_documents_expiration_idx
  on brewery_documents(brewery_id, expiration_date)
  where expiration_date is not null;

-- Reuse the set_updated_at() function defined in migration 001
create trigger brewery_documents_updated_at
  before update on brewery_documents
  for each row execute function set_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────

alter table brewery_documents enable row level security;

-- Each brewery can only see and manage its own documents
create policy "brewery_documents: all operations on own brewery"
  on brewery_documents for all
  using  (brewery_id = get_my_brewery_id())
  with check (brewery_id = get_my_brewery_id());

-- ── Supabase Storage bucket ───────────────────────────────────────────────────
-- Creates a private bucket so files require a signed URL to download.
-- File paths follow the pattern: {brewery_id}/{timestamp}_{filename}
-- The brewery_id folder segment is used in storage RLS policies below.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brewery-documents',
  'brewery-documents',
  false,        -- private: direct URL access is blocked; use createSignedUrl()
  10485760,     -- 10 MB maximum per file
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

-- ── Storage RLS policies ──────────────────────────────────────────────────────
-- Files are stored at: brewery_id/filename
-- (storage.foldername(name))[1] extracts the first path segment (the brewery_id)
-- and compares it to the current user's brewery_id from the users table.

create policy "storage: brewery users can read own files"
  on storage.objects for select
  using (
    bucket_id = 'brewery-documents'
    and (storage.foldername(name))[1] = (
      select brewery_id::text from public.users where id = auth.uid()
    )
  );

create policy "storage: brewery users can upload own files"
  on storage.objects for insert
  with check (
    bucket_id = 'brewery-documents'
    and (storage.foldername(name))[1] = (
      select brewery_id::text from public.users where id = auth.uid()
    )
  );

create policy "storage: brewery users can delete own files"
  on storage.objects for delete
  using (
    bucket_id = 'brewery-documents'
    and (storage.foldername(name))[1] = (
      select brewery_id::text from public.users where id = auth.uid()
    )
  );
