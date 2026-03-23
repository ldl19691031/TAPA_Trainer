alter table public.videos
  add column if not exists storage_key text,
  add column if not exists source_url text,
  add column if not exists storage_provider text not null default 'r2';

create index if not exists idx_videos_storage_key on public.videos (storage_key);
