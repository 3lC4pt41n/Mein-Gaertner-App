#!/usr/bin/env node
/* global __dirname */
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const repoRoot = path.resolve(__dirname, '..');
const localesDir = path.join(repoRoot, 'i18n', 'locales');
const localeFiles = fs
  .readdirSync(localesDir)
  .filter((file) => file.endsWith('.json'))
  .sort();

function measure(label, files) {
  const started = performance.now();
  let bytes = 0;
  let keys = 0;

  files.forEach((file) => {
    const fullPath = path.join(localesDir, file);
    bytes += fs.statSync(fullPath).size;
    const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    keys += countKeys(parsed);
  });

  const elapsed = performance.now() - started;
  console.log(
    `${label}: ${files.length} locale(s), ${keys} keys, ${(bytes / 1024).toFixed(
      1
    )} KB parsed in ${elapsed.toFixed(2)} ms`
  );
}

function countKeys(value) {
  return Object.values(value).reduce((count, entry) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return count + countKeys(entry);
    }
    return count + 1;
  }, 0);
}

measure('lazy startup baseline', ['de.json']);
measure('eager all-locales comparison', localeFiles);
