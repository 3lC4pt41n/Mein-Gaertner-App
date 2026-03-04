// Edge Function: Chat mit Ben (Pflanzen-Coach)
// POST Body: { text?: string, image_url?: string, language?: string }
// History wird server-seitig aus der DB geladen (nicht mehr vom Client gesendet)
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { callOpenAI } from '../_shared/openai.ts';
import {
  CREDIT_COSTS,
  deductCreditsAtomic,
  refundCredits,
  logUsage,
  corsHeaders,
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

// ─── Garden Context: Pflanzen, Healthchecks, Tasks laden ────────────

async function loadGardenContext(serviceClient: SupabaseClient, userId: string): Promise<string> {
  // Pflanzen laden
  const { data: plants } = await serviceClient
    .from('plants')
    .select('id, name, note, zone_id, created_at')
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
    .select('plant_id, type, due_at, state, note')
    .eq('user_id', userId)
    .in('state', ['DUE', 'OPEN'])
    .order('due_at', { ascending: true })
    .limit(20);

  const tasksByPlant: Record<string, any[]> = {};
  for (const t of tasks || []) {
    if (!tasksByPlant[t.plant_id]) tasksByPlant[t.plant_id] = [];
    tasksByPlant[t.plant_id].push(t);
  }

  // Zonen
  const zoneIds = plants.map((p: any) => p.zone_id).filter(Boolean);
  const zoneMap: Record<string, string> = {};
  if (zoneIds.length > 0) {
    const { data: zones } = await serviceClient
      .from('zones')
      .select('id, name, type')
      .in('id', zoneIds);
    for (const z of zones || []) {
      zoneMap[z.id] = `${z.name} (${z.type})`;
    }
  }

  // Kompaktes Text-Format
  let context = `USER'S GARDEN (${plants.length} plants):\n`;
  for (const plant of plants) {
    const hc = latestHC[plant.id];
    const plantTasks = tasksByPlant[plant.id] || [];
    const zone = plant.zone_id ? zoneMap[plant.zone_id] : null;

    context += `- ${plant.name}`;
    if (zone) context += ` [${zone}]`;
    if (hc) {
      const daysAgo = Math.floor((Date.now() - new Date(hc.created_at).getTime()) / 86400000);
      context += ` | Health: ${hc.healthscore}/100 (${daysAgo}d ago)`;
      if (hc.recommendation) context += ` | Tip: ${hc.recommendation}`;
    }
    if (plantTasks.length > 0) {
      const taskStr = plantTasks
        .map((t: any) => {
          const due = new Date(t.due_at);
          const overdue = due < new Date();
          return `${t.type}${overdue ? ' (OVERDUE)' : ''}`;
        })
        .join(', ');
      context += ` | Tasks: ${taskStr}`;
    }
    context += '\n';
  }

  return context;
}

// ─── System Prompt mit Garden Context ────────────

function buildSystemPrompt(
  languagePromptName: string,
  gardenContext: string,
  memorySummary: string | null
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

## TOOLS
- You can create tasks for the user using the create_task and create_recurring_task functions.
- When the user asks you to remind them, schedule something, or create a care plan, use these tools.
- After creating a task, confirm what you created in a friendly message.
- For recurring tasks, suggest reasonable intervals based on plant type and season.`;

  if (memorySummary) {
    prompt += `\n\n## PREVIOUS CONVERSATION CONTEXT\n${memorySummary}`;
  }

  return prompt;
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
  ];
}

// ─── Tool Call Handler ────────────

async function handleToolCall(
  serviceClient: SupabaseClient,
  userId: string,
  toolCall: any,
  plants: any[]
): Promise<string> {
  const fn = toolCall.function;
  const args = JSON.parse(fn.arguments);

  // Find plant by name (case-insensitive partial match)
  const plant = plants.find((p: any) =>
    p.name.toLowerCase().includes(args.plant_name.toLowerCase())
  );

  if (!plant) {
    return JSON.stringify({
      error: `Plant "${args.plant_name}" not found. Available plants: ${plants.map((p: any) => p.name).join(', ')}`,
    });
  }

  if (fn.name === 'create_task') {
    const dueAt = new Date(args.due_date + 'T09:00:00').toISOString();
    const { data, error } = await serviceClient
      .from('tasks')
      .insert({
        plant_id: plant.id,
        user_id: userId,
        type: args.task_type,
        due_at: dueAt,
        note: args.note || null,
        state: 'DUE',
      })
      .select()
      .single();

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({
      success: true,
      task_type: args.task_type,
      plant_name: plant.name,
      due_date: args.due_date,
    });
  }

  if (fn.name === 'create_recurring_task') {
    const dueAt = new Date(Date.now() + args.interval_days * 86400000).toISOString();

    // Upsert template
    const { data: tpl, error: tplError } = await serviceClient
      .from('task_templates')
      .upsert(
        {
          user_id: userId,
          plant_id: plant.id,
          type: args.task_type,
          interval_days: args.interval_days,
          next_due_at: dueAt,
          active: true,
        },
        { onConflict: 'user_id,plant_id,type' }
      )
      .select()
      .single();

    if (tplError) return JSON.stringify({ error: tplError.message });

    // Create first task
    const dedupeKey = `${tpl.id}:${new Date(dueAt).toISOString().slice(0, 10)}`;
    await serviceClient.from('tasks').insert({
      plant_id: plant.id,
      user_id: userId,
      type: args.task_type,
      due_at: dueAt,
      state: 'DUE',
      template_id: tpl.id,
      dedupe_key: dedupeKey,
      note: args.note || `Alle ${args.interval_days} Tage`,
    });

    return JSON.stringify({
      success: true,
      task_type: args.task_type,
      plant_name: plant.name,
      interval_days: args.interval_days,
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

// ─── Main Handler ────────────

serve(async (req) => {
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
    const { text, image_url, language: requestedLanguage } = await req.json();

    // Input-Validierung
    const validationErr = validationErrorResponse([
      validateText(text, 2000, 'text'),
      validateImageUrl(image_url),
    ]);
    if (validationErr) return validationErr;
    const language = validateLanguage(requestedLanguage);

    // Rate Limiting (vor Credit-Abzug)
    const rateLimitResp = await checkRateLimit(serviceClient, userId, 'chat');
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
    const [userLang, gardenContext, memoryData, plantsData] = await Promise.all([
      getUserLanguage(serviceClient, userId, language),
      loadGardenContext(serviceClient, userId),
      serviceClient.from('chat_memory').select('summary').eq('user_id', userId).maybeSingle(),
      serviceClient.from('plants').select('id, name').eq('user_id', userId),
    ]);

    const finalLanguage = userLang;
    const languagePromptName = getLanguagePromptName(finalLanguage);
    const memorySummary = memoryData?.data?.summary || null;
    const userPlants = plantsData?.data || [];
    const systemPrompt = buildSystemPrompt(languagePromptName, gardenContext, memorySummary);

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
      metadata: { language: finalLanguage },
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
    return new Response(JSON.stringify({ error: e.message || 'Unbekannter Fehler' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
