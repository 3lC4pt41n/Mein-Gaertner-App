import { supabase } from '../supabase';

// ── Task-Gewichte für Punkteberechnung ─────────────────────
// Schlüssel = die deutschen Strings, die in der DB gespeichert werden
const TASK_WEIGHTS = {
  'Gießen': 1,
  'Düngen': 2,
  'Umtopfen': 3,
  'Healthcheck': 1,
  'Sonstiges': 1,
};

function getTaskWeight(taskType) {
  return TASK_WEIGHTS[taskType] || 1;
}

// ── Gardening-Event loggen (intern) ────────────────────────
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

// ═══════════════════════════════════════════════════════════
// CRUD: Tasks
// ═══════════════════════════════════════════════════════════

/**
 * Tasks für eingeloggten User abrufen (inkl. Pflanzendaten).
 * Sortiert nach due_at aufsteigend.
 */
export async function fetchTasks(user_id) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, plant:plant_id(id, name, image_url)')
    .eq('user_id', user_id)
    .order('due_at', { ascending: true });
  if (error) throw error;
  return data;
}

/**
 * Einzelnen Task (mit Pflanzendetails) laden.
 */
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

/**
 * Task erstellen (einmalig).
 * State ist jetzt 'DUE' statt 'PENDING' – die UI zeigt Buttons nur bei DUE.
 */
export async function createTask({ plant_id, user_id, type, due_at, note }) {
  const { data, error } = await supabase
    .from('tasks')
    .insert([{ plant_id, user_id, type, due_at, note, state: 'DUE' }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Wiederkehrende Aufgabe anlegen:
 * 1. Task-Template erstellen (oder update bei conflict)
 * 2. Ersten Task sofort anlegen
 */
export async function createRecurringTask({ plant_id, user_id, type, due_at, note, interval_days }) {
  // 1. Template anlegen (UNIQUE auf user_id+plant_id+type)
  const { data: tpl, error: tplError } = await supabase
    .from('task_templates')
    .upsert({
      user_id,
      plant_id,
      type,
      interval_days,
      next_due_at: due_at,
      active: true,
    }, { onConflict: 'user_id,plant_id,type' })
    .select()
    .single();
  if (tplError) throw tplError;

  // 2. Ersten Task erzeugen
  const dedupeKey = `${tpl.id}:${new Date(due_at).toISOString().slice(0, 10)}`;
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .insert([{
      plant_id,
      user_id,
      type,
      due_at,
      note: note || `Alle ${interval_days} Tage`,
      state: 'DUE',
      template_id: tpl.id,
      dedupe_key: dedupeKey,
    }])
    .select()
    .single();

  // 23505 = duplicate key → Task existiert bereits (OK)
  if (taskError && taskError.code !== '23505') throw taskError;
  return { template: tpl, task };
}

/**
 * Task löschen
 */
export async function deleteTask(id, user_id) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)
    .eq('user_id', user_id);
  if (error) throw error;
}

/**
 * Task-Run-Historie für Task laden
 */
export async function fetchTaskRuns(task_id) {
  const { data, error } = await supabase
    .from('task_run')
    .select('*')
    .eq('task_id', task_id)
    .order('ts', { ascending: false });
  if (error) throw error;
  return data;
}

// ═══════════════════════════════════════════════════════════
// Task-Completion mit Auto-Rescheduling
// ═══════════════════════════════════════════════════════════

/**
 * Task als erledigt markieren + Run-Log + Score-Event.
 * Bei wiederkehrenden Tasks: automatisch nächsten Task erstellen.
 */
export async function completeTask(task, user_id) {
  // 1. Task als COMPLETED setzen
  const { error } = await supabase
    .from('tasks')
    .update({ state: 'COMPLETED' })
    .eq('id', task.id)
    .eq('user_id', user_id);
  if (error) throw error;

  // 2. Run-Log anlegen
  const { error: runError } = await supabase
    .from('task_run')
    .insert([{ task_id: task.id, action: 'completed', user_id }]);
  if (runError) throw runError;

  // 3. Gardening-Event loggen (Score-Tracking)
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

  // 4. Auto-Rescheduling bei Recurring Tasks
  if (task.template_id) {
    await rescheduleFromTemplate(task.template_id, task.due_at, user_id);
  }
}

/**
 * Task als übersprungen markieren (mit Grund).
 * Bei wiederkehrenden Tasks: trotzdem nächsten Task erstellen.
 */
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

  // Auto-Rescheduling bei Recurring Tasks
  if (task.template_id) {
    await rescheduleFromTemplate(task.template_id, task.due_at, user_id);
  }
}

