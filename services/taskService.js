import { supabase } from '../supabase';
import { addAutoDiaryEntry } from './diaryService';
import { getTaskWeight, computeNextDueAt } from './scoringHelpers';
import { requestWithPolicy } from './networkPolicy';
import {
  ACTIVE_TASK_STATES,
  filterAndSortVisibleTasks,
  getTaskRetentionCutoff,
} from './taskRetention';
import { t } from '../i18n';

// Re-export for backwards compatibility and tests
export { getTaskWeight, calcTaskPoints, calcSkipPoints, computeNextDueAt } from './scoringHelpers';
export {
  filterAndSortVisibleTasks,
  getTaskRetentionCutoff,
  isTaskPastRetention,
  STALE_TASK_OVERDUE_DAYS,
} from './taskRetention';

// ── Gardening-Event loggen (intern) ────────────────────────
async function logGardeningEvent({ userId, eventType, plantId, taskId, points, meta = {} }) {
  const { error } = await supabase.from('gardening_events').insert({
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
 * Tasks fuer eingeloggten User abrufen (inkl. Pflanzendaten).
 * Tasks mit Faelligkeitsdatum aelter als 7 Tage werden aus der
 * aktiven Ansicht genommen. Fuer wiederkehrende offene Tasks erzeugt
 * catchUpMissedTasks() anschliessend den naechsten sinnvollen Termin.
 */
const PAGE_SIZE = 50;

function isMissingTasksNoteColumnError(error) {
  const msg = (error?.message || '').toLowerCase();
  return (
    msg.includes('tasks') &&
    msg.includes('note') &&
    (msg.includes('schema cache') || msg.includes('column'))
  );
}

function payloadContainsNote(payload) {
  if (Array.isArray(payload)) {
    return payload.some((row) => Object.prototype.hasOwnProperty.call(row || {}, 'note'));
  }
  return Object.prototype.hasOwnProperty.call(payload || {}, 'note');
}

function stripNoteField(payload) {
  if (Array.isArray(payload)) {
    return payload.map((row) => {
      const rest = { ...(row || {}) };
      delete rest.note;
      return rest;
    });
  }
  const rest = { ...(payload || {}) };
  delete rest.note;
  return rest;
}

async function insertTasksWithNoteFallback(payload, { single = false } = {}) {
  let query = supabase.from('tasks').insert(payload);
  if (single) query = query.select().single();

  let { data, error } = await query;
  if (!error || !payloadContainsNote(payload) || !isMissingTasksNoteColumnError(error)) {
    return { data, error };
  }

  const payloadWithoutNote = stripNoteField(payload);
  let retryQuery = supabase.from('tasks').insert(payloadWithoutNote);
  if (single) retryQuery = retryQuery.select().single();

  const retryResult = await retryQuery;
  if (!retryResult.error) {
    console.warn(
      '[taskService] tasks.note missing in PostgREST schema cache; insert retried without note.'
    );
  }
  return retryResult;
}

function isMissingCompleteTaskRpcError(error) {
  const msg = (error?.message || '').toLowerCase();
  return (
    error?.code === '42883' ||
    error?.code === 'PGRST202' ||
    (msg.includes('complete_task_rpc') &&
      (msg.includes('schema cache') || msg.includes('function')))
  );
}

function isCompleteTaskRpcSchemaDriftError(error) {
  const msg = (error?.message || '').toLowerCase();
  return msg.includes('updated_at') && msg.includes('tasks') && msg.includes('does not exist');
}

export async function fetchTasks(user_id, { page = 0 } = {}) {
  return requestWithPolicy(
    async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const cutoffIso = getTaskRetentionCutoff().toISOString();
      const retainedTaskFilter = ['due_at.is.null', `due_at.gte.${cutoffIso}`].join(',');
      const { data, error, count } = await supabase
        .from('tasks')
        .select('*, plant:plant_id(id, name, image_url)', { count: 'exact' })
        .eq('user_id', user_id)
        .or(retainedTaskFilter)
        .order('due_at', { ascending: true })
        .range(from, to);
      if (error) throw error;
      return { data: filterAndSortVisibleTasks(data), hasMore: count > to + 1, total: count };
    },
    { label: 'tasks.fetch', timeout: 10000, retries: 1 }
  );
}

/**
 * Einzelnen Task (mit Pflanzendetails) laden.
 */
export async function fetchTask(task_id, user_id) {
  return requestWithPolicy(
    async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, plant:plant_id(*)')
        .eq('id', task_id)
        .eq('user_id', user_id)
        .single();
      if (error) throw error;
      return data;
    },
    { label: 'tasks.fetchOne', timeout: 10000, retries: 1 }
  );
}

/**
 * Task erstellen (einmalig).
 * State ist jetzt 'DUE' statt 'PENDING' – die UI zeigt Buttons nur bei DUE.
 */
export async function createTask({ plant_id, user_id, type, due_at, note }) {
  const { data, error } = await insertTasksWithNoteFallback(
    [{ plant_id, user_id, type, due_at, note, state: 'DUE' }],
    { single: true }
  );
  if (error) throw error;
  return data;
}

/**
 * Wiederkehrende Aufgabe anlegen:
 * 1. Task-Template erstellen (oder update bei conflict)
 * 2. Ersten Task sofort anlegen
 */
export async function createRecurringTask({
  plant_id,
  user_id,
  type,
  due_at,
  note,
  interval_days,
}) {
  // 1. Template anlegen (UNIQUE auf user_id+plant_id+type)
  const { data: tpl, error: tplError } = await supabase
    .from('task_templates')
    .upsert(
      {
        user_id,
        plant_id,
        type,
        interval_days,
        next_due_at: due_at,
        active: true,
      },
      { onConflict: 'user_id,plant_id,type' }
    )
    .select()
    .single();
  if (tplError) throw tplError;

  // 2. Ersten Task erzeugen
  const dedupeKey = `${tpl.id}:${new Date(due_at).toISOString().slice(0, 10)}`;
  const { data: task, error: taskError } = await insertTasksWithNoteFallback(
    [
      {
        plant_id,
        user_id,
        type,
        due_at,
        note: note || t('tasks.everyNDays', { days: interval_days }),
        state: 'DUE',
        template_id: tpl.id,
        dedupe_key: dedupeKey,
      },
    ],
    { single: true }
  );

  // 23505 = duplicate key → Task existiert bereits (OK)
  if (taskError && taskError.code !== '23505') throw taskError;
  return { template: tpl, task };
}

/**
 * Task löschen
 */
export async function deleteTask(id, user_id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id).eq('user_id', user_id);
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
  const { data, error } = await supabase.rpc('complete_task_rpc', { p_task_id: task.id });

  if (!error) return data;
  if (!isMissingCompleteTaskRpcError(error) && !isCompleteTaskRpcSchemaDriftError(error)) {
    throw error;
  }

  console.warn('[taskService] complete_task_rpc nicht nutzbar; verwende Legacy-Completion.');
  return completeTaskLegacy(task, user_id);
}

