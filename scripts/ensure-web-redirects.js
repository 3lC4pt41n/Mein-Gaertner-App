const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const source = path.join(repoRoot, 'public', '_redirects');
const distDir = path.join(repoRoot, 'dist');
const target = path.join(distDir, '_redirects');

if (!fs.existsSync(source)) {
  throw new Error('Missing public/_redirects for Cloudflare Pages SPA fallback.');
}

if (!fs.existsSync(distDir)) {
  throw new Error('Missing dist/. Run expo export before copying Cloudflare redirects.');
}

fs.copyFileSync(source, target);
console.log('Copied public/_redirects to dist/_redirects');