// ═══════════════════════════════════════════════════════════
// Recurring-Task Logik
// ═══════════════════════════════════════════════════════════

/**
 * Berechnet nächstes Due-Date: interval_days ab dem späteren von
 * (geplantes due_at, jetzt). Verhindert "Drift in die Vergangenheit".
 */
export function computeNextDueAt(baseDueAt, intervalDays) {
  const base = new Date(Math.max(new Date(baseDueAt).getTime(), Date.now()));
  return new Date(base.getTime() + intervalDays * 86400000);
}

/**
 * Erzeugt idempotent die nächste Aufgabe für ein Template.
 * dedupe_key = template_id + ISO-Datum → ON CONFLICT DO NOTHING.
 */
async function rescheduleFromTemplate(templateId, completedDueAt, userId) {
  try {
    // 1. Template laden
    const { data: tpl, error: tplError } = await supabase
      .from('task_templates')
      .select('*')
      .eq('id', templateId)
      .eq('active', true)
      .single();

    if (tplError || !tpl) return; // Template nicht gefunden oder inaktiv

    // 2. Nächstes Due berechnen
    const nextDue = computeNextDueAt(completedDueAt, tpl.interval_days);
    const nextDueIso = nextDue.toISOString();
    const dedupeKey = `${templateId}:${nextDueIso.slice(0, 10)}`;

    // 3. Nächsten Task idempotent anlegen
    const { error: insertError } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        plant_id: tpl.plant_id,
        type: tpl.type,
        due_at: nextDueIso,
        state: 'DUE',
        template_id: templateId,
        dedupe_key: dedupeKey,
        note: `Alle ${tpl.interval_days} Tage`,
      });

    // 23505 = duplicate key → schon vorhanden (OK)
    if (insertError && insertError.code !== '23505') {
      console.warn('Reschedule insert error:', insertError.message);
    }

    // 4. Template next_due_at aktualisieren
    await supabase
      .from('task_templates')
      .update({ next_due_at: nextDueIso })
      .eq('id', templateId);

  } catch (e) {
    console.warn('rescheduleFromTemplate error:', e.message);
  }
}

/**
 * Catch-Up: Prüft beim App-Start, ob für aktive Templates
 * überfällige Tasks fehlen und legt sie nach.
 * Ersetzt pg_cron – pragmatisch für kleine User-Zahlen.
 */
export async function catchUpMissedTasks(userId) {
  try {
    // Aktive Templates, deren next_due_at in der Vergangenheit liegt
    const { data: templates, error } = await supabase
      .from('task_templates')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .lte('next_due_at', new Date().toISOString());

    if (error || !templates?.length) return;

    for (const tpl of templates) {
      // Prüfen ob bereits ein offener Task existiert
      const { data: openTasks } = await supabase
        .from('tasks')
        .select('id')
        .eq('template_id', tpl.id)
        .eq('state', 'DUE')
        .limit(1);

      if (openTasks?.length > 0) continue; // Schon ein offener Task vorhanden

      // Überfälligen Task nachlegen
      const dedupeKey = `${tpl.id}:${new Date(tpl.next_due_at).toISOString().slice(0, 10)}`;
      const { error: insertError } = await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          plant_id: tpl.plant_id,
          type: tpl.type,
          due_at: tpl.next_due_at,
          state: 'DUE',
          template_id: tpl.id,
          dedupe_key: dedupeKey,
          note: `Alle ${tpl.interval_days} Tage`,
        });

      if (insertError && insertError.code !== '23505') {
        console.warn('CatchUp insert error:', insertError.message);
      }
    }
  } catch (e) {
    console.warn('catchUpMissedTasks error:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════
// Template-Management
// ═══════════════════════════════════════════════════════════

/**
 * Aktive Templates für den User abrufen (mit Pflanzennamen).
 */
export async function fetchTemplates(userId) {
  const { data, error } = await supabase
    .from('task_templates')
    .select('*, plant:plant_id(id, name)')
    .eq('user_id', userId)
    .eq('active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * Template deaktivieren (soft delete).
 */
export async function deactivateTemplate(templateId, userId) {
  const { error } = await supabase
    .from('task_templates')
    .update({ active: false })
    .eq('id', templateId)
    .eq('user_id', userId);
  if (error) throw error;
}
