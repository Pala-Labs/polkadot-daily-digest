#!/usr/bin/env node
/**
 * Vendors the site's third-party front-end assets into devnet/vendor/ so the
 * published bundle is fully self-contained.
 *
 * The production site loads Chart.js and its webfonts from CDNs. Inside the
 * Polkadot app host we cannot assume third-party origins are reachable, so the
 * devnet build points at local copies instead.
 *
 * Run this only when the upstream versions change - the output is committed.
 *
 *   node devnet/scripts/vendor.mjs
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT       = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const VENDOR_DIR = join(ROOT, 'devnet', 'vendor');
const FONTS_DIR  = join(VENDOR_DIR, 'fonts');

// Google's CSS API serves woff2 only to browsers that advertise support.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Keep these in sync with the <link>/<script> tags in index.html.
const CHART_JS = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
const FONT_SHEETS = [
  'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,400;1,6..72,600&family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400;1,700&display=swap',
  'https://fonts.cdnfonts.com/css/chomsky',
];

async function get(url, asText = true) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  return asText ? res.text() : Buffer.from(await res.arrayBuffer());
}

/** Turn a remote font URL into a stable, collision-free local filename. */
function localName(url) {
  const { hostname, pathname } = new URL(url);
  const ext  = pathname.split('.').pop().replace(/[^a-z0-9]/gi, '') || 'woff2';
  const stem = pathname.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return `${hostname.split('.')[0]}-${stem}.${ext}`.toLowerCase();
}

async function vendorSheet(sheetUrl) {
  let css = await get(sheetUrl);
  // url() targets may be bare or single/double quoted - cdnfonts quotes, Google doesn't.
  const urls = [...css.matchAll(/url\(\s*['"]?(https:\/\/[^)'"\s]+)['"]?\s*\)/g)].map(m => m[1]);
  const seen = new Map();

  for (const remote of new Set(urls)) {
    const name = localName(remote);
    if (!seen.has(remote)) {
      const bytes = await get(remote, false);
      await writeFile(join(FONTS_DIR, name), bytes);
      seen.set(remote, name);
      console.log(`  font  ${name}  (${(bytes.length / 1024).toFixed(1)} KB)`);
    }
  }
  // Rewrite absolute CDN urls to paths relative to vendor/fonts.css.
  for (const [remote, name] of seen) {
    css = css.split(remote).join(`fonts/${name}`);
  }
  return css;
}

async function main() {
  await rm(VENDOR_DIR, { recursive: true, force: true });
  await mkdir(FONTS_DIR, { recursive: true });

  console.log('Vendoring Chart.js…');
  await writeFile(join(VENDOR_DIR, 'chart.umd.min.js'), await get(CHART_JS, false));

  console.log('Vendoring webfonts…');
  const sheets = [];
  for (const url of FONT_SHEETS) {
    sheets.push(`/* vendored from ${url} */\n${await vendorSheet(url)}`);
  }
  await writeFile(join(VENDOR_DIR, 'fonts.css'), sheets.join('\n\n'));

  console.log(`\nDone -> devnet/vendor/`);
}

main().catch(err => { console.error(`\nvendor failed: ${err.message}`); process.exit(1); });
