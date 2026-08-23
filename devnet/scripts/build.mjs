#!/usr/bin/env node
/**
 * Builds the Polkadot Products Devnet bundle into devnet/dist/.
 *
 * Nothing in the repository root is written to or modified - the production
 * site is read, transformed in memory, and emitted into devnet/dist/. Deleting
 * the devnet/ directory removes this deployment path entirely.
 *
 * The devnet edition differs from production in three ways:
 *   1. Only the last N days of each digest edition ship (config.windowDays).
 *   2. Third-party CDN assets are swapped for local copies in vendor/.
 *   3. Sections switched off in config.include are stripped from the markup.
 *
 *   node devnet/scripts/build.mjs [--days 7] [--out <dir>]
 */
import { mkdir, writeFile, readFile, rm, cp, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT       = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DEVNET_DIR = join(ROOT, 'devnet');

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(`--${name}`); return i === -1 ? null : argv[i + 1]; };

const cfg     = JSON.parse(await readFile(join(DEVNET_DIR, 'config.json'), 'utf8'));
const days    = Number(flag('days') ?? cfg.windowDays);
const DIST    = flag('out') ? join(ROOT, flag('out')) : join(DEVNET_DIR, 'dist');

if (!Number.isInteger(days) || days < 1) throw new Error(`--days must be a positive integer, got ${days}`);

// ── Transform helpers ────────────────────────────────────────────────────────
// Every helper throws when its anchor is missing. If someone edits index.html in
// a way that moves these landmarks the build fails loudly here rather than
// silently shipping a broken bundle.

function replaceOnce(html, find, replace, label) {
  const n = html.split(find).length - 1;
  if (n !== 1) throw new Error(`[${label}] expected exactly 1 match, found ${n}`);
  return html.replace(find, replace);
}

function removeExactly(html, find, count, label) {
  const n = html.split(find).length - 1;
  if (n !== count) throw new Error(`[${label}] expected ${count} matches, found ${n}`);
  return html.split(find).join('');
}

/** Cuts from `start` up to (but not including) `end`, replacing with `insert`. */
function cutRegion(html, start, end, insert, label) {
  const a = html.indexOf(start);
  if (a === -1) throw new Error(`[${label}] start anchor not found: ${start.slice(0, 60)}`);
  const b = html.indexOf(end, a + start.length);
  if (b === -1) throw new Error(`[${label}] end anchor not found: ${end.slice(0, 60)}`);
  return html.slice(0, a) + insert + html.slice(b);
}

// ── Digest selection ─────────────────────────────────────────────────────────

const DATE_RE = /^(\d{4}-\d{2}-\d{2})\.html$/;

function shiftDays(iso, delta) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Titles are read the same way .github/workflows/update-manifest.yml reads them. */
function extractTitle(html) {
  const m = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : 'Polkadot Daily Digest';
}

async function selectEditions(dir) {
  const all = (await readdir(join(ROOT, dir)))
    .map(f => f.match(DATE_RE)?.[1])
    .filter(Boolean)
    .sort();
  if (!all.length) throw new Error(`no dated editions found in ${dir}/`);

  // "latest" anchors the window on the newest edition on disk, so a rebuild on a
  // quiet day still ships a full window instead of an empty archive.
  const anchorDate = cfg.anchor === 'today' ? new Date().toISOString().slice(0, 10) : all[all.length - 1];
  const cutoff     = shiftDays(anchorDate, -(days - 1));

  return all.filter(d => d >= cutoff && d <= anchorDate);
}

