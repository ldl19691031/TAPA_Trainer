alter table public.annotations
  add column if not exists face_box jsonb;

create index if not exists idx_annotations_face_box
  on public.annotations
  using gin (face_box);
