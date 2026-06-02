#!/usr/bin/env node
/* global __dirname */
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const localesDir = path.join(repoRoot, 'i18n', 'locales');

const SCRIPT_SAMPLES = [
  { code: 'hi', script: 'Devanagari', sample: 'हिन्दी' },
  { code: 'bn', script: 'Bengali', sample: 'বাংলা' },
  { code: 'ja', script: 'CJK Japanese', sample: '日本語' },
  { code: 'ko', script: 'CJK Korean', sample: '한국어' },
  { code: 'zh-Hans', script: 'CJK Simplified Chinese', sample: '简体中文' },
  { code: 'ar', script: 'Arabic', sample: 'العربية' },
  { code: 'he', script: 'Hebrew', sample: 'עברית' },
  { code: 'fa', script: 'Persian Arabic', sample: 'فارسی' },
  { code: 'ur', script: 'Urdu Nastaliq-compatible Arabic', sample: 'اردو' },
];

function walk(dir, matches = []) {
  if (!fs.existsSync(dir)) return matches;

  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, matches);
      return;
    }
    if (/\.(otf|ttf)$/i.test(entry.name)) matches.push(fullPath);
  });

  return matches;
}

const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const fontFiles = walk(path.join(repoRoot, 'assets'));
let hasProblems = false;

console.log(
  `expo-font dependency: ${packageJson.dependencies?.['expo-font'] ? 'present' : 'missing'}`
);
console.log(`bundled font files: ${fontFiles.length}`);
fontFiles.forEach((file) => console.log(`  ${path.relative(repoRoot, file)}`));

SCRIPT_SAMPLES.forEach(({ code, script, sample }) => {
  const file = path.join(localesDir, `${code}.json`);
  if (!fs.existsSync(file)) {
    hasProblems = true;
    console.log(`${code}: missing locale file for ${script}`);
    return;
  }
  console.log(`${code}: ${script} sample "${sample}" present for device smoke test`);
});

console.log(
  'Result: no extra bundled font is required by the code path; verify glyph rendering on iOS and Android system fonts during release QA.'
);

if (hasProblems) process.exitCode = 1;