// ── Build ────────────────────────────────────────────────────────────────────

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  // 1. Digest editions + trimmed manifests -----------------------------------
  const counts = {};
  for (const { key, dir } of cfg.collections) {
    const dates = await selectEditions(dir);
    await mkdir(join(DIST, dir), { recursive: true });

    const manifest = [];
    for (const date of dates) {
      const html = await readFile(join(ROOT, dir, `${date}.html`), 'utf8');
      await writeFile(join(DIST, dir, `${date}.html`), html);
      manifest.push({ date, title: extractTitle(html) });
    }
    // The front-end re-sorts, but match production's newest-first ordering.
    manifest.reverse();
    await writeFile(join(DIST, dir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    counts[key] = { dir, n: dates.length, from: dates[0], to: dates[dates.length - 1] };
  }

  // 2. Static assets ---------------------------------------------------------
  await cp(join(ROOT, 'assets'), join(DIST, 'assets'), { recursive: true });
  if (!cfg.include.monthlyWraps) {
    await rm(join(DIST, 'assets', 'monthly-wraps'), { recursive: true, force: true });
  }
  await cp(join(DEVNET_DIR, 'vendor'), join(DIST, 'vendor'), { recursive: true });

  if (cfg.include.adhocReports) {
    await cp(join(ROOT, 'adhoc-reports'), join(DIST, 'adhoc-reports'), { recursive: true });
  }

  // 3. index.html ------------------------------------------------------------
  let html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const applied = [];

  // 3a. Drop the Google Analytics tag - a devnet build should not report into
  //     production analytics, and it is a third-party origin we cannot rely on.
  if (!cfg.include.analytics) {
    html = cutRegion(html, '<!-- Google tag (gtag.js) -->', '<meta charset="UTF-8">', '', 'analytics');
    applied.push('removed Google Analytics');
  }

  // 3b. Point webfonts and Chart.js at the vendored copies.
  html = cutRegion(
    html,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<style>',
    '<link href="vendor/fonts.css" rel="stylesheet">\n',
    'fonts',
  );
  html = replaceOnce(
    html,
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
    'vendor/chart.umd.min.js',
    'chartjs',
  );
  applied.push('vendored fonts + Chart.js');

  // 3c. Ad-hoc reports: ticker items, nav tab, page, and the flier that links to
  //     them all come out together so no control leads to a missing document.
  if (!cfg.include.adhocReports) {
    html = removeExactly(
      html,
      '    <span class="activity-bar-text">\u{1F514} The Web3 Summit Concluded Last week  - ' +
      '<a href="adhoc-reports/web3-summit-2026-recap.html" class="activity-bar-link">' +
      'Checkout the Summary \u{27A1}\u{FE0F}</a></span>\n',
      2,
      'ticker/web3-summit',
    );
    html = removeExactly(
      html,
      '      <button class="nav-tab"        id="tab-reports"   onclick="nav(\'reports\')">Ad-hoc Reports</button>\n',
      1,
      'nav-tab/reports',
    );
    html = cutRegion(html, '<!-- REPORTS -->', '<!-- METHODOLOGY -->', '', 'page/reports');

    // nav() dereferences every id in this list, so 'reports' must go with the page.
    html = replaceOnce(
      html,
      "['home','digests','community','detail','methodology','disclaimer','reports']",
      "['home','digests','community','detail','methodology','disclaimer']",
      'nav/pages-array',
    );
    html = replaceOnce(
      html,
      "['home','digests','community','reports']",
      "['home','digests','community']",
      'nav/tabs-array',
    );

    // Flier deck: drop page 2 and rebalance the dots, counter and badge.
    html = cutRegion(html, '<!-- Page 2: Web3 Summit 2026 -->', '<!-- Page 0: Newsletter Subscription -->', '', 'flier/page-2');
    html = removeExactly(
      html,
      '        <button class="flier-dot" data-dot="2" aria-label="Web3 Summit"></button>\n',
      1,
      'flier/dot-2',
    );
    html = replaceOnce(html, 'const FLIER_PAGES = 3;', 'const FLIER_PAGES = 2;', 'flier/page-count');
    html = replaceOnce(html, '<span class="fab-badge" id="fab-badge">3</span>',
                             '<span class="fab-badge" id="fab-badge">2</span>', 'flier/fab-badge');
    html = replaceOnce(
      html,
      '// Flippable deck of fliers. Page 0 = Newsletter; Page 1 = Polkadot Products\n// Devnet; Page 2 = Web3 Summit 2026.',
      '// Flippable deck of fliers. Page 0 = Newsletter; Page 1 = Polkadot Products\n// Devnet.',
      'flier/comment',
    );
    applied.push('removed ad-hoc reports (ticker, tab, page, flier)');
  }

  // 3d. Monthly wraps carousel. The carousel JS null-guards on its container, so
  //     removing the markup alone is enough.
  if (!cfg.include.monthlyWraps) {
    html = cutRegion(html, '<!-- MONTHLY WRAPS -->', '<div class="home-block">', '', 'home/monthly-wraps');
    applied.push('removed monthly wraps');
  }

  // 3e. A standing note that this edition is a window, not the full archive.
  const notice = cfg.archiveNotice;
  if (notice?.enabled) {
    const text = notice.text.replace('{days}', String(days));
    html = replaceOnce(
      html,
      '<!-- Masthead -->',
      '<!-- devnet:archive-notice -->\n' +
      '<div style="background:var(--surface-low);border-bottom:1px solid var(--outline-var);' +
      'color:var(--on-surface-var);font-size:0.78rem;text-align:center;padding:7px 16px;">' +
      `${text} <a href="${notice.href}" target="_blank" rel="noopener" ` +
      'style="color:inherit;border-bottom:1px solid var(--outline);text-decoration:none;">' +
      `${notice.linkText}</a></div>\n\n<!-- Masthead -->`,
      'archive-notice',
    );
    applied.push('added archive notice');
  }

  await writeFile(join(DIST, 'index.html'), html);

  // ── Report ────────────────────────────────────────────────────────────────
  console.log(`Built devnet bundle -> ${DIST.replace(ROOT + '/', '')}\n`);
  for (const [key, c] of Object.entries(counts)) {
    console.log(`  ${key.padEnd(10)} ${String(c.n).padStart(2)} editions  ${c.from} → ${c.to}  (${c.dir}/)`);
  }
  console.log(`\n  window     last ${days} days, anchored on "${cfg.anchor}"`);
  console.log(`  target     ${cfg.domain}.dot  (--env ${cfg.env})`);
  for (const a of applied) console.log(`  transform  ${a}`);
}

main().catch(err => { console.error(`\nbuild failed: ${err.message}`); process.exit(1); });
