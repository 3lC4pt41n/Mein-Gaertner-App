// Edge Function: Chat mit Ben (Pflanzen-Coach)
// Hybrid: PlantNet API für Bildidentifikation + GPT-5.5 für Konversation
// POST Body: { text?: string, image_url?: string, language?: string }
// History wird server-seitig aus der DB geladen (nicht mehr vom Client gesendet)
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2.50.2';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { callOpenAI } from '../_shared/openai.ts';
import { identifyPlantFromUrl, formatPlantNetContext } from '../_shared/plantnet.ts';
import {
  CREDIT_COSTS,
  deductCreditsAtomic,
  refundCredits,
  logUsage,
  getUserIdFromAuth,
} from '../_shared/credits.ts';
import { getLanguagePromptName, getUserLanguage } from '../_shared/language.ts';
import { estimateTokens, selectMessagesWithinBudget } from '../_shared/tokens.ts';
import {
  validateText,
  validateImageUrl,
  validateLanguage,
  validationErrorResponse,
} from '../_shared/validate.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { getCorsHeaders, rejectDisallowedOrigin } from '../_shared/cors.ts';

// ─── Garden Context: Pflanzen, Healthchecks, Tasks laden ────────────

function truncateText(value: unknown, maxLength = 120): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function findDetailsValue(source: Record<string, unknown>, keys: string[]): string | null {
  const entries = Object.entries(source || {});
  for (const expectedKey of keys) {
    const normalizedExpected = expectedKey.toLowerCase();
    const match = entries.find(([key]) => key.toLowerCase().includes(normalizedExpected));
    const value = match?.[1];
    const text = truncateText(value, 80);
    if (text) return text;
  }
  return null;
}

function summarizePlantDetails(details: unknown): string | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;

  const typedDetails = details as Record<string, any>;
  const overview = typedDetails.overview || {};
  const care = typedDetails.care || {};
  const parts: string[] = [];

  const commonName = findDetailsValue(overview, [
    'Deutscher Name',
    'Common Name',
    'Nom commun',
    'Nome comune',
    'Nombre común',
    'Обычное название',
    'Yaygın ad',
  ]);
  const growthType = findDetailsValue(overview, [
    'Lebensform',
    'Growth Type',
    'Type de croissance',
    'Tipo di crescita',
    'Tipo de crecimiento',
    'Форма роста',
    'Büyüme tipi',
  ]);
  const light = findDetailsValue(care, ['Licht', 'Light', 'Lumière', 'Luce', 'Luz', 'Свет', 'Işık']);
  const watering = findDetailsValue(care, [
    'Gießen',
    'Watering',
    'Arrosage',
    'Annaffiatura',
    'Riego',
    'Полив',
    'Sulama',
  ]);
  const temperature = findDetailsValue(care, [
    'Temperatur',
    'Temperature',
    'Température',
    'Temperatura',
    'Температура',
    'Sıcaklık',
  ]);
  const specialNotes = findDetailsValue(care, [
    'Besondere Hinweise',
    'Special Notes',
    'Notes particulières',
    'Note speciali',
    'Notas especiales',
    'Особые примечания',
    'Özel notlar',
  ]);

  if (commonName) parts.push(`Name: ${commonName}`);
  if (growthType) parts.push(`Typ: ${growthType}`);
  if (light) parts.push(`Licht: ${light}`);
  if (watering) parts.push(`Wasser: ${watering}`);
  if (temperature) parts.push(`Temperatur: ${temperature}`);
  if (specialNotes) parts.push(`Hinweis: ${specialNotes}`);

  return parts.length ? parts.slice(0, 5).join('; ') : null;
}

type UserZone = {
  id: string;
  name: string;
  type: string;
  locationId: string;
  locationName: string;
  displayName: string;
};

function formatLocationName(location: any): string {
  return (
    truncateText(location?.name, 60) ||
    truncateText(location?.label, 60) ||
    truncateText(location?.locality, 60) ||
    'Zuhause'
  );
}

function formatZoneDisplayName(zone: UserZone): string {
  return `${zone.locationName} › ${zone.name} (${zone.type})`;
}

function formatNameList(values: string[], maxItems = 24): string {
  const visible = values.slice(0, maxItems);
  const rest = values.length - visible.length;
  return rest > 0 ? `${visible.join(', ')} (+${rest} weitere)` : visible.join(', ');
}

function formatTaskDueDate(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'ohne Datum';
  const due = new Date(value);
  if (isNaN(due.getTime())) return 'ohne Datum';
  return `${String(due.getDate()).padStart(2, '0')}.${String(due.getMonth() + 1).padStart(2, '0')}.`;
}

function formatTaskForContext(task: any): string {
  const due = task?.due_at ? new Date(task.due_at) : null;
  const overdue = due && !isNaN(due.getTime()) && due < new Date();
  return `${task.type} (fällig ${formatTaskDueDate(task.due_at)}${overdue ? ', OVERDUE' : ''})`;
}

