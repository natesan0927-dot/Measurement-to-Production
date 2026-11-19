-- TITANS WINDOWS Measurement to Production: share jobs and settings between all phones and PCs.
-- Run once in Supabase (the same project as the quotation software):
--   SQL Editor -> New query -> paste all of this -> Run.
-- Safe to run again. Nothing in the quotation software's tables is touched.
--
-- NO LOGIN: as asked, the app reads and writes these tables without a login (the publishable key in the
-- web page is enough). Anyone who has the app's link can see and change the jobs, including customer names,
-- phone numbers and addresses. Logins can be added later without losing data.

-- one row per job; the whole job (windows, approvals, lots) is kept as it is in the app
create table if not exists public.m2p_jobs (
  id          text primary key,
  data        jsonb not null,
  deleted     boolean not null default false,       -- a deleted job stays as a marker so other devices remove it too
  updated_at  timestamptz not null default now()
);

-- settings shared by everyone (design codes, lists, standard colour/glass/section, 8 mm limit)
create table if not exists public.m2p_settings (
  key         text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- the time of every save is set by the server, so all devices agree on what is newest
create or replace function public.m2p_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists m2p_jobs_touch on public.m2p_jobs;
create trigger m2p_jobs_touch before insert or update on public.m2p_jobs for each row execute function public.m2p_touch();
drop trigger if exists m2p_settings_touch on public.m2p_settings;
create trigger m2p_settings_touch before insert or update on public.m2p_settings for each row execute function public.m2p_touch();
create index if not exists m2p_jobs_updated on public.m2p_jobs (updated_at);

-- job numbers M2P-0001, M2P-0002 ... handed out by the server, so two phones never get the same one
create sequence if not exists public.m2p_job_no;
create or replace function public.m2p_next_job_no(at_least integer default 0) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  n := nextval('public.m2p_job_no');
  if n <= at_least then                       -- numbers already used on phones before sharing started
    perform setval('public.m2p_job_no', at_least + 1);
    n := at_least + 1;
  end if;
  return n;
end $$;

-- access without a login (anon) and with one (authenticated): read, add and change; no hard deletes
alter table public.m2p_jobs enable row level security;
alter table public.m2p_settings enable row level security;
drop policy if exists "m2p jobs: read" on public.m2p_jobs;
drop policy if exists "m2p jobs: add" on public.m2p_jobs;
drop policy if exists "m2p jobs: change" on public.m2p_jobs;
create policy "m2p jobs: read" on public.m2p_jobs for select to anon, authenticated using (true);
create policy "m2p jobs: add" on public.m2p_jobs for insert to anon, authenticated with check (true);
create policy "m2p jobs: change" on public.m2p_jobs for update to anon, authenticated using (true) with check (true);
drop policy if exists "m2p settings: read" on public.m2p_settings;
drop policy if exists "m2p settings: add" on public.m2p_settings;
drop policy if exists "m2p settings: change" on public.m2p_settings;
create policy "m2p settings: read" on public.m2p_settings for select to anon, authenticated using (true);
create policy "m2p settings: add" on public.m2p_settings for insert to anon, authenticated with check (true);
create policy "m2p settings: change" on public.m2p_settings for update to anon, authenticated using (true) with check (true);
grant select, insert, update on public.m2p_jobs, public.m2p_settings to anon, authenticated;
grant execute on function public.m2p_next_job_no(integer) to anon, authenticated;
