#!/usr/bin/env node
/* global __dirname */
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const localesDir = path.join(repoRoot, 'i18n', 'locales');

const SPACING_LANGUAGES = ['nl', 'da', 'pl', 'uk', 'pt-BR', 'pt-PT', 'id', 'hi', 'bn'];
const RTL_SECONDS_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

const SPACING_KEYS = [
  'common.insufficientCreditsMessage',
  'auth.confirmationSentTo',
  'auth.resendConfirmationCooldown',
  'plants.plantsCount',
  'plants.recognizePlant',
  'plants.upgradeHint',
  'tasks.inDays',
  'tasks.completedDiary',
  'tasks.everyNDays',
  'assistant.placeholder',
  'store.purchaseSuccessMessage',
  'leaderboard.streakValue',
  'leaderboard.plantCount',
  'leaderboard.avgHealth',
  'profile.avatarSourceMessage',
  'notifications.taskDueBody',
  'heatmap.yourStats',
  'dex.progress',
  'dex.discoveredBy',
  'dex.heatmapDiscoveries',
  'dex.heatmapRegions',
  'ben.taskCreatedMessage',
  'ben.recurringTaskCreatedMessage',
];

function readLocale(code) {
  return JSON.parse(fs.readFileSync(path.join(localesDir, `${code}.json`), 'utf8'));
}

function writeLocale(code, data) {
  fs.writeFileSync(path.join(localesDir, `${code}.json`), `${JSON.stringify(data, null, 2)}\n`);
}

function getPath(object, dottedPath) {
  return dottedPath.split('.').reduce((current, part) => current?.[part], object);
}

function setPath(object, dottedPath, value) {
  const parts = dottedPath.split('.');
  let cursor = object;
  for (let index = 0; index < parts.length - 1; index += 1) {
    cursor = cursor[parts[index]];
  }
  cursor[parts[parts.length - 1]] = value;
}

function normalizePlaceholderSpacing(value) {
  return String(value)
    .replace(/([^\s([{])({{\s*[\w.]+\s*}})/g, '$1 $2')
    .replace(/({{\s*[\w.]+\s*}})([^\s)\].,;:!?，。،؛؟।॥])/g, (match, placeholder, next) => {
      if (/{{\s*seconds\s*}}/.test(placeholder) && next === 's') return match;
      return `${placeholder} ${next}`;
    })
    .replace(/({{\s*[\w.]+\s*}})\s+([।॥])/g, '$1$2')
    .replace(/[ \t]{2,}/g, ' ');
}

function fixLocale(code, keys) {
  const data = readLocale(code);
  let changed = 0;

  keys.forEach((key) => {
    const current = getPath(data, key);
    if (typeof current !== 'string') {
      throw new Error(`${code}: ${key} is not a string`);
    }
    const next = normalizePlaceholderSpacing(current);
    if (next !== current) {
      setPath(data, key, next);
      changed += 1;
    }
  });

  if (changed > 0) writeLocale(code, data);
  console.log(`${code}: ${changed} spacing fixes`);
}

SPACING_LANGUAGES.forEach((code) => fixLocale(code, SPACING_KEYS));
RTL_SECONDS_LANGUAGES.forEach((code) => fixLocale(code, ['auth.resendConfirmationCooldown']));