async function loadUserZones(
  serviceClient: SupabaseClient,
  userId: string
): Promise<UserZone[]> {
  const { data: locations } = await serviceClient
    .from('locations')
    .select('id, name, label, locality')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  const locationRows = locations || [];
  const locationIds = locationRows.map((location: any) => location.id).filter(Boolean);
  if (locationIds.length === 0) return [];

  const locationMap = new Map(
    locationRows.map((location: any) => [
      location.id,
      {
        ...location,
        displayName: formatLocationName(location),
      },
    ])
  );

  const { data: zones } = await serviceClient
    .from('zones')
    .select('id, name, type, location_id')
    .in('location_id', locationIds)
    .order('name', { ascending: true });

  return (zones || []).map((zone: any) => {
    const location = locationMap.get(zone.location_id);
    const locationName = location?.displayName || 'Zuhause';
    return {
      id: zone.id,
      name: zone.name,
      type: zone.type || 'room',
      locationId: zone.location_id,
      locationName,
      displayName: `${locationName} › ${zone.name} (${zone.type || 'room'})`,
    };
  });
}

function matchZoneByName(
  zones: UserZone[],
  requestedName: string
): { zone: UserZone | null; error?: string } {
  const query = requestedName.trim().toLowerCase();
  const exactMatches = zones.filter(
    (zone) => zone.name.toLowerCase() === query || zone.displayName.toLowerCase() === query
  );
  const matches =
    exactMatches.length > 0
      ? exactMatches
      : zones.filter(
          (zone) =>
            zone.name.toLowerCase().includes(query) ||
            zone.displayName.toLowerCase().includes(query)
        );

  if (matches.length === 1) return { zone: matches[0] };

  const availableZones = zones.map((zone) => zone.displayName);
  if (matches.length === 0) {
    return {
      zone: null,
      error: `Zone "${requestedName}" not found. Available zones: ${formatNameList(availableZones)}`,
    };
  }

  return {
    zone: null,
    error: `Zone "${requestedName}" is ambiguous. Available matches: ${formatNameList(matches.map((zone) => zone.displayName))}`,
  };
}

async function loadGardenContext(serviceClient: SupabaseClient, userId: string): Promise<string> {
  // Pflanzen laden
  const { data: plants } = await serviceClient
    .from('plants')
    .select('id, name, note, zone_id, details, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (!plants || plants.length === 0) {
    return 'The user has no plants registered yet. Encourage them to add their first plant.';
  }

  // Letzter Healthcheck pro Pflanze
  const plantIds = plants.map((p: any) => p.id);
  const { data: healthchecks } = await serviceClient
    .from('plant_healthchecks')
    .select('plant_id, healthscore, summary, recommendation, created_at')
    .in('plant_id', plantIds)
    .order('created_at', { ascending: false });

  const latestHC: Record<string, any> = {};
  for (const hc of healthchecks || []) {
    if (!latestHC[hc.plant_id]) {
      latestHC[hc.plant_id] = hc;
    }
  }

  // Faellige Tasks
  const { data: tasks } = await serviceClient
    .from('tasks')
    .select('id, plant_id, type, due_at, state, note, template_id')
    .eq('user_id', userId)
    .in('state', ['DUE', 'OPEN'])
    .order('due_at', { ascending: true })
    .limit(20);

  const tasksByPlant: Record<string, any[]> = {};
  for (const t of tasks || []) {
    if (!tasksByPlant[t.plant_id]) tasksByPlant[t.plant_id] = [];
    tasksByPlant[t.plant_id].push(t);
  }

  // Zonen + Zuhause
  const userZones = await loadUserZones(serviceClient, userId);
  const zoneMap: Record<string, string> = {};
  for (const zone of userZones) {
    zoneMap[zone.id] = formatZoneDisplayName(zone);
  }

  // Kompaktes Text-Format
  let context = `USER'S GARDEN (${plants.length} plants):\n`;
  const unassignedPlants: string[] = [];
  for (const plant of plants) {
    const hc = latestHC[plant.id];
    const plantTasks = tasksByPlant[plant.id] || [];
    const zone = plant.zone_id ? zoneMap[plant.zone_id] : null;
    const note = truncateText(plant.note, 120);
    const details = summarizePlantDetails(plant.details);
    if (!zone) unassignedPlants.push(plant.name);

    context += `- ${plant.name}`;
    if (zone) context += ` [${zone}]`;
    if (note) context += ` | Notiz: ${note}`;
    if (details) context += ` | Details: ${details}`;
    if (hc) {
      const daysAgo = Math.floor((Date.now() - new Date(hc.created_at).getTime()) / 86400000);
      context += ` | Health: ${hc.healthscore}/100 (${daysAgo}d ago)`;
      const healthTip = truncateText(hc.recommendation || hc.summary, 140);
      if (healthTip) context += ` | Tip: ${healthTip}`;
    }
    if (plantTasks.length > 0) {
      const taskStr = plantTasks
        .map((t: any) => formatTaskForContext(t))
        .join(', ');
      context += ` | Tasks: ${taskStr}`;
    }
    context += '\n';
  }

  if (unassignedPlants.length > 0) {
    context += `OHNE ZONE (${unassignedPlants.length} Pflanzen): ${formatNameList(unassignedPlants)}\n`;
  }

  return context;
}

