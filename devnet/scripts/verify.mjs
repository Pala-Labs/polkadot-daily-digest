#!/usr/bin/env node
/**
 * Dry-run checks on devnet/dist/ before publishing. Catches the failure modes
 * that only show up after a bundle is already pinned and paid for: a dangling
 * relative path, a CDN reference that survived vendoring, a nav tab pointing at
 * a page the build removed, or JS the transforms broke.
 *
 *   node devnet/scripts/verify.mjs
 *
 * Exits non-zero on any failure.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DIST = join(ROOT, 'devnet', 'dist');

// Origins the vendoring step is supposed to have eliminated. Anything still
// pointing here means the bundle is not self-contained.
const MUST_NOT_APPEAR = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'fonts.cdnfonts.com',
  'cdn.jsdelivr.net',
  'googletagmanager.com',
];

const BULLETIN_BYTES = 100 * 1024 * 1024;  // default `pad-bootstrap` authorization

const failures = [];
const notes    = [];
const fail = (msg) => failures.push(msg);

const exists = (p) => stat(p).then(() => true, () => false);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

async function main() {
  if (!await exists(join(DIST, 'index.html'))) {
    console.error('No bundle found. Run: node devnet/scripts/build.mjs');
    process.exit(1);
  }
  const html = await readFile(join(DIST, 'index.html'), 'utf8');

  // 1. No third-party origins that should have been vendored -----------------
  for (const origin of MUST_NOT_APPEAR) {
    if (html.includes(origin)) fail(`index.html still references ${origin} - re-run vendor.mjs`);
  }

  // 2. Every relative src/href resolves inside the bundle ---------------------
  const refs = new Set(
    [...html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)].map(m => m[1])
      .filter(v => !/^(https?:|data:|mailto:|javascript:|#|\/\/)/.test(v))
      // Skip urls the page concatenates at runtime inside JS string literals.
      .filter(v => !/['"]\s*\+|\+\s*['"]|\$\{/.test(v)),
  );
  for (const ref of refs) {
    const clean = ref.split('#')[0].split('?')[0];
    if (!clean) continue;
    if (!await exists(join(DIST, normalize(clean)))) fail(`dangling reference: ${ref}`);
  }

  // 3. Paths baked into JS string literals (fetch targets, openReport args) ---
  for (const m of html.matchAll(/'((?:assets|vendor|adhoc-reports|monthly-digests)\/[^']+)'/g)) {
    if (!await exists(join(DIST, normalize(m[1])))) fail(`dangling path in script: ${m[1]}`);
  }
  if (html.includes('adhoc-reports/') && !await exists(join(DIST, 'adhoc-reports'))) {
    fail('index.html links to adhoc-reports/ but the directory was not bundled');
  }

  // 4. Every page id nav() dereferences actually exists -----------------------
  const navArr = html.match(/\[((?:'[a-z]+',?\s*)+)\]\.forEach\(p =>/);
  if (!navArr) fail('could not locate the nav() page array - the transform may have broken it');
  else {
    for (const page of navArr[1].match(/'([a-z]+)'/g).map(s => s.slice(1, -1))) {
      if (!html.includes(`id="page-${page}"`)) fail(`nav() targets page "${page}" but #page-${page} is missing`);
    }
  }

  // 5. Flier deck: dot count must match FLIER_PAGES ---------------------------
  const declared = Number(html.match(/const FLIER_PAGES = (\d+);/)?.[1]);
  const dots     = (html.match(/class="flier-dot"/g) || []).length;
  // Anchored to line start so the "how to add a page" comment in the script
  // (which contains a sample <article> tag) is not counted as a real page.
  const pages    = (html.match(/^\s*<article class="flier-page[^"]*" data-page=/gm) || []).length;
  if (!(declared === dots && declared === pages)) {
    fail(`flier deck out of sync: FLIER_PAGES=${declared}, dots=${dots}, pages=${pages}`);
  }
  const badge = Number(html.match(/id="fab-badge">(\d+)</)?.[1]);
  if (badge !== declared) fail(`flier FAB badge shows ${badge} but there are ${declared} pages`);

  // 6. Inline scripts still parse --------------------------------------------
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  scripts.forEach((src, i) => {
    try { new Script(src); } catch (e) { fail(`inline <script> #${i + 1} does not parse: ${e.message}`); }
  });

  // 7. Manifests agree with what is on disk -----------------------------------
  for (const dir of ['digests', 'community_digests']) {
    const manifestPath = join(DIST, dir, 'manifest.json');
    if (!await exists(manifestPath)) { fail(`${dir}/manifest.json missing`); continue; }
    const entries = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (!entries.length) fail(`${dir}/manifest.json is empty`);
    for (const e of entries) {
      if (!await exists(join(DIST, dir, `${e.date}.html`))) fail(`${dir}/manifest.json lists ${e.date} but the file is absent`);
    }
    const onDisk = (await readdir(join(DIST, dir))).filter(f => /^\d{4}-\d{2}-\d{2}\.html$/.test(f)).length;
    if (onDisk !== entries.length) fail(`${dir}: ${onDisk} files on disk vs ${entries.length} manifest entries`);
    notes.push(`${dir.padEnd(18)} ${entries.length} editions  ${entries[entries.length - 1]?.date} → ${entries[0]?.date}`);
  }

  // 8. Size against the Bulletin storage authorization -------------------------
  const files = await walk(DIST);
  const bytes = (await Promise.all(files.map(f => stat(f).then(s => s.size)))).reduce((a, b) => a + b, 0);
  notes.push(`bundle             ${files.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MiB`);
  if (bytes > BULLETIN_BYTES) {
    fail(`bundle is ${(bytes / 1024 / 1024).toFixed(1)} MiB, over the 100 MiB default Bulletin authorization`);
  }

  // 9. External origins the bundle still talks to at runtime -------------------
  const origins = [...new Set([...html.matchAll(/https:\/\/([a-z0-9.-]+)/gi)].map(m => m[1].toLowerCase()))].sort();

  // ── Report ────────────────────────────────────────────────────────────────
  console.log('Devnet bundle verification\n');
  for (const n of notes) console.log(`  ${n}`);
  console.log(`\n  outbound origins retained (${origins.length}):`);
  for (const o of origins) console.log(`    ${o}`);

  if (failures.length) {
    console.error(`\n${failures.length} problem(s):`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('\n  ✓ all checks passed - bundle is ready for `pad`');
}

main().catch(err => { console.error(`verify failed: ${err.message}`); process.exit(1); });
