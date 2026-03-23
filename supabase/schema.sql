create extension if not exists pgcrypto;

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  provider text not null check (provider in ('youtube', 'bilibili')),
  embed_url text not null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  start_sec numeric(10, 2) not null check (start_sec >= 0),
  end_sec numeric(10, 2) not null check (end_sec > start_sec),
  drivers text[] not null check (array_length(drivers, 1) >= 1),
  comment text null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_annotations_video_id on public.annotations (video_id);
create index if not exists idx_annotations_video_time on public.annotations (video_id, start_sec, end_sec);

alter table public.videos enable row level security;
alter table public.annotations enable row level security;

drop policy if exists videos_select_authenticated on public.videos;
create policy videos_select_authenticated
  on public.videos
  for select
  to authenticated
  using (true);

drop policy if exists videos_insert_authenticated on public.videos;
create policy videos_insert_authenticated
  on public.videos
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists videos_update_owner on public.videos;
create policy videos_update_owner
  on public.videos
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists videos_delete_owner on public.videos;
create policy videos_delete_owner
  on public.videos
  for delete
  to authenticated
  using (created_by = auth.uid());

drop policy if exists annotations_select_authenticated on public.annotations;
create policy annotations_select_authenticated
  on public.annotations
  for select
  to authenticated
  using (true);

drop policy if exists annotations_insert_authenticated on public.annotations;
create policy annotations_insert_authenticated
  on public.annotations
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists annotations_update_owner on public.annotations;
create policy annotations_update_owner
  on public.annotations
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists annotations_delete_owner on public.annotations;
create policy annotations_delete_owner
  on public.annotations
  for delete
  to authenticated
  using (user_id = auth.uid());