// ─── System Prompt mit Garden Context ────────────

function buildSystemPrompt(
  languagePromptName: string,
  gardenContext: string,
  memorySummary: string | null,
  plantNetContext: string | null = null,
  externalContext: string | null = null
): string {
  let prompt = `## ROLE
You are "Ben", a smart, witty and charming plant coach. Expert in plants and gardening.
Playful but always respectful, friendly and encouraging.

## STYLE
- Chat style (like WhatsApp), concise (max 5 sentences).
- Respond strictly in ${languagePromptName}. Use exactly one language only.
- If the user sends an image, react specifically to what is visible.

## ${gardenContext}

## BEHAVIOR
- Reference the user's specific plants by name when relevant.
- If they ask about a plant problem, check if a healthcheck exists and reference it.
- If tasks are overdue, gently remind them.
- If they have no plants yet, encourage them to add their first plant via the scan feature.
- For plant diagnosis: ask about light, watering frequency, and recent changes before guessing.
- Never recommend chemical pesticides without first suggesting natural alternatives.
- If unsure, ask a follow-up question rather than guessing.
- Use current weather, season, time of day and location when relevant. Do not force it into every answer.
- If the user asks for the current time or date, answer directly from CURRENT CONTEXT.

## TOOLS
- You can create tasks for the user using the create_task and create_recurring_task functions.
- You can complete due tasks using complete_task and reschedule due tasks using reschedule_task.
- You can assign an existing plant to an existing zone using assign_plant_to_zone.
- When the user asks you to remind them, schedule something, or create a care plan, use these tools.
- When the user asks you to sort or move a plant into a room/zone, use assign_plant_to_zone.
- When the user says they completed a care action, use complete_task.
- When the user asks to move a due date, use reschedule_task.
- After creating a task, confirm what you created in a friendly message.
- For recurring tasks, suggest reasonable intervals based on plant type and season.`;

  if (externalContext) {
    prompt += `\n\n## CURRENT CONTEXT\n${externalContext}`;
  }

  if (plantNetContext) {
    prompt += `\n\n## PLANT IDENTIFICATION (from the user's latest image)\n${plantNetContext}
- Use this identification to inform your response about the plant in the image.
- If the identification is confident (>50%), reference the plant by its name.
- If uncertain, mention what it might be and ask the user for more details.`;
  }

  if (memorySummary) {
    prompt += `\n\n## PREVIOUS CONVERSATION CONTEXT\n${memorySummary}`;
  }

  return prompt;
}

function buildExternalContext(contextText: unknown, context: any): string | null {
  if (typeof contextText === 'string' && contextText.trim()) {
    return contextText.trim();
  }

  if (!context || typeof context !== 'object') return null;

  const parts: string[] = [];
  const weather = context.weather || null;
  const location = context.location || null;
  const city = location?.city || weather?.city;
  const country = location?.country || weather?.country;
  const weatherText = weather?.weatherText || weather?.description;
  const temperature = weather?.temperature ?? weather?.temp;
  const windSpeed = weather?.windSpeed ?? weather?.wind_speed;

  if (city) parts.push(`Ort: ${country ? `${city}, ${country}` : city}`);

  if (weather) {
    const weatherParts: string[] = [];
    if (weatherText) weatherParts.push(String(weatherText));
    if (typeof temperature === 'number') weatherParts.push(`${temperature}°C`);
    if (typeof weather.humidity === 'number') weatherParts.push(`Luftfeuchte ${weather.humidity}%`);
    if (typeof windSpeed === 'number') weatherParts.push(`Wind ${windSpeed} km/h`);
    if (typeof weather.isDay === 'boolean')
      weatherParts.push(weather.isDay ? 'Tageslicht' : 'Nacht');
    if (weatherParts.length) parts.push(`Wetter: ${weatherParts.join(', ')}`);
  }

  if (context.localDateTime?.timeText) {
    const timezone = context.localDateTime.timeZone ? ` (${context.localDateTime.timeZone})` : '';
    const dateText = context.localDateTime.dateText ? `, ${context.localDateTime.dateText}` : '';
    parts.push(`Aktuelle lokale Zeit: ${context.localDateTime.timeText}${dateText}${timezone}`);
  }
  if (context.season?.name) parts.push(`Jahreszeit: ${context.season.name}`);
  if (context.time?.name) {
    parts.push(`Tageszeit: ${context.time.name}`);
  }

  return parts.length ? parts.join('\n') : null;
}

