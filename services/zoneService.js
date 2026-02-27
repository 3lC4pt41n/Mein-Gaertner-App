import { supabase } from '../supabase';

export async function fetchZonesWithLocations() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht eingeloggt");

  // Eigene Locations holen
  const { data: locs, error: locErr } = await supabase
    .from("locations")
    .select("id, name, user_id")
    .eq("user_id", user.id);
  if (locErr) throw locErr;

  const locIds = (locs || []).map(l => l.id);
  if (locIds.length === 0) return [];

  // Zonen für eigene Locations laden
  const { data: zones, error: zoneErr } = await supabase
    .from("zones")
    .select("id, name, type, location_id")
    .in("location_id", locIds)
    .order("name");
  if (zoneErr) throw zoneErr;

  // Location-Objekt an jede Zone anhängen
  const locMap = {};
  locs.forEach(l => { locMap[l.id] = l; });

  return (zones || []).map(z => ({
    ...z,
    location: locMap[z.location_id] || null,
  }));
}

export function groupZonesByLocation(zonesList) {
  const groups = {};
  zonesList.forEach(z => {
    const locId = z.location?.id || z.location_id;
    if (!groups[locId]) {
      groups[locId] = {
        location: z.location,
        zones: []
      };
    }
    groups[locId].zones.push(z);
  });
  // Als Array zurückgeben (für SectionList)
  return Object.values(groups);
}
