import { supabase } from '../supabase';

export async function fetchZonesWithLocations() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht eingeloggt");

  const { data, error } = await supabase
    .from("zones")
    .select("id,name,type,location:locations(id,name,user_id)")
    .order("name");

  if (error) throw error;

  // Nur eigene Locations filtern (falls du das nicht schon im Query machst)
  const userZones = data.filter(z => z.location?.user_id === user.id);

  return userZones;
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
