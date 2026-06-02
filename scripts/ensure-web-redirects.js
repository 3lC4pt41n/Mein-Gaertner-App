const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const source = path.join(repoRoot, 'public', '_redirects');
const distDir = path.join(repoRoot, 'dist');
const target = path.join(distDir, '_redirects');
const expoIconFontUrlPattern =
  /\/assets\/node_modules\/@expo\/vector-icons\/build\/vendor\/react-native-vector-icons\/Fonts\/([^"'`\s]+?\.ttf)/g;

if (!fs.existsSync(source)) {
  throw new Error('Missing public/_redirects for Cloudflare Pages SPA fallback.');
}

if (!fs.existsSync(distDir)) {
  throw new Error('Missing dist/. Run expo export before copying Cloudflare redirects.');
}

fs.copyFileSync(source, target);

const webBundleDir = path.join(distDir, '_expo', 'static', 'js', 'web');
const fontTargetDir = path.join(distDir, 'assets', 'vector-icons');
const webBundles = fs
  .readdirSync(webBundleDir)
  .filter((fileName) => fileName.endsWith('.js'))
  .map((fileName) => path.join(webBundleDir, fileName));
const copiedFonts = new Set();
let rewrittenReferences = 0;

fs.mkdirSync(fontTargetDir, { recursive: true });

for (const bundlePath of webBundles) {
  const originalContents = fs.readFileSync(bundlePath, 'utf8');
  const rewrittenContents = originalContents.replace(
    expoIconFontUrlPattern,
    (assetUrl, fileName) => {
      const sourceFontPath = path.join(distDir, assetUrl.slice(1));
      const targetFontPath = path.join(fontTargetDir, fileName);

      if (!fs.existsSync(sourceFontPath)) {
        throw new Error(`Missing Expo vector icon font asset: ${sourceFontPath}`);
      }

      if (!copiedFonts.has(fileName)) {
        fs.copyFileSync(sourceFontPath, targetFontPath);
        copiedFonts.add(fileName);
      }

      rewrittenReferences += 1;
      return `/assets/vector-icons/${fileName}`;
    }
  );

  if (rewrittenContents !== originalContents) {
    fs.writeFileSync(bundlePath, rewrittenContents);
  }
}

if (rewrittenReferences === 0) {
  throw new Error('No Expo vector icon font references found in the web bundle.');
}

process.stdout.write(
  `Prepared Cloudflare web export: copied ${copiedFonts.size} vector icon fonts and rewrote ${rewrittenReferences} references.\n`
);
