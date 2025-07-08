-- 1) Tabellen anlegen
drop table if exists public.locations cascade;
create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users on delete cascade,
  name        text   not null,
  label       text,                 -- hübsch formatierte Adresse
  address     text,                 -- raw user input fallback
  lat         numeric(9,6),         --  ±0.11 m Genauigkeit
  lon         numeric(9,6),
  place_id    text,                 -- Provider-Schlüssel
  country     text,                 -- ISO-2 Code
  locality    text,                 -- Stadt / Ort
  postal_code text,
  created_at  timestamptz default now()
);

-- 2) Row-Level-Security
alter table public.locations enable row level security;
create policy "Locations – Self-own" on public.locations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
