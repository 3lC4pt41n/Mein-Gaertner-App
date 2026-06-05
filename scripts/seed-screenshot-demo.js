#!/usr/bin/env node
/* eslint-disable no-console */
/* global __dirname */
/*
 * seed-screenshot-demo.js
 * ------------------------
 * Seeds a deterministic, localized demo state for App Store screenshots.
 *
 * Creates, for one demo account, in the account's language:
 *   - a home (locations row)
 *   - rooms (zones rows)
 *   - assigns the account's most-recent plant to a room (plants.zone_id)
 *   - a recurring watering task (task_templates + tasks) + one extra task
 *   - a scripted Ben/Rose chat (messages rows)
 *
 * It does NOT create the plant, its care details or the healthcheck — those are
 * AI-generated in-app per account. Recognise a plant in the app FIRST, then run this.
 *
 * Content comes from scripts/screenshot-fixtures.json (one block per language).
 *
 * Safety: only runs against *@florascout.app demo accounts.
 *
 * Usage:
 *   node scripts/seed-screenshot-demo.js --email de-DE@florascout.app --lang de
 *   node scripts/seed-screenshot-demo.js --email es-ES@florascout.app --lang es --persona Rose
 *   node scripts/seed-screenshot-demo.js --email it-IT@florascout.app --lang it --dry-run
 *   node scripts/seed-screenshot-demo.js --email fr-FR@florascout.app --lang fr --keep   # keep existing seed, don't wipe
 *
 * Env (read from .env.local automatically, or the shell):
 *   EXPO_PUBLIC_SUPABASE_URL   – project URL
 *   SUPABASE_SECRET_KEY        – service-role / secret key (required, bypasses RLS)
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// plant_details now supports all 23 locales (migration 20260602170000, deployed).
const SUPPORTED_DETAIL_LANGS = [
  'de',
  'en',
  'fr',
  'it',
  'es',
  'ru',
  'tr',
  'nl',
  'da',
  'pl',
  'uk',
  'pt-BR',
  'pt-PT',
  'hi',
  'bn',
  'ja',
  'ko',
  'zh-Hans',
  'id',
  'ar',
  'he',
  'fa',
  'ur',
];
const DEMO_EMAIL_RE = /@florascout\.app$/i;

// --- minimal .env.local loader (no extra deps) ---
function loadEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch (_) {
    /* no .env.local — rely on shell env */
  }
}
loadEnv(path.join(__dirname, '..', '.env.local'));

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else out[key] = true;
    } else out._.push(a);
  }
  return out;
}

const addDays = (d, n) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};
const atHourUTC = (d, h) => {
  const x = new Date(d);
  x.setUTCHours(h, 0, 0, 0);
  return x;
};

