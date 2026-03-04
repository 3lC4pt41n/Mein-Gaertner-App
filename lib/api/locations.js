import { supabase } from '../../supabase';

// Helper to ensure user is authenticated and return user id
async function getUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

// Create a new location
export async function createLocation(partial) {
  const user_id = await getUserId();
  const { data, error } = await supabase
    .from('locations')
    .insert([{ user_id, ...partial }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Update an existing location
export async function updateLocation(id, updates) {
  const user_id = await getUserId();
  const { data, error } = await supabase
    .from('locations')
    .update({ ...updates })
    .eq('id', id)
    .eq('user_id', user_id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Delete a location
export async function deleteLocation(id) {
  const user_id = await getUserId();
  const { error } = await supabase.from('locations').delete().eq('id', id).eq('user_id', user_id);
  if (error) throw error;
}

// List all locations for current user
export async function listLocations() {
  const user_id = await getUserId();
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
