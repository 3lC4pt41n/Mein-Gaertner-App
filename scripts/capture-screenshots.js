#!/usr/bin/env node
/*
 * capture-screenshots.js
 * ----------------------
 * Drives the Maestro flow (.maestro/screenshots.yaml) to capture the 10 canonical
 * landing/store screenshots for one or more languages, then exports them as JPGs
 * into the landing-page folder structure:
 *
 *     store-assets/landing/<lang>/<name>.jpg
 *
 * For each language it:
 *   1. resolves the demo account email (scripts/screenshot-accounts.json)
 *   2. fetches that account's plant name from Supabase (to open its detail page)
 *   3. reads the in-app labels from i18n/locales/<lang>.json (tabs, menu, chips)
 *   4. runs `maestro test` against the booted simulator/emulator, logging in fresh
 *   5. converts the PNG screenshots to JPG into store-assets/landing/<lang>/
 *
 * PREREQUISITES (run on your machine, not in CI sandbox):
 *   - Maestro installed (https://maestro.mobile.dev), `maestro` on PATH
 *   - A booted iOS simulator / Android emulator with the app installed (dev or release build)
 *   - The demo accounts exist, are onboarded, and were seeded (scripts/seed-screenshot-demo.js)
 *   - .env.local with EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY (to read the plant name)
 *
 * USAGE:
 *   node scripts/capture-screenshots.js --langs fr --password 'Test1234!'
 *   node scripts/capture-screenshots.js --langs de,en,fr,it,es,ru,tr --password 'Test1234!'
 *   node scripts/capture-screenshots.js --langs fr --password 'Test1234!' --device <udid|emulator-id>
 *   node scripts/capture-screenshots.js --langs fr --password 'Test1234!' --plant "Dracaena stuckyi"  # skip DB lookup
 *
 * OPTIONS:
 *   --langs <csv>        languages to capture (default: all in screenshot-accounts.json)
 *   --password <pw>      account password (same for all demo accounts)
 *   --device <id>        pass-through to `maestro test --device` (optional)
 *   --login-lang <code>  language of the SIMULATOR (pre-login screen). default: de
 *   --plant <name>       override plant name (skips Supabase lookup; single-lang only)
 *   --keep-png           keep the raw PNGs under .maestro/.out/<lang>/
 *   --dry-run            print the planned maestro commands without running them
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FLOW = path.join(ROOT, '.maestro', 'screenshots.yaml');
const ACCOUNTS = path.join(ROOT, 'scripts', 'screenshot-accounts.json');
const LANDING = path.join(ROOT, 'store-assets', 'landing');
const OUT_ROOT = path.join(ROOT, '.maestro', '.out');
const DEMO_EMAIL_RE = /@florascout\.app$/i;

const SHOTS = [
  'home-zones', 'plants-by-room', 'plants-overview', 'plant-dex',
  'details-health', 'details-properties', 'tasks', 'assistant-chat',
  'shop-credits', 'leaderboard',
];

function loadEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch (_) { /* rely on shell env */ }
}
loadEnv(path.join(ROOT, '.env.local'));

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2); const n = argv[i + 1];
      if (n && !n.startsWith('--')) { out[k] = n; i++; } else out[k] = true;
    } else out._.push(a);
  }
  return out;
}

const get = (obj, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), obj);

function readLocale(lang) {
  const f = path.join(ROOT, 'i18n', 'locales', `${lang}.json`);
  if (!fs.existsSync(f)) throw new Error(`Missing locale file: i18n/locales/${lang}.json`);
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

// label with fallbacks across keys; throws if none resolve
function label(loc, keys, lang) {
  for (const k of keys) { const v = get(loc, k); if (typeof v === 'string' && v) return v; }
  throw new Error(`No label for [${keys.join(', ')}] in ${lang}.json`);
}

async function fetchPlantName(email) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Need EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY (or pass --plant).');
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: prof, error: e1 } = await sb.from('profiles').select('id').eq('email', email).maybeSingle();
  if (e1) throw e1;
  if (!prof) throw new Error(`No profile for ${email}`);
  const { data: plant, error: e2 } = await sb.from('plants').select('name')
    .eq('user_id', prof.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (e2) throw e2;
  if (!plant) throw new Error(`No plant for ${email} — recognise one in-app first.`);
  return plant.name;
}

function ensureTool(bin, hint) {
  try { execSync(`command -v ${bin}`, { stdio: 'ignore' }); return true; }
  catch (_) { if (hint) console.warn(hint); return false; }
}

function pngToJpg(src, dst) {
  if (ensureTool('sips')) {
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', src, '--out', dst], { stdio: 'ignore' });
  } else if (ensureTool('magick')) {
    execFileSync('magick', [src, '-quality', '90', dst], { stdio: 'ignore' });
  } else if (ensureTool('convert')) {
    execFileSync('convert', [src, '-quality', '90', dst], { stdio: 'ignore' });
  } else {
    throw new Error('No image converter found (need macOS `sips` or ImageMagick `magick`/`convert`).');
  }
}

