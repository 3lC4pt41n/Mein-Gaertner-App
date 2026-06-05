#!/usr/bin/env node
/* eslint-disable no-console */
/* global __dirname */
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
 *   --location <name>    override home/location name for the "home-zones" shot (single-lang only)
 *   --zone <name>        override first-room name for the "plants-by-room" shot (single-lang only)
 *   --flow <name>        full (default), home-zones, details, or assistant-chat
 *   --keep-png           keep the raw PNGs under .maestro/.out/<lang>/
 *   --dry-run            print the planned maestro commands without running them
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FLOWS = {
  full: path.join(ROOT, '.maestro', 'screenshots.yaml'),
  'home-zones': path.join(ROOT, '.maestro', 'screenshot-home-zones.yaml'),
  details: path.join(ROOT, '.maestro', 'screenshot-details.yaml'),
  'assistant-chat': path.join(ROOT, '.maestro', 'screenshot-assistant-chat.yaml'),
};
const ACCOUNTS = path.join(ROOT, 'scripts', 'screenshot-accounts.json');
const LANDING = path.join(ROOT, 'store-assets', 'landing');
const OUT_ROOT = path.join(ROOT, '.maestro', '.out');
const APP_ID = 'com.elcaptain.digitalergaertner';
const ASYNC_STORAGE_DIR = path.join(
  'Library',
  'Application Support',
  APP_ID,
  'RCTAsyncLocalStorage_V1'
);
const DEMO_EMAIL_RE = /@florascout\.app$/i;
const ASYNC_STORAGE_INLINE_THRESHOLD = 1024;
const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur']);

const SHOTS = [
  'home-zones',
  'plants-by-room',
  'plants-overview',
  'plant-dex',
  'details-health',
  'details-properties',
  'tasks',
  'assistant-chat',
  'shop-credits',
  'leaderboard',
];
const SHOT_SETS = {
  full: SHOTS,
  'home-zones': ['home-zones'],
  details: ['details-health', 'details-properties'],
  'assistant-chat': ['assistant-chat'],
};

function loadEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined)
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch (_) {
    /* rely on shell env */
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

const get = (obj, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), obj);

function readLocale(lang) {
  const f = path.join(ROOT, 'i18n', 'locales', `${lang}.json`);
  if (!fs.existsSync(f)) throw new Error(`Missing locale file: i18n/locales/${lang}.json`);
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function regexEscape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactRegex(value) {
  return `^${regexEscape(value)}$`;
}

function containsRegex(value) {
  return `.*${regexEscape(value)}.*`;
}

function tabRegex(value) {
  return `^${regexEscape(value)}, tab, [1-5] of 5$`;
}

function getSupabaseConfig({ serviceRole = false } = {}) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = serviceRole
    ? process.env.SUPABASE_SECRET_KEY
    : process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      serviceRole
        ? 'Need EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY.'
        : 'Need EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'
    );
  }
  return { url, key };
}

