alter table public.videos
  add column if not exists storage_key text,
  add column if not exists source_url text,
  add column if not exists storage_provider text not null default 'r2';

create index if not exists idx_videos_storage_key on public.videos (storage_key);

alter table public.videos
  alter column embed_url drop not null,
  alter column embed_url set default '';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'videos_provider_check'
      and conrelid = 'public.videos'::regclass
  ) then
    alter table public.videos drop constraint videos_provider_check;
  end if;
end $$;

alter table public.videos
  add constraint videos_provider_check
  check (provider in ('hosted'));