// ─── Function Calling: Tool Definitions ────────────

function buildTools() {
  return [
    {
      type: 'function',
      function: {
        name: 'create_task',
        description: 'Create a one-time plant care task for the user',
        parameters: {
          type: 'object',
          properties: {
            plant_name: {
              type: 'string',
              description: 'Name of the plant (must match an existing plant)',
            },
            task_type: {
              type: 'string',
              enum: ['Gießen', 'Düngen', 'Umtopfen', 'Healthcheck', 'Sonstiges'],
              description: 'Type of task',
            },
            due_date: { type: 'string', description: 'Due date in ISO format (YYYY-MM-DD)' },
            note: { type: 'string', description: 'Optional note for the task' },
          },
          required: ['plant_name', 'task_type', 'due_date'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_recurring_task',
        description: 'Create a recurring plant care task that repeats every N days',
        parameters: {
          type: 'object',
          properties: {
            plant_name: {
              type: 'string',
              description: 'Name of the plant (must match an existing plant)',
            },
            task_type: {
              type: 'string',
              enum: ['Gießen', 'Düngen', 'Umtopfen', 'Healthcheck', 'Sonstiges'],
              description: 'Type of task',
            },
            interval_days: { type: 'number', description: 'Interval in days between tasks' },
            note: { type: 'string', description: 'Optional note for the task' },
          },
          required: ['plant_name', 'task_type', 'interval_days'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'assign_plant_to_zone',
        description: "Assign one of the user's plants to an existing zone or room",
        parameters: {
          type: 'object',
          properties: {
            plant_name: {
              type: 'string',
              description: 'Name of the plant (must match an existing plant)',
            },
            zone_name: {
              type: 'string',
              description: "Name of the target zone or room (must match one of the user's zones)",
            },
          },
          required: ['plant_name', 'zone_name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'complete_task',
        description: "Complete the user's next due care task for one plant",
        parameters: {
          type: 'object',
          properties: {
            plant_name: {
              type: 'string',
              description: 'Name of the plant (must match an existing plant)',
            },
            task_type: {
              type: 'string',
              enum: ['Gießen', 'Düngen', 'Umtopfen', 'Healthcheck', 'Sonstiges'],
              description: 'Type of due task to complete',
            },
          },
          required: ['plant_name', 'task_type'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'reschedule_task',
        description: "Reschedule the user's next due care task for one plant",
        parameters: {
          type: 'object',
          properties: {
            plant_name: {
              type: 'string',
              description: 'Name of the plant (must match an existing plant)',
            },
            task_type: {
              type: 'string',
              enum: ['Gießen', 'Düngen', 'Umtopfen', 'Healthcheck', 'Sonstiges'],
              description: 'Type of due task to reschedule',
            },
            new_due_date: {
              type: 'string',
              description: 'New due date in ISO format (YYYY-MM-DD)',
            },
          },
          required: ['plant_name', 'task_type', 'new_due_date'],
        },
      },
    },
  ];
}

// ─── Tool Call Handler ────────────

const TOOL_TASK_TYPES = new Set([
  'Gießen',
  'Düngen',
  'Umtopfen',
  'Healthcheck',
  'Sonstiges',
  'watering',
  'fertilizing',
  'repotting',
  'healthcheck',
  'other',
]);
const NOTE_MAX_LENGTH = 500;

function getNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseToolArguments(rawArgs: unknown): {
  args: Record<string, unknown> | null;
  error?: string;
} {
  if (typeof rawArgs !== 'string') {
    return { args: null, error: 'Tool arguments must be a JSON string.' };
  }

  try {
    const parsed = JSON.parse(rawArgs);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { args: null, error: 'Tool arguments must be a JSON object.' };
    }
    return { args: parsed as Record<string, unknown> };
  } catch {
    return { args: null, error: 'Invalid JSON in tool arguments.' };
  }
}

function parseDueDate(input: unknown): { dueDate: string; dueAt: string } | null {
  const dueDate = getNonEmptyString(input);
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  const parsed = new Date(`${dueDate}T09:00:00Z`);
  if (isNaN(parsed.getTime())) return null;
  return { dueDate, dueAt: parsed.toISOString() };
}

function parseIntervalDays(input: unknown): number | null {
  const value = typeof input === 'number' ? input : Number(input);
  if (!Number.isInteger(value)) return null;
  if (value < 1 || value > 365) return null;
  return value;
}

function parseOptionalNote(input: unknown): { note: string | null; error?: string } {
  if (input === undefined || input === null || input === '') return { note: null };
  if (typeof input !== 'string') {
    return { note: null, error: 'note must be a string when provided.' };
  }
  const trimmed = input.trim();
  if (trimmed.length > NOTE_MAX_LENGTH) {
    return { note: null, error: `note must be <= ${NOTE_MAX_LENGTH} characters.` };
  }
  return { note: trimmed.length ? trimmed : null };
}

function normalizeTaskType(value: string): string {
  const key = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');

  const aliases: Record<string, string> = {
    giessen: 'watering',
    gießen: 'watering',
    watering: 'watering',
    wasser: 'watering',
    duenngen: 'fertilizing',
    dungen: 'fertilizing',
    duengen: 'fertilizing',
    fertilizing: 'fertilizing',
    fertilizer: 'fertilizing',
    umtopfen: 'repotting',
    repotting: 'repotting',
    healthcheck: 'healthcheck',
    gesundheitscheck: 'healthcheck',
    sonstiges: 'other',
    other: 'other',
  };

  return aliases[key] || key;
}

function taskTypeMatches(storedType: string, requestedType: string): boolean {
  return normalizeTaskType(storedType) === normalizeTaskType(requestedType);
}

async function findNextDueTaskForPlant(
  serviceClient: SupabaseClient,
  userId: string,
  plant: any,
  taskType: string
): Promise<{ task: any | null; error?: string }> {
  const { data, error } = await serviceClient
    .from('tasks')
    .select('id, plant_id, type, due_at, state, note, template_id')
    .eq('user_id', userId)
    .eq('plant_id', plant.id)
    .eq('state', 'DUE')
    .order('due_at', { ascending: true });

  if (error) return { task: null, error: error.message };

  const dueTasks = data || [];
  const matches = dueTasks.filter((task: any) => taskTypeMatches(task.type, taskType));
  if (matches.length > 0) return { task: matches[0] };

  if (dueTasks.length === 0) {
    return { task: null, error: `No due tasks found for ${plant.name}.` };
  }

  const available = dueTasks.map((task: any) => `${task.type} (${formatTaskDueDate(task.due_at)})`);
  return {
    task: null,
    error: `No due ${taskType} task found for ${plant.name}. Available due tasks: ${formatNameList(available)}`,
  };
}

async function handleToolCall(
  serviceClient: SupabaseClient,
  userId: string,
  toolCall: any,
  plants: any[]
): Promise<string> {
  const fnName = toolCall?.function?.name;
  if (!fnName) {
    return JSON.stringify({ error: 'Tool call is missing a function name.' });
  }

  const parsedArgs = parseToolArguments(toolCall?.function?.arguments);
  if (parsedArgs.error || !parsedArgs.args) {
    return JSON.stringify({ error: parsedArgs.error || 'Invalid tool arguments.' });
  }
  const args = parsedArgs.args;

  const plantName = getNonEmptyString(args.plant_name);
  if (!plantName) {
    return JSON.stringify({ error: 'plant_name is required and must be a non-empty string.' });
  }

  // Find plant by name (case-insensitive partial match)
  const plant = plants.find(
    (p: any) =>
      typeof p?.name === 'string' && p.name.toLowerCase().includes(plantName.toLowerCase())
  );

  if (!plant) {
    return JSON.stringify({
      error: `Plant "${plantName}" not found. Available plants: ${plants.map((p: any) => p.name).join(', ')}`,
    });
  }

  if (fnName === 'assign_plant_to_zone') {
    const zoneName = getNonEmptyString(args.zone_name);
    if (!zoneName) {
      return JSON.stringify({ error: 'zone_name is required and must be a non-empty string.' });
    }

    const zones = await loadUserZones(serviceClient, userId);
    if (zones.length === 0) {
      return JSON.stringify({
        error: 'No zones exist yet. Ask the user to create a home and zone first.',
      });
    }

    const zoneMatch = matchZoneByName(zones, zoneName);
    if (!zoneMatch.zone) {
      return JSON.stringify({ error: zoneMatch.error || 'Zone not found.' });
    }

    const { error } = await serviceClient
      .from('plants')
      .update({ zone_id: zoneMatch.zone.id })
      .eq('id', plant.id)
      .eq('user_id', userId);

    if (error) {
      return JSON.stringify({ error: error.message });
    }

    return JSON.stringify({
      success: true,
      plant_name: plant.name,
      zone_name: zoneMatch.zone.name,
      zone_label: zoneMatch.zone.displayName,
    });
  }

  const taskType = getNonEmptyString(args.task_type);
  if (!taskType || !TOOL_TASK_TYPES.has(taskType)) {
    return JSON.stringify({
      error: `task_type must be one of: ${Array.from(TOOL_TASK_TYPES).join(', ')}`,
    });
  }

  if (fnName === 'complete_task') {
    const taskResult = await findNextDueTaskForPlant(serviceClient, userId, plant, taskType);
    if (!taskResult.task) {
      return JSON.stringify({ error: taskResult.error || 'Due task not found.' });
    }

    const { data, error } = await serviceClient.rpc('complete_task_rpc', {
      p_task_id: taskResult.task.id,
    });

    if (error) {
      return JSON.stringify({ error: error.message });
    }

    return JSON.stringify({
      success: true,
      plant_name: plant.name,
      task_type: taskResult.task.type,
      task_id: taskResult.task.id,
      result: data,
    });
  }

  if (fnName === 'reschedule_task') {
    const due = parseDueDate(args.new_due_date);
    if (!due) {
      return JSON.stringify({
        error: 'new_due_date must be a valid date string in format YYYY-MM-DD.',
      });
    }

    const taskResult = await findNextDueTaskForPlant(serviceClient, userId, plant, taskType);
    if (!taskResult.task) {
      return JSON.stringify({ error: taskResult.error || 'Due task not found.' });
    }

    const { error } = await serviceClient
      .from('tasks')
      .update({ due_at: due.dueAt })
      .eq('id', taskResult.task.id)
      .eq('user_id', userId)
      .eq('state', 'DUE');

    if (error) {
      return JSON.stringify({ error: error.message });
    }

    return JSON.stringify({
      success: true,
      plant_name: plant.name,
      task_type: taskResult.task.type,
      task_id: taskResult.task.id,
      new_due_date: due.dueDate,
    });
  }

  if (fnName === 'create_task') {
    const due = parseDueDate(args.due_date);
    if (!due) {
      return JSON.stringify({
        error: 'due_date must be a valid date string in format YYYY-MM-DD.',
      });
    }

    const noteResult = parseOptionalNote(args.note);
    if (noteResult.error) {
      return JSON.stringify({ error: noteResult.error });
    }

    const { data, error } = await serviceClient
      .from('tasks')
      .insert({
        plant_id: plant.id,
        user_id: userId,
        type: taskType,
        due_at: due.dueAt,
        note: noteResult.note,
        state: 'DUE',
      })
      .select()
      .single();

    if (error || !data?.id) {
      return JSON.stringify({ error: error?.message || 'Task creation failed.' });
    }

    return JSON.stringify({
      success: true,
      task_type: taskType,
      plant_name: plant.name,
      due_date: due.dueDate,
      task_id: data.id,
    });
  }

  if (fnName === 'create_recurring_task') {
    const intervalDays = parseIntervalDays(args.interval_days);
    if (!intervalDays) {
      return JSON.stringify({
        error: 'interval_days must be an integer between 1 and 365.',
      });
    }

    const noteResult = parseOptionalNote(args.note);
    if (noteResult.error) {
      return JSON.stringify({ error: noteResult.error });
    }

    const dueAt = new Date(Date.now() + intervalDays * 86400000).toISOString();

    // Upsert template
    const { data: tpl, error: tplError } = await serviceClient
      .from('task_templates')
      .upsert(
        {
          user_id: userId,
          plant_id: plant.id,
          type: taskType,
          interval_days: intervalDays,
          next_due_at: dueAt,
          active: true,
        },
        { onConflict: 'user_id,plant_id,type' }
      )
      .select()
      .single();

    if (tplError || !tpl?.id) {
      return JSON.stringify({ error: tplError?.message || 'Recurring template upsert failed.' });
    }

    // Create first task
    const dedupeKey = `${tpl.id}:${new Date(dueAt).toISOString().slice(0, 10)}`;
    const { error: firstTaskError } = await serviceClient.from('tasks').insert({
      plant_id: plant.id,
      user_id: userId,
      type: taskType,
      due_at: dueAt,
      state: 'DUE',
      template_id: tpl.id,
      dedupe_key: dedupeKey,
      note: noteResult.note || `Alle ${intervalDays} Tage`,
    });

    // duplicate key = already exists → still a valid outcome
    if (firstTaskError && firstTaskError.code !== '23505') {
      return JSON.stringify({ error: firstTaskError.message });
    }

    return JSON.stringify({
      success: true,
      task_type: taskType,
      plant_name: plant.name,
      interval_days: intervalDays,
      first_task_created: !firstTaskError,
    });
  }

  return JSON.stringify({ error: 'Unknown function' });
}

// ─── Server-seitige History laden + Signed URLs generieren ────────────

async function loadAndPrepareHistory(
  serviceClient: SupabaseClient,
  userId: string,
  budgetTokens: number
): Promise<any[]> {
  // Mehr laden als noetig, dann per Token-Budget filtern
  const { data: allMessages, error } = await serviceClient
    .from('messages')
    .select('sender, content, image_path, image_url, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error || !allMessages) return [];

  const ordered = allMessages.reverse(); // chronologisch
  const selected = selectMessagesWithinBudget(ordered, budgetTokens);

  // Signed URLs fuer Bilder generieren
  const prepared: any[] = [];
  for (const msg of selected) {
    let imageUrl: string | null = null;

    // Nur echte Storage-Pfade verarbeiten (keine data: URIs oder base64)
    if (msg.image_path && !msg.image_path.startsWith('data:')) {
      const { data: signedData } = await serviceClient.storage
        .from('chat-images')
        .createSignedUrl(msg.image_path, 60 * 60);
      if (signedData?.signedUrl) imageUrl = signedData.signedUrl;
    } else if (
      msg.image_url &&
      !msg.image_url.startsWith('data:') &&
      msg.image_url.startsWith('http')
    ) {
      // Nur echte HTTP-URLs verwenden, keine base64 data-URIs
      imageUrl = msg.image_url;
    }

    const role = msg.sender === 'user' ? 'user' : 'assistant';
    if (imageUrl) {
      prepared.push({
        role,
        content: [
          ...(msg.content && msg.content !== '[Bild]' ? [{ type: 'text', text: msg.content }] : []),
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      });
    } else {
      // Kein Bild (oder base64) — nur Text senden
      const text = msg.content || '[Bild]';
      prepared.push({ role, content: text });
    }
  }

  return prepared;
}

// ─── Summary Memory: Rolling Zusammenfassung aktualisieren ────────────

async function maybeUpdateSummary(serviceClient: SupabaseClient, userId: string): Promise<void> {
  // Message-Count pruefen
  const { count } = await serviceClient
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  // Nur alle 20 Messages zusammenfassen
  if (!count || count % 20 !== 0) return;

  // Bestehende Summary laden
  const { data: existing } = await serviceClient
    .from('chat_memory')
    .select('summary')
    .eq('user_id', userId)
    .maybeSingle();

  // Letzte 20 Messages laden
  const { data: recentMessages } = await serviceClient
    .from('messages')
    .select('sender, content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!recentMessages || recentMessages.length < 10) return;

  const msgText = recentMessages
    .reverse()
    .map((m: any) => `${m.sender}: ${m.content}`)
    .join('\n');

  const previousSummary = existing?.summary || 'No previous summary.';

  // GPT-4o-mini fuer guenstige Zusammenfassung
  try {
    const summaryResult = await callOpenAI({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Summarize this gardening chat conversation into 3-5 bullet points.
Focus on: plant problems discussed, advice given, user preferences learned, important facts about the user's garden.
Keep under 200 words. Write in the same language as the conversation.
Previous summary to update/extend: ${previousSummary}`,
        },
        { role: 'user', content: msgText },
      ],
      max_tokens: 300,
      temperature: 0.3,
    });

    // Upsert Summary
    await serviceClient.from('chat_memory').upsert(
      {
        user_id: userId,
        summary: summaryResult.content,
        message_count: count,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  } catch (e) {
    // Summary-Fehler sind nicht kritisch, Chat funktioniert trotzdem
    console.error('Summary update failed:', e);
  }
}

function hasAssistantContent(result: any): boolean {
  return typeof result?.content === 'string' && result.content.trim().length > 0;
}

function mergeOpenAIResults(primary: any, fallback: any): any {
  return {
    ...fallback,
    prompt_tokens: (primary?.prompt_tokens || 0) + (fallback?.prompt_tokens || 0),
    completion_tokens: (primary?.completion_tokens || 0) + (fallback?.completion_tokens || 0),
    total_tokens: (primary?.total_tokens || 0) + (fallback?.total_tokens || 0),
    cost_usd: (primary?.cost_usd || 0) + (fallback?.cost_usd || 0),
    model:
      primary?.model && fallback?.model && primary.model !== fallback.model
        ? `${primary.model}+${fallback.model}`
        : fallback?.model || primary?.model,
  };
}

async function retryEmptyChatAnswer(
  result: any,
  chatMessages: any[],
  languagePromptName: string
): Promise<any> {
  if (hasAssistantContent(result)) return result;

  const retryResult = await callOpenAI({
    messages: [
      ...chatMessages,
      {
        role: 'system',
        content: `Your previous response was empty. Answer the user's latest message now in ${languagePromptName}. Do not call tools. If the user confirmed a suggestion, complete the requested answer directly in text. Keep it concise and helpful.`,
      },
    ],
    temperature: 0.4,
    max_tokens: 400,
  });

  return mergeOpenAIResults(result, retryResult);
}

// ─── Main Handler ────────────

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, 'POST, OPTIONS');
  const blockedOrigin = rejectDisallowedOrigin(req, corsHeaders);
  if (blockedOrigin) return blockedOrigin;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = getServiceClient();
    const userId = await getUserIdFromAuth(serviceClient, authHeader);

    // Body parsen (history wird NICHT mehr vom Client gesendet)
    const { text, image_url, language: requestedLanguage, context, contextText } = await req.json();

    // Input-Validierung
    const validationErr = validationErrorResponse(
      [validateText(text, 2000, 'text'), validateImageUrl(image_url)],
      corsHeaders
    );
    if (validationErr) return validationErr;
    const language = validateLanguage(requestedLanguage);

    // Rate Limiting (vor Credit-Abzug)
    const rateLimitResp = await checkRateLimit(serviceClient, userId, 'chat', corsHeaders);
    if (rateLimitResp) return rateLimitResp;

    // Credits atomar abziehen
    const cost = CREDIT_COSTS.chat;
    let newBalance: number;
    try {
      newBalance = await deductCreditsAtomic(serviceClient, userId, cost);
    } catch (e: any) {
      if (e.code === 'INSUFFICIENT_CREDITS') {
        return new Response(
          JSON.stringify({
            error: 'Nicht genügend Credits',
            balance: e.balance,
            required: e.required,
          }),
          {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      throw e;
    }

    // Sprache (DB-Profil) + Garden Context + Memory + Plants parallel laden
    // Wenn ein Bild dabei ist, PlantNet parallel starten
    const langCode = (language || 'de').split('-')[0];
    const plantNetPromise = image_url
      ? identifyPlantFromUrl(image_url, langCode)
      : Promise.resolve(null);

    const [userLang, gardenContext, memoryData, plantsData, plantNetResult] = await Promise.all([
      getUserLanguage(serviceClient, userId, language),
      loadGardenContext(serviceClient, userId),
      serviceClient.from('chat_memory').select('summary').eq('user_id', userId).maybeSingle(),
      serviceClient.from('plants').select('id, name').eq('user_id', userId),
      plantNetPromise,
    ]);

    const finalLanguage = userLang;
    const languagePromptName = getLanguagePromptName(finalLanguage);
    const memorySummary = memoryData?.data?.summary || null;
    const userPlants = plantsData?.data || [];
    const plantNetContext = formatPlantNetContext(plantNetResult);
    const externalContext = buildExternalContext(contextText, context);
    const systemPrompt = buildSystemPrompt(
      languagePromptName,
      gardenContext,
      memorySummary,
      plantNetContext,
      externalContext
    );

    // Token-Budget fuer History berechnen
    const systemTokens = estimateTokens(systemPrompt);
    const maxOutputTokens = 500;
    const historyBudget = Math.max(0, 6000 - systemTokens - maxOutputTokens);

    // History server-seitig laden (Token-Budget basiert)
    const historyMessages = await loadAndPrepareHistory(serviceClient, userId, historyBudget);

    // Chat-Nachrichten aufbauen
    const chatMessages: any[] = [{ role: 'system', content: systemPrompt }, ...historyMessages];

    // Bild- und Text-Nachrichten sind bereits in historyMessages vom DB-Load
    // enthalten (der Client speichert sie vor dem RPC-Aufruf).
    // Kein erneutes Anhaengen noetig — das wuerde Duplikate erzeugen.

    // OpenAI Call (Credits bereits abgezogen, Refund bei Fehler)
    let result;
    try {
      result = await callOpenAI({
        messages: chatMessages,
        temperature: 0.7,
        max_tokens: 500,
        tools: buildTools(),
        tool_choice: 'auto',
      });

      // Handle function calling loop
      if (result.tool_calls && result.tool_calls.length > 0) {
        // Add assistant message with tool calls
        chatMessages.push({
          role: 'assistant',
          content: result.content || null,
          tool_calls: result.tool_calls,
        });

        // Execute each tool call
        for (const toolCall of result.tool_calls) {
          const toolResult = await handleToolCall(serviceClient, userId, toolCall, userPlants);
          chatMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }

        // Get final response from GPT with tool results
        result = await callOpenAI({
          messages: chatMessages,
          temperature: 0.7,
          max_tokens: 500,
        });
      }

      result = await retryEmptyChatAnswer(result, chatMessages, languagePromptName);

      if (!hasAssistantContent(result)) {
        throw new Error('Ben hat gerade leer geantwortet. Bitte versuche es erneut.');
      }
    } catch (e) {
      await refundCredits(serviceClient, userId, cost);
      throw e;
    }

    // Usage loggen + Summary im Hintergrund aktualisieren (non-blocking)
    await logUsage(serviceClient, {
      user_id: userId,
      action: 'chat',
      prompt_tokens: result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      total_tokens: result.total_tokens,
      cost_credits: cost,
      openai_cost_usd: result.cost_usd,
      model: result.model,
      metadata: {
        language: finalLanguage,
        context_used: !!externalContext,
        plantnet_used: !!plantNetContext,
        plantnet_best_match: plantNetResult?.bestMatch || null,
      },
    });

    // Summary Memory im Hintergrund aktualisieren (blockiert Response nicht)
    maybeUpdateSummary(serviceClient, userId).catch((e) =>
      console.error('Summary background error:', e)
    );

    return new Response(
      JSON.stringify({
        content: result.content,
        balance: newBalance,
        credits_used: cost,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (e: any) {
    const status = e?.code === 'UNAUTHORIZED' ? 401 : 500;
    return new Response(JSON.stringify({ error: e.message || 'Unbekannter Fehler' }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
