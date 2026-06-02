#!/usr/bin/env node
/* global __dirname */
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const localesDir = path.join(repoRoot, 'i18n', 'locales');
const sourceLocale = 'de';
const strict = process.argv.includes('--strict');

function readLocale(code) {
  const file = path.join(localesDir, `${code}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function flatten(value, prefix = '', rows = {}) {
  Object.entries(value).forEach(([key, entry]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      flatten(entry, nextKey, rows);
    } else {
      rows[nextKey] = String(entry);
    }
  });
  return rows;
}

function placeholders(value) {
  return [...String(value).matchAll(/{{\s*[\w.]+\s*}}/g)].map((match) => match[0]).sort();
}

function diffPlaceholders(source, target) {
  const sourcePlaceholders = placeholders(source);
  const targetPlaceholders = placeholders(target);
  if (sourcePlaceholders.length !== targetPlaceholders.length) return true;
  return sourcePlaceholders.some((placeholder, index) => placeholder !== targetPlaceholders[index]);
}

const source = flatten(readLocale(sourceLocale));
const sourceKeys = Object.keys(source).sort();
const localeFiles = fs
  .readdirSync(localesDir)
  .filter((file) => file.endsWith('.json'))
  .sort();

let hasProblems = false;

localeFiles.forEach((file) => {
  const code = path.basename(file, '.json');
  const target = flatten(readLocale(code));
  const targetKeys = Object.keys(target).sort();
  const missing = sourceKeys.filter((key) => !(key in target));
  const extra = targetKeys.filter((key) => !(key in source));
  const placeholderMismatch = sourceKeys.filter(
    (key) => key in target && diffPlaceholders(source[key], target[key])
  );

  if (missing.length || extra.length || placeholderMismatch.length) {
    hasProblems = true;
  }

  console.log(
    `${code}: ${targetKeys.length} keys, ${missing.length} missing, ${extra.length} extra, ${placeholderMismatch.length} placeholder mismatches`
  );

  if (missing.length) console.log(`  missing: ${missing.join(', ')}`);
  if (extra.length) console.log(`  extra: ${extra.join(', ')}`);
  if (placeholderMismatch.length) {
    console.log(`  placeholder mismatches: ${placeholderMismatch.join(', ')}`);
  }
});

if (strict && hasProblems) {
  process.exitCode = 1;
}
