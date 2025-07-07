import { supabase } from '../supabase';

// Tasks für eingeloggten User abrufen (inkl. Pflanzendaten)
export async function fetchTasks(user_id) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, plant:plant_id(name, image_url)')
    .eq('user_id', user_id)
    .order('due_at', { ascending: true });
  if (error) throw error;
  return data;
}

// Task als erledigt markieren und Run-Log schreiben
export async function completeTask(task, user_id) {
  // Task als completed setzen
  const { error } = await supabase
    .from('tasks')
    .update({ state: 'COMPLETED' })
    .eq('id', task.id)
    .eq('user_id', user_id);
  if (error) throw error;
  // Run-Log anlegen
  const { error: runError } = await supabase
    .from('task_run')
    .insert([{ task_id: task.id, action: 'completed', user_id }]);
  if (runError) throw runError;
}

// Task als skipped markieren (mit Grund)
export async function skipTask(task, user_id, reason = "") {
  const { error } = await supabase
    .from('tasks')
    .update({ state: 'SKIPPED' })
    .eq('id', task.id)
    .eq('user_id', user_id);
  if (error) throw error;
  const { error: runError } = await supabase
    .from('task_run')
    .insert([{ task_id: task.id, action: 'skipped', details: { reason }, user_id }]);
  if (runError) throw runError;
}

// Einzelnen Task (mit Pflanzendetails) laden
export async function fetchTask(task_id, user_id) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, plant:plant_id(*)')
    .eq('id', task_id)
    .eq('user_id', user_id)
    .single();
  if (error) throw error;
  return data;
}

// Task erstellen
export async function createTask({ plant_id, user_id, type, due_at, note }) {
  const { data, error } = await supabase
    .from('tasks')
    .insert([{ plant_id, user_id, type, due_at, note, state: 'PENDING' }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Task löschen
export async function deleteTask(id, user_id) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)
    .eq('user_id', user_id);
  if (error) throw error;
}

// Task-Run-Historie für Task laden (optional)
export async function fetchTaskRuns(task_id) {
  const { data, error } = await supabase
    .from('task_run')
    .select('*')
    .eq('task_id', task_id)
    .order('ts', { ascending: false });
  if (error) throw error;
  return data;
}