function createSupabaseClient({ serviceRole = false } = {}) {
  const { createClient } = require('@supabase/supabase-js');
  const { url, key } = getSupabaseConfig({ serviceRole });
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// label with fallbacks across keys; throws if none resolve
function label(loc, keys, lang) {
  for (const k of keys) {
    const v = get(loc, k);
    if (typeof v === 'string' && v) return v;
  }
  throw new Error(`No label for [${keys.join(', ')}] in ${lang}.json`);
}

async function fetchPlantName(email) {
  const sb = createSupabaseClient({ serviceRole: true });
  const { data: prof, error: e1 } = await sb
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (e1) throw e1;
  if (!prof) throw new Error(`No profile for ${email}`);
  const { data: plant, error: e2 } = await sb
    .from('plants')
    .select('name')
    .eq('user_id', prof.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e2) throw e2;
  if (!plant) throw new Error(`No plant for ${email} — recognise one in-app first.`);
  return plant.name;
}

async function fetchFirstLocationName(email) {
  const sb = createSupabaseClient({ serviceRole: true });
  const { data: prof, error: e1 } = await sb
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (e1) throw e1;
  if (!prof) throw new Error(`No profile for ${email}`);
  const { data: loc, error: e2 } = await sb
    .from('locations')
    .select('name')
    .eq('user_id', prof.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (e2) throw e2;
  if (!loc) throw new Error(`No location for ${email} — seed homes first.`);
  return loc.name;
}

async function fetchFirstZone(email) {
  const sb = createSupabaseClient({ serviceRole: true });
  const { data: prof, error: e1 } = await sb
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (e1) throw e1;
  if (!prof) throw new Error(`No profile for ${email}`);
  const { data: locs, error: e2 } = await sb.from('locations').select('id').eq('user_id', prof.id);
  if (e2) throw e2;
  const locIds = (locs || []).map((l) => l.id);
  if (!locIds.length) throw new Error(`No location for ${email} — seed rooms first.`);
  const { data: zone, error: e3 } = await sb
    .from('zones')
    .select('name')
    .in('location_id', locIds)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (e3) throw e3;
  if (!zone) throw new Error(`No zone for ${email} — seed rooms first.`);
  return zone.name;
}

function simctlTarget(device) {
  return device || 'booted';
}

function getIosAppDataContainer(device) {
  const target = simctlTarget(device);
  try {
    return execFileSync('xcrun', ['simctl', 'get_app_container', target, APP_ID, 'data'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (e) {
    const stderr = e.stderr ? String(e.stderr).trim() : '';
    throw new Error(
      `Cannot find iOS app data container for ${APP_ID}. Install and boot the simulator first.${
        stderr ? ` ${stderr}` : ''
      }`
    );
  }
}

function stopIosApp(device) {
  try {
    execFileSync('xcrun', ['simctl', 'terminate', simctlTarget(device), APP_ID], {
      stdio: 'ignore',
    });
  } catch (_) {
    // The app may not be running; seeding can continue.
  }
}

function grantIosScreenshotPermissions(device) {
  try {
    execFileSync(
      'xcrun',
      ['simctl', 'privacy', simctlTarget(device), 'grant', 'location', APP_ID],
      { stdio: 'ignore' }
    );
  } catch (_) {
    // Older simulator runtimes or a missing app install can reject this. The
    // Maestro flow still handles the visible prompt as a fallback.
  }
}

function primeIosDirection(lang, opts) {
  if (!RTL_LANGS.has(lang)) return;
  console.log('  prime iOS RTL direction');
  try {
    execFileSync('xcrun', ['simctl', 'launch', simctlTarget(opts.device), APP_ID], {
      stdio: 'ignore',
    });
  } catch (_) {
    // The RTL switch may trigger a reload/termination; the next Maestro launch is what matters.
  }
  execFileSync('sleep', ['8'], { stdio: 'ignore' });
  stopIosApp(opts.device);
}

function writeAsyncStorageValue(storageDir, manifest, key, value) {
  if (value.length <= ASYNC_STORAGE_INLINE_THRESHOLD) {
    manifest[key] = value;
    return;
  }
  manifest[key] = null;
  const fileName = crypto.createHash('md5').update(key).digest('hex');
  fs.writeFileSync(path.join(storageDir, fileName), value);
}

async function seedIosSession(email, password, opts) {
  const sb = createSupabaseClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Supabase login failed for ${email}: ${error.message}`);
  if (!data.session?.access_token || !data.user?.id) {
    throw new Error(`Supabase login did not return a usable session for ${email}`);
  }

  stopIosApp(opts.device);

  const { url } = getSupabaseConfig();
  const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  const container = getIosAppDataContainer(opts.device);
  const storageDir = path.join(container, ASYNC_STORAGE_DIR);
  fs.rmSync(storageDir, { recursive: true, force: true });
  fs.mkdirSync(storageDir, { recursive: true });

  const manifest = {};
  writeAsyncStorageValue(storageDir, manifest, storageKey, JSON.stringify(data.session));
  writeAsyncStorageValue(storageDir, manifest, `beta_welcome_shown_${data.user.id}`, 'true');
  fs.writeFileSync(path.join(storageDir, 'manifest.json'), JSON.stringify(manifest));
}

function ensureTool(bin, hint) {
  try {
    execSync(`command -v ${bin}`, { stdio: 'ignore' });
    return true;
  } catch (_) {
    if (hint) console.warn(hint);
    return false;
  }
}

function pngToJpg(src, dst) {
  if (ensureTool('sips')) {
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', src, '--out', dst], {
      stdio: 'ignore',
    });
  } else if (ensureTool('magick')) {
    execFileSync('magick', [src, '-quality', '90', dst], { stdio: 'ignore' });
  } else if (ensureTool('convert')) {
    execFileSync('convert', [src, '-quality', '90', dst], { stdio: 'ignore' });
  } else {
    throw new Error(
      'No image converter found (need macOS `sips` or ImageMagick `magick`/`convert`).'
    );
  }
}

async function captureLang(lang, email, password, opts) {
  if (!DEMO_EMAIL_RE.test(email))
    throw new Error(`"${email}" is not a *@florascout.app demo account.`);
  const loc = readLocale(lang);
  const loginLoc = readLocale(opts.loginLang);
  const plantName = opts.plant || (await fetchPlantName(email));
  const locationName = opts.location || (await fetchFirstLocationName(email));
  const zoneName = opts.zone || (await fetchFirstZone(email));

  const shotDir = path.join(OUT_ROOT, lang);
  fs.mkdirSync(shotDir, { recursive: true });

  const env = {
    EMAIL: email,
    PASSWORD: password,
    PLANT_NAME: plantName,
    LOCATION_NAME: locationName,
    ZONE_NAME: zoneName,
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
    // Plants-tab segments: "All" (flat list) and "Homes" (rooms accordion)
    TAB_PLANTS_ALL: label(loc, ['plants.tabAll'], lang),
    TAB_PLANTS_HOMES: label(loc, ['plants.tabHomes'], lang),
    TAB_HEALTH: label(loc, ['plants.healthLabel', 'plants.tabHealth'], lang),
    TAB_CARE: label(loc, ['plants.tabCare'], lang),
    // Plant-Dex: opened via the CTA bar (dex.title); the Dex screen header is nav.dex
    DEX_CTA: label(loc, ['dex.title', 'nav.dex'], lang),
    LBL_DEX: label(loc, ['nav.dex', 'dex.title'], lang),
  };
  Object.assign(env, {
    PLANT_NAME_RE: containsRegex(plantName),
    LOCATION_NAME_RE: containsRegex(locationName),
    ZONE_NAME_RE: containsRegex(zoneName),
    TAB_HOME_RE: tabRegex(env.TAB_HOME),
    TAB_PLANTS_RE: tabRegex(env.TAB_PLANTS),
    TAB_ASSISTANT_RE: tabRegex(env.TAB_ASSISTANT),
    TAB_MORE_RE: tabRegex(env.TAB_MORE),
    TAB_MORE_BACK_RE: exactRegex(env.TAB_MORE),
    MENU_TASKS_RE: containsRegex(env.MENU_TASKS),
    MENU_SHOP_RE: containsRegex(env.MENU_SHOP),
    MENU_LEADERBOARD_RE: containsRegex(env.MENU_LEADERBOARD),
    TAB_PLANTS_ALL_RE: exactRegex(env.TAB_PLANTS_ALL),
    TAB_PLANTS_HOMES_RE: exactRegex(env.TAB_PLANTS_HOMES),
    TAB_HEALTH_RE: containsRegex(env.TAB_HEALTH),
    TAB_CARE_RE: containsRegex(env.TAB_CARE),
    DEX_CTA_RE: containsRegex(env.DEX_CTA),
    LBL_DEX_RE: containsRegex(env.LBL_DEX),
  });

  const flow = FLOWS[opts.flow];
  const shots = SHOT_SETS[opts.flow];
  const args = ['test'];
  if (opts.device) args.push('--device', opts.device);
  for (const [k, v] of Object.entries(env)) args.push('-e', `${k}=${v}`);
  args.push(flow);

  console.log(
    `\n[${lang}] ${email} | plant "${plantName}" | location "${locationName}" | login-lang ${opts.loginLang}`
  );
  if (opts.dryRun) {
    console.log(`  seed iOS AsyncStorage session for ${email}`);
    console.log(
      `  maestro ${args.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`
    );
    return;
  }

  await seedIosSession(email, password, opts);
  grantIosScreenshotPermissions(opts.device);
  primeIosDirection(lang, opts);
  execFileSync('maestro', args, { stdio: 'inherit' });

  // export PNG -> JPG into the landing folder
  const destDir = path.join(LANDING, lang);
  fs.mkdirSync(destDir, { recursive: true });
  let ok = 0;
  for (const name of shots) {
    const png = path.join(shotDir, `${name}.png`);
    if (!fs.existsSync(png)) {
      console.warn(`  ⚠️  missing ${name}.png (navigation step may need a selector tweak)`);
      continue;
    }
    pngToJpg(png, path.join(destDir, `${name}.jpg`));
    ok++;
  }
  if (!opts.keepPng) fs.rmSync(shotDir, { recursive: true, force: true });
  console.log(`  ✓ ${ok}/${shots.length} → store-assets/landing/${lang}/`);
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const flow = a.flow || 'full';
  if (!FLOWS[flow]) {
    console.error(`Unknown --flow "${flow}". Use: ${Object.keys(FLOWS).join(', ')}`);
    process.exit(1);
  }
  if (!fs.existsSync(FLOWS[flow])) {
    console.error(`Missing ${path.relative(ROOT, FLOWS[flow])}`);
    process.exit(1);
  }
  const accounts = JSON.parse(fs.readFileSync(ACCOUNTS, 'utf8'));
  const allLangs = Object.keys(accounts).filter(
    (k) => !k.startsWith('_') && accounts[k] && accounts[k].email
  );
  const langs = a.langs
    ? String(a.langs)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : allLangs;
  const password = a.password || process.env.SCREENSHOT_PASSWORD;
  const opts = {
    device: a.device,
    loginLang: a['login-lang'] || 'de',
    plant: a.plant,
    location: a.location,
    zone: a.zone,
    flow,
    keepPng: !!a['keep-png'],
    dryRun: !!a['dry-run'],
  };

  if (!password && !opts.dryRun) {
    console.error('Missing --password (or SCREENSHOT_PASSWORD env).');
    process.exit(1);
  }
  if (opts.plant && langs.length > 1) {
    console.error('--plant only valid for a single --langs entry.');
    process.exit(1);
  }
  if (opts.location && langs.length > 1) {
    console.error('--location only valid for a single --langs entry.');
    process.exit(1);
  }
  if (opts.zone && langs.length > 1) {
    console.error('--zone only valid for a single --langs entry.');
    process.exit(1);
  }
  if (!opts.dryRun)
    ensureTool('maestro', null) ||
      (console.error('`maestro` not found on PATH. Install: https://maestro.mobile.dev'),
      process.exit(1));

  console.log(`Capturing ${langs.length} language(s): ${langs.join(', ')}`);
  const failed = [];
  for (const lang of langs) {
    const acc = accounts[lang];
    if (!acc || !acc.email) {
      console.warn(`Skipping "${lang}" — no email in screenshot-accounts.json`);
      continue;
    }
    try {
      await captureLang(lang, acc.email, acc.password || password, opts);
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
