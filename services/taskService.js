import { supabase } from '../supabase';

// Task-Gewichte für Punkteberechnung
const TASK_WEIGHTS = {
  watering: 1,    // gießen
  fertilizing: 2, // düngen
  repotting: 3,   // umtopfen
};

function getTaskWeight(taskType) {
  return TASK_WEIGHTS[taskType] || 1;
}

/**
 * Gardening-Event loggen (intern).
 */
async function logGardeningEvent({ userId, eventType, plantId, taskId, points, meta = {} }) {
  const { error } = await supabase
    .from('gardening_events')
    .insert({
      user_id: userId,
      event_type: eventType,
      plant_id: plantId,
      task_id: taskId,
      points,
      meta,
    });
  if (error) console.warn('gardening_event log error:', error.message);
}

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

  // Gardening-Event loggen (Score-Tracking)
  const weight = getTaskWeight(task.type);
  const isLate = task.due_at && new Date(task.due_at) < new Date();
  const eventType = isLate ? 'task_completed_late' : 'task_completed_on_time';
  const points = isLate ? 0.4 * weight : 1.0 * weight;

  await logGardeningEvent({
    userId: user_id,
    eventType,
    plantId: task.plant_id,
    taskId: task.id,
    points,
    meta: { task_type: task.type, weight, late: isLate },
  });
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

  // Gardening-Event loggen (negative Punkte)
  const weight = getTaskWeight(task.type);
  const points = -0.6 * weight;

  await logGardeningEvent({
    userId: user_id,
    eventType: 'task_skipped',
    plantId: task.plant_id,
    taskId: task.id,
    points,
    meta: { task_type: task.type, weight, reason },
  });
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