async function captureLang(lang, email, password, opts) {
  if (!DEMO_EMAIL_RE.test(email)) throw new Error(`"${email}" is not a *@florascout.app demo account.`);
  const loc = readLocale(lang);
  const loginLoc = readLocale(opts.loginLang);
  const plantName = opts.plant || await fetchPlantName(email);

  const shotDir = path.join(OUT_ROOT, lang);
  fs.mkdirSync(shotDir, { recursive: true });

  const env = {
    EMAIL: email,
    PASSWORD: password,
    PLANT_NAME: plantName,
    SHOT_DIR: shotDir,
    // login-screen labels come from the SIMULATOR language (pre-login)
    LBL_EMAIL: label(loginLoc, ['auth.email'], opts.loginLang),
    LBL_PASSWORD: label(loginLoc, ['auth.password'], opts.loginLang),
    LBL_LOGIN: label(loginLoc, ['auth.login'], opts.loginLang),
    // in-app labels in the account language
    TAB_HOME: label(loc, ['nav.home'], lang),
    TAB_PLANTS: label(loc, ['nav.plants'], lang),
    TAB_ASSISTANT: label(loc, ['nav.assistant'], lang),
    TAB_MORE: label(loc, ['nav.more'], lang),
    MENU_TASKS: label(loc, ['nav.tasks', 'tasks.title'], lang),
    MENU_SHOP: label(loc, ['nav.shop'], lang),
    MENU_LEADERBOARD: label(loc, ['nav.leaderboard', 'leaderboard.title'], lang),
    TAB_HEALTH: label(loc, ['plants.tabHealth'], lang),
    TAB_CARE: label(loc, ['plants.tabCare'], lang),
    LBL_DEX: label(loc, ['nav.dex'], lang),
  };

  const args = ['test'];
  if (opts.device) args.push('--device', opts.device);
  for (const [k, v] of Object.entries(env)) args.push('-e', `${k}=${v}`);
  args.push(FLOW);

  console.log(`\n[${lang}] ${email} | plant "${plantName}" | login-lang ${opts.loginLang}`);
  if (opts.dryRun) { console.log(`  maestro ${args.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`); return; }

  execFileSync('maestro', args, { stdio: 'inherit' });

  // export PNG -> JPG into the landing folder
  const destDir = path.join(LANDING, lang);
  fs.mkdirSync(destDir, { recursive: true });
  let ok = 0;
  for (const name of SHOTS) {
    const png = path.join(shotDir, `${name}.png`);
    if (!fs.existsSync(png)) { console.warn(`  ⚠️  missing ${name}.png (navigation step may need a selector tweak)`); continue; }
    pngToJpg(png, path.join(destDir, `${name}.jpg`));
    ok++;
  }
  if (!opts.keepPng) fs.rmSync(shotDir, { recursive: true, force: true });
  console.log(`  ✓ ${ok}/${SHOTS.length} → store-assets/landing/${lang}/`);
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(FLOW)) { console.error('Missing .maestro/screenshots.yaml'); process.exit(1); }
  const accounts = JSON.parse(fs.readFileSync(ACCOUNTS, 'utf8'));
  const allLangs = Object.keys(accounts).filter((k) => !k.startsWith('_') && accounts[k] && accounts[k].email);
  const langs = a.langs ? String(a.langs).split(',').map((s) => s.trim()).filter(Boolean) : allLangs;
  const password = a.password || process.env.SCREENSHOT_PASSWORD;
  const opts = {
    device: a.device, loginLang: a['login-lang'] || 'de',
    plant: a.plant, keepPng: !!a['keep-png'], dryRun: !!a['dry-run'],
  };

  if (!password && !opts.dryRun) { console.error('Missing --password (or SCREENSHOT_PASSWORD env).'); process.exit(1); }
  if (opts.plant && langs.length > 1) { console.error('--plant only valid for a single --langs entry.'); process.exit(1); }
  if (!opts.dryRun) ensureTool('maestro', null) || (console.error('`maestro` not found on PATH. Install: https://maestro.mobile.dev'), process.exit(1));

  console.log(`Capturing ${langs.length} language(s): ${langs.join(', ')}`);
  const failed = [];
  for (const lang of langs) {
    const acc = accounts[lang];
    if (!acc || !acc.email) { console.warn(`Skipping "${lang}" — no email in screenshot-accounts.json`); continue; }
    try {
      await captureLang(lang, acc.email, acc.password || password, opts);
    } catch (e) {
      console.error(`  ✗ [${lang}] ${e.message || e}`);
      failed.push(lang);
    }
  }
  console.log(`\nDone. ${langs.length - failed.length}/${langs.length} ok${failed.length ? `, failed: ${failed.join(', ')}` : ''}.`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