async function completeTaskLegacy(task, user_id) {
  // 1. Task als COMPLETED setzen — nur wenn noch DUE (idempotent)
  const { data: updated, error } = await supabase
    .from('tasks')
    .update({ state: 'COMPLETED' })
    .eq('id', task.id)
    .eq('user_id', user_id)
    .eq('state', 'DUE')
    .select('id');
  if (error) throw error;
  // Already completed/skipped — no-op to prevent double-scoring
  if (!updated || updated.length === 0) return;

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

  // 4. Auto-diary entry for task completion
  if (task.plant_id) {
    addAutoDiaryEntry({
      plant_id: task.plant_id,
      user_id: user_id,
      type: 'task',
      title: t('tasks.completedDiary', { type: t('tasks.taskTypes.' + task.type) }),
      note: task.note || null,
      meta: { task_type: task.type, late: isLate },
    }).catch((e) => console.warn('Diary auto-entry error:', e.message));
  }

  // 5. Auto-Rescheduling bei Recurring Tasks
  if (task.template_id) {
    await rescheduleFromTemplate(task.template_id, task.due_at, user_id);
  }
}

/**
 * Task als übersprungen markieren (mit Grund).
 * Bei wiederkehrenden Tasks: trotzdem nächsten Task erstellen.
 */
export async function skipTask(task, user_id, reason = '') {
  // Only skip if still DUE (idempotent — prevents double-scoring)
  const { data: updated, error } = await supabase
    .from('tasks')
    .update({ state: 'SKIPPED' })
    .eq('id', task.id)
    .eq('user_id', user_id)
    .eq('state', 'DUE')
    .select('id');
  if (error) throw error;
  if (!updated || updated.length === 0) return;

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

// computeNextDueAt ist jetzt in scoringHelpers.js definiert und wird oben re-exportiert

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
    const { error: insertError } = await insertTasksWithNoteFallback({
      user_id: userId,
      plant_id: tpl.plant_id,
      type: tpl.type,
      due_at: nextDueIso,
      state: 'DUE',
      template_id: templateId,
      dedupe_key: dedupeKey,
      note: t('tasks.everyNDays', { days: tpl.interval_days }),
    });

    // 23505 = duplicate key → schon vorhanden (OK)
    if (insertError && insertError.code !== '23505') {
      console.warn('Reschedule insert error:', insertError.message);
    }

    // 4. Template next_due_at aktualisieren
    await supabase.from('task_templates').update({ next_due_at: nextDueIso }).eq('id', templateId);
  } catch (e) {
    console.warn('rescheduleFromTemplate error:', e.message);
  }
}

export async function archiveStaleDueTasks(userId) {
  const cutoffIso = getTaskRetentionCutoff().toISOString();
  const { data: staleTasks, error } = await supabase
    .from('tasks')
    .select('id, user_id, plant_id, type, due_at, state, template_id')
    .eq('user_id', userId)
    .in('state', ACTIVE_TASK_STATES)
    .lt('due_at', cutoffIso)
    .limit(100);

  if (error || !staleTasks?.length) {
    if (error) console.warn('archiveStaleDueTasks fetch error:', error.message);
    return 0;
  }

  let archived = 0;
  for (const task of staleTasks) {
    const { data: updated, error: updateError } = await supabase
      .from('tasks')
      .update({ state: 'EXPIRED' })
      .eq('id', task.id)
      .eq('user_id', userId)
      .in('state', ACTIVE_TASK_STATES)
      .select('id');

    if (updateError) {
      console.warn('archiveStaleDueTasks update error:', updateError.message);
      continue;
    }
    if (!updated?.length) continue;

    archived += 1;
    if (task.template_id) {
      await rescheduleFromTemplate(task.template_id, task.due_at, userId);
    }
  }

  return archived;
}

/**
 * Catch-Up: Prüft beim App-Start, ob für aktive Templates
 * überfällige Tasks fehlen und legt sie nach.
 * Ersetzt pg_cron – pragmatisch für kleine User-Zahlen.
 */
export async function catchUpMissedTasks(userId) {
  try {
    await archiveStaleDueTasks(userId);

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
      const { error: insertError } = await insertTasksWithNoteFallback({
        user_id: userId,
        plant_id: tpl.plant_id,
        type: tpl.type,
        due_at: tpl.next_due_at,
        state: 'DUE',
        template_id: tpl.id,
        dedupe_key: dedupeKey,
        note: t('tasks.everyNDays', { days: tpl.interval_days }),
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
