#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TOKEN_FILE = path.join(ROOT, 'theme', 'tokens.js');
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const SCAN_TARGETS = [
  'App.js',
  'screens',
  'components',
  'services',
  'theme',
  'hooks',
  'contexts',
  'utils',
  'constants',
  'lib',
];

function extractObjectKeys(source, objectName) {
  const startMarker = `export const ${objectName} = {`;
  const start = source.indexOf(startMarker);
  if (start === -1) return new Set();

  const end = source.indexOf('\n};', start);
  if (end === -1) return new Set();

  const block = source.slice(start, end);
  const keyRegex = /^\s{2}([A-Za-z0-9_]+):/gm;
  const keys = new Set();
  let match;
  while ((match = keyRegex.exec(block)) !== null) {
    keys.add(match[1]);
  }
  return keys;
}

function collectSourceFiles(targetPath, acc) {
  const absolute = path.join(ROOT, targetPath);
  if (!fs.existsSync(absolute)) return;

  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    if (SOURCE_EXTENSIONS.has(path.extname(absolute))) {
      acc.push(absolute);
    }
    return;
  }

  const entries = fs.readdirSync(absolute, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(absolute, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(path.relative(ROOT, fullPath), acc);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      acc.push(fullPath);
    }
  }
}

function findUnknownReferences(files, knownKeys, objectName) {
  const unknown = [];
  const usageRegex = new RegExp(`\\b${objectName}\\.([A-Za-z0-9_]+)`, 'g');

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      let match;
      while ((match = usageRegex.exec(line)) !== null) {
        const key = match[1];
        if (!knownKeys.has(key)) {
          unknown.push({
            file: path.relative(ROOT, file),
            line: index + 1,
            ref: `${objectName}.${key}`,
          });
        }
      }
      usageRegex.lastIndex = 0;
    });
  }

  return unknown;
}

function main() {
  if (!fs.existsSync(TOKEN_FILE)) {
    console.error('Token file not found:', TOKEN_FILE);
    process.exit(1);
  }

  const tokenSource = fs.readFileSync(TOKEN_FILE, 'utf8');
  const knownColors = extractObjectKeys(tokenSource, 'colors');
  const knownRadius = extractObjectKeys(tokenSource, 'radius');

  const files = [];
  for (const target of SCAN_TARGETS) {
    collectSourceFiles(target, files);
  }

  const unknownColors = findUnknownReferences(files, knownColors, 'colors');
  const unknownRadius = findUnknownReferences(files, knownRadius, 'radius');
  const unknown = [...unknownColors, ...unknownRadius];

  if (unknown.length > 0) {
    console.error('Found undefined design tokens:\n');
    for (const item of unknown) {
      console.error(`- ${item.file}:${item.line} -> ${item.ref}`);
    }
    process.exit(1);
  }

  process.stdout.write('Design token check passed.\n');
}

main();
