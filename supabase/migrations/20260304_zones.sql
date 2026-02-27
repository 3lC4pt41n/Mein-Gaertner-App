-- ============================================================
-- Zones: Bereiche innerhalb einer Location (Zimmer, Balkon …)
-- ============================================================

-- 1) Tabelle anlegen
create table if not exists public.zones (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name        text not null,
  type        text default 'room',          -- room | balcony | garden | greenhouse
  created_at  timestamptz default now()
);

-- 2) Row-Level-Security
alter table public.zones enable row level security;

create policy "Zones – owner via location"
  on public.zones for all
  using  (auth.uid() = (select user_id from public.locations where id = zones.location_id))
  with check (auth.uid() = (select user_id from public.locations where id = zones.location_id));

-- 3) Index für schnellen Lookup nach Location
create index if not exists idx_zones_location_id on public.zones(location_id);

-- 4) zone_id FK auf plants
alter table public.plants
  add column if not exists zone_id uuid references public.zones(id) on delete set null;

create index if not exists idx_plants_zone_id on public.plants(zone_id);
