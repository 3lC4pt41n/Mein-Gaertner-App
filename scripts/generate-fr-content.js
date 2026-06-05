#!/usr/bin/env node
/* eslint-disable no-console */
/* global __dirname */
/*
 * generate-fr-content.js
 * ----------------------
 * Brings every demo account to the FR "showcase" state for the 3 AI-driven
 * screenshot screens, by triggering the REAL edge functions per account/language:
 *
 *   - ai-plant-details  -> { details }                 -> upsert plant_details
 *   - ai-healthcheck    -> { healthcheck: {...,table} } -> insert plant_healthchecks (table_json = .table)
 *   - ai-chat           -> { content }                 -> client inserts the user + 'Ben' messages itself
 *
 * The structural data (home, rooms, 5 plants, tasks) is already cloned in Supabase.
 * This script only fills the per-language AI content for the SHOWCASE plant
 * ("Dracaena stuckyi") that the detail/health/chat screenshots use.
 *
 * It signs in as each account with the PUBLISHABLE key (real user JWT), so edge
 * functions and RLS-protected writes behave exactly like the app.
 *
 * PREREQUISITES (run on your machine — needs network to Supabase):
 *   .env.local with EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *   The 23 accounts exist (pre-confirmed) and the FR structure is cloned.
 *
 * USAGE:
 *   node scripts/generate-fr-content.js --password 'Test1234!'                 # all non-fr accounts
 *   node scripts/generate-fr-content.js --langs de,ja,ar --password 'Test1234!'
 *   node scripts/generate-fr-content.js --langs ja --password 'Test1234!' --no-chat
 *   node scripts/generate-fr-content.js --password 'Test1234!' --dry-run
 *
 * NOTE: real edge calls cost OpenAI credits (~3 calls/account). Heavy but one-off.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.join(__dirname, '..');
const ACCOUNTS = path.join(ROOT, 'scripts', 'screenshot-accounts.json');
const FIXTURES = path.join(ROOT, 'scripts', 'screenshot-fixtures.json');
const SHOWCASE_PLANT = 'Dracaena stuckyi';
const DEMO_EMAIL_RE = /@florascout\.app$/i;

// Fallback chat questions (used when a language has no fixture). Ben replies in the account language.
const DEFAULT_Q = [
  'Hi Ben! Can you take over the watering reminders for my plant?',
  'Perfect. And can you recognise a plant from a photo?',
];

function loadEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined)
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch (_) {
    /* shell env */
  }
}
loadEnv(path.join(ROOT, '.env.local'));

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const n = argv[i + 1];
      if (n && !n.startsWith('--')) {
        out[k] = n;
        i++;
      } else out[k] = true;
    } else out._.push(a);
  }
  return out;
}

// chat user questions for a language: from fixtures if present, else English defaults
function chatQuestions(fixtures, lang) {
  const fx = fixtures[lang];
  if (fx && Array.isArray(fx.chat)) {
    const qs = fx.chat.filter((m) => m.sender === 'user').map((m) => m.content);
    if (qs.length) return qs;
  }
  return DEFAULT_Q;
}

