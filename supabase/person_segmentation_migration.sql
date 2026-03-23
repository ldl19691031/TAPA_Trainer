create table if not exists public.video_person_frames (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos (id) on delete cascade,
  ts_sec numeric(10,2) not null check (ts_sec >= 0),
  track_id integer not null check (track_id >= 0),
  left_ratio numeric(8,5) not null check (left_ratio >= 0 and left_ratio <= 1),
  top_ratio numeric(8,5) not null check (top_ratio >= 0 and top_ratio <= 1),
  width_ratio numeric(8,5) not null check (width_ratio > 0 and width_ratio <= 1),
  height_ratio numeric(8,5) not null check (height_ratio > 0 and height_ratio <= 1),
  score numeric(6,5) null check (score >= 0 and score <= 1),
  mask_polygon jsonb null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (video_id, ts_sec, track_id)
);

create index if not exists idx_video_person_frames_video_ts
  on public.video_person_frames (video_id, ts_sec);

create index if not exists idx_video_person_frames_video_track
  on public.video_person_frames (video_id, track_id);

create index if not exists idx_video_person_frames_mask_polygon
  on public.video_person_frames using gin (mask_polygon);

alter table public.video_person_frames enable row level security;

drop policy if exists video_person_frames_select_authenticated on public.video_person_frames;
create policy video_person_frames_select_authenticated
  on public.video_person_frames
  for select
  to authenticated
  using (true);

drop policy if exists video_person_frames_insert_authenticated on public.video_person_frames;
create policy video_person_frames_insert_authenticated
  on public.video_person_frames
  for insert
  to authenticated
  with check (true);

drop policy if exists video_person_frames_update_authenticated on public.video_person_frames;
create policy video_person_frames_update_authenticated
  on public.video_person_frames
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists video_person_frames_delete_authenticated on public.video_person_frames;
create policy video_person_frames_delete_authenticated
  on public.video_person_frames
  for delete
  to authenticated
  using (true);

alter table public.annotations
  add column if not exists person_track_id integer,
  add column if not exists person_ts_sec numeric(10,2),
  add column if not exists person_box jsonb;

create index if not exists idx_annotations_person_track
  on public.annotations (video_id, person_track_id);

create index if not exists idx_annotations_person_ts
  on public.annotations (video_id, person_ts_sec);

create index if not exists idx_annotations_person_box
  on public.annotations using gin (person_box);