async function main() {
  const argv = parseArgs(process.argv.slice(2));
  const email = argv.email;
  const lang = argv.lang;
  const persona = argv.persona || 'Ben';
  const dryRun = !!argv['dry-run'];
  const keep = !!argv.keep;

  if (!email || !lang) {
    console.error(
      'Usage: --email <addr@florascout.app> --lang <code> [--persona Ben|Rose] [--keep] [--dry-run]'
    );
    process.exit(1);
  }
  if (!['Ben', 'Rose'].includes(persona)) {
    console.error(`--persona must be "Ben" or "Rose" (got "${persona}").`);
    process.exit(1);
  }

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (env or .env.local).');
    process.exit(1);
  }
  if (!DEMO_EMAIL_RE.test(email)) {
    console.error(
      `Refusing: "${email}" is not a *@florascout.app demo account. This script only touches demo accounts.`
    );
    process.exit(1);
  }

  const fixtures = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'screenshot-fixtures.json'), 'utf8')
  );
  const fx = fixtures[lang];
  if (!fx) {
    const avail = Object.keys(fixtures)
      .filter((k) => !k.startsWith('_'))
      .join(', ');
    console.error(`No fixtures for lang "${lang}". Available: ${avail}`);
    process.exit(1);
  }
  if (!SUPPORTED_DETAIL_LANGS.includes(lang)) {
    console.warn(
      `⚠️  "${lang}" is outside the plant_details language CHECK (${SUPPORTED_DETAIL_LANGS.join(',')}).`
    );
    console.warn(
      '   Home/rooms/tasks/chat will seed fine, but in-app plant care details cannot be generated'
    );
    console.warn('   for this language until that DB constraint is widened.');
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 1) account
  const { data: prof, error: e1 } = await sb
    .from('profiles')
    .select('id,language')
    .eq('email', email)
    .maybeSingle();
  if (e1) throw e1;
  if (!prof) {
    console.error(`No profile for ${email}. Create the account and log in once first.`);
    process.exit(1);
  }
  const userId = prof.id;

  // 2) most-recent plant
  const { data: plant, error: e2 } = await sb
    .from('plants')
    .select('id,name')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e2) throw e2;
  if (!plant) {
    console.error(`No plant for ${email}. Recognise a plant in-app first.`);
    process.exit(1);
  }

  console.log(`Account ${email} (${userId})`);
  console.log(`Plant   "${plant.name}" (${plant.id})`);
  console.log(
    `Lang    ${lang} | Persona ${persona}${dryRun ? ' | DRY RUN' : ''}${keep ? ' | KEEP' : ''}`
  );

  if (dryRun) {
    console.log('Dry run — no writes performed.');
    return;
  }

  // ensure profile language matches the screenshot language
  if (prof.language !== lang) {
    await sb.from('profiles').update({ language: lang }).eq('id', userId);
    console.log(`profiles.language ${prof.language} -> ${lang}`);
  }

  // 3) reset prior seed (demo accounts only) unless --keep
  if (!keep) {
    await sb.from('messages').delete().eq('user_id', userId);
    await sb.from('tasks').delete().eq('user_id', userId);
    await sb.from('task_templates').delete().eq('user_id', userId);
    const { data: locs } = await sb.from('locations').select('id').eq('user_id', userId);
    const locIds = (locs || []).map((l) => l.id);
    if (locIds.length) {
      await sb.from('zones').delete().in('location_id', locIds);
      await sb.from('locations').delete().eq('user_id', userId);
    }
  }

  // 4) home
  const { data: loc, error: e3 } = await sb
    .from('locations')
    .insert({
      user_id: userId,
      name: fx.location.name,
      locality: fx.location.locality || null,
      country: fx.location.country || null,
    })
    .select('id')
    .single();
  if (e3) throw e3;

  // 5) rooms
  const { data: zones, error: e4 } = await sb
    .from('zones')
    .insert(fx.zones.map((z) => ({ location_id: loc.id, name: z.name, type: z.type })))
    .select('id,name');
  if (e4) throw e4;
  const assignZone = zones.find((z) => z.name === fx.assignPlantToZone) || zones[0];

  // 6) assign plant to a room
  await sb.from('plants').update({ zone_id: assignZone.id }).eq('id', plant.id);

  // 7) recurring watering task (+ extra task)
  const now = new Date();
  const dueWater = atHourUTC(addDays(now, fx.watering.due_in_days ?? 0), 16);
  const nextWater = atHourUTC(addDays(now, fx.watering.interval_days), 16);
  const { data: tmpl, error: e5 } = await sb
    .from('task_templates')
    .upsert(
      {
        user_id: userId,
        plant_id: plant.id,
        type: 'watering',
        interval_days: fx.watering.interval_days,
        next_due_at: nextWater.toISOString(),
        active: true,
      },
      { onConflict: 'user_id,plant_id,type' }
    )
    .select('id')
    .single();
  if (e5) throw e5;

  await sb.from('tasks').insert({
    user_id: userId,
    plant_id: plant.id,
    type: 'watering',
    due_at: dueWater.toISOString(),
    state: 'DUE',
    template_id: tmpl.id,
    dedupe_key: `${tmpl.id}:${dueWater.toISOString().slice(0, 10)}`,
    note: fx.watering.note,
  });

  if (fx.extraTask) {
    const dueExtra = atHourUTC(addDays(now, fx.extraTask.due_in_days), 16);
    await sb.from('tasks').insert({
      user_id: userId,
      plant_id: plant.id,
      type: fx.extraTask.type,
      due_at: dueExtra.toISOString(),
      state: 'DUE',
      note: fx.extraTask.note,
    });
  }

  // 8) scripted chat (oldest first, ~1 min apart, ending "now")
  const baseTs = Date.now();
  const personaDisplayName = fx.personas?.[persona] || persona;
  const msgs = fx.chat.map((m, i) => ({
    user_id: userId,
    sender: m.sender === 'assistant' ? persona : m.sender,
    content: m.content
      .replace(/\{plant\}/g, plant.name)
      .replace(/\{persona\}/g, personaDisplayName),
    created_at: new Date(baseTs - (fx.chat.length - i) * 60000).toISOString(),
  }));
  await sb.from('messages').insert(msgs);

  console.log(
    `✓ Seeded: home "${fx.location.name}", ${zones.length} rooms, plant → "${assignZone.name}", watering every ${fx.watering.interval_days}d, ${fx.chat.length} chat messages.`
  );
}

main().catch((e) => {
  console.error('FAILED:', e.message || e);
  process.exit(1);
});