async function processAccount(url, anonKey, email, lang, password, fixtures, opts) {
  if (!DEMO_EMAIL_RE.test(email))
    throw new Error(`"${email}" is not a *@florascout.app demo account.`);
  const sb = createClient(url, anonKey, { auth: { persistSession: false } });

  // 1) sign in -> real user JWT
  const { data: auth, error: aerr } = await sb.auth.signInWithPassword({ email, password });
  if (aerr) throw new Error(`login failed: ${aerr.message}`);
  const userId = auth.user.id;

  // 2) showcase plant
  const { data: plant, error: perr } = await sb
    .from('plants')
    .select('id,name,note,species_id,image_url')
    .eq('user_id', userId)
    .eq('name', SHOWCASE_PLANT)
    .maybeSingle();
  if (perr) throw perr;
  if (!plant) throw new Error(`no "${SHOWCASE_PLANT}" plant — run the structural clone first.`);

  console.log(`[${lang}] ${email} -> plant ${plant.id}${opts.dryRun ? ' (dry run)' : ''}`);
  if (opts.dryRun) return;

  // 3) plant details (edge) -> upsert plant_details
  const { data: det, error: derr } = await sb.functions.invoke('ai-plant-details', {
    body: {
      name: plant.name,
      note: plant.note || undefined,
      language: lang,
      species_id: plant.species_id || undefined,
      force_refresh: true,
    },
  });
  if (derr) throw new Error(`ai-plant-details: ${derr.message}`);
  const details = det?.details || det;
  const { error: uerr } = await sb.from('plant_details').upsert(
    {
      plant_id: plant.id,
      user_id: userId,
      language: lang,
      species_id: plant.species_id || null,
      details,
      source: 'ai',
      generated_at: new Date().toISOString(),
    },
    { onConflict: 'plant_id,language' }
  );
  if (uerr) throw new Error(`save plant_details: ${uerr.message}`);
  console.log(`  ✓ details`);

  // 4) healthcheck (edge, needs signed image URL) -> insert plant_healthchecks
  const { data: signed, error: serr } = await sb.storage
    .from('plant-images')
    .createSignedUrl(plant.image_url, 3600);
  if (serr) throw new Error(`sign image: ${serr.message}`);
  const { data: hcResp, error: herr } = await sb.functions.invoke('ai-healthcheck', {
    body: { image_url: signed.signedUrl, plant_name: plant.name, language: lang },
  });
  if (herr) throw new Error(`ai-healthcheck: ${herr.message}`);
  // Response shape: { healthcheck: { healthscore, summary, table, recommendation }, ... }
  // NOTE: the table field is `table` (array); the DB column is `table_json`.
  const hc = hcResp?.healthcheck || hcResp;
  // refresh demo: drop prior, insert latest
  await sb.from('plant_healthchecks').delete().eq('plant_id', plant.id).eq('user_id', userId);
  const { error: hierr } = await sb.from('plant_healthchecks').insert({
    plant_id: plant.id,
    user_id: userId,
    healthscore: hc?.healthscore ?? null,
    summary: hc?.summary ?? null,
    table_json: hc?.table ?? null,
    recommendation: hc?.recommendation ?? null,
  });
  if (hierr) throw new Error(`save healthcheck: ${hierr.message}`);
  console.log(`  ✓ healthcheck (${hc?.healthscore ?? '?'})`);

  // 5) chat. ai-chat does NOT persist messages — it only reads history server-side.
  // The client inserts both rows itself: user message (sender 'user') and the
  // gardener reply (sender = persona NAME 'Ben', not the lowercase invoke key).
  if (!opts.noChat) {
    await sb.from('messages').delete().eq('user_id', userId);
    for (const q0 of chatQuestions(fixtures, lang)) {
      const q = q0.replace(/\{plant\}/g, plant.name);
      const { error: umErr } = await sb
        .from('messages')
        .insert([{ user_id: userId, sender: 'user', content: q }]);
      if (umErr) throw new Error(`save chat user msg: ${umErr.message}`);
      const { data: chatResp, error: cerr } = await sb.functions.invoke('ai-chat', {
        body: { text: q, language: lang, gardener_persona: 'ben' },
      });
      if (cerr) throw new Error(`ai-chat: ${cerr.message}`);
      const reply = chatResp?.content;
      if (!reply) throw new Error('ai-chat: empty reply');
      const { error: amErr } = await sb
        .from('messages')
        .insert([{ user_id: userId, sender: 'Ben', content: reply }]);
      if (amErr) throw new Error(`save chat reply: ${amErr.message}`);
    }
    console.log(`  ✓ chat`);
  }

  await sb.auth.signOut();
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const password = a.password || process.env.SCREENSHOT_PASSWORD;
  const opts = { dryRun: !!a['dry-run'], noChat: !!a['no-chat'] };

  if (!url || !anonKey) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
    process.exit(1);
  }
  if (!password && !opts.dryRun) {
    console.error('Missing --password.');
    process.exit(1);
  }

  const accounts = JSON.parse(fs.readFileSync(ACCOUNTS, 'utf8'));
  const fixtures = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));
  const all = Object.keys(accounts).filter(
    (k) => !k.startsWith('_') && k !== 'fr' && accounts[k]?.email
  );
  const langs = a.langs
    ? String(a.langs)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : all;

  console.log(`Generating AI content for ${langs.length} account(s): ${langs.join(', ')}`);
  const failed = [];
  for (const lang of langs) {
    const acc = accounts[lang];
    if (!acc?.email) {
      console.warn(`skip ${lang}: no email`);
      continue;
    }
    try {
      await processAccount(
        url,
        anonKey,
        acc.email,
        lang,
        accounts[lang].password || password,
        fixtures,
        opts
      );
    } catch (e) {
      console.error(`  ✗ [${lang}] ${e.message || e}`);
      failed.push(lang);
    }
  }
  console.log(
    `\nDone. ${langs.length - failed.length}/${langs.length} ok${failed.length ? `, failed: ${failed.join(', ')}` : ''}.`
  );
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error('FAILED:', e.message || e);
  process.exit(1);
});
