alter table public.annotations
  add column if not exists thumb_base64 text;
