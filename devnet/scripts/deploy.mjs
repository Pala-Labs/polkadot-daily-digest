#!/usr/bin/env node
/**
 * Publishes devnet/dist/ to the Polkadot Products Devnet.
 *
 * Default mode is a DRY RUN: it rebuilds, verifies, checks the toolchain, looks
 * up the domain's current owner, and prints the exact commands it would run.
 * Nothing touches the chain until you pass --execute.
 *
 *   node devnet/scripts/deploy.mjs              # dry run
 *   node devnet/scripts/deploy.mjs --execute    # publish
 *
 * The signing mnemonic is read from DEVNET_MNEMONIC and forwarded to the child
 * process as MNEMONIC (which `pad` reads natively). It is deliberately NOT
 * passed as --mnemonic, because argv is world-readable via `ps`.
 */
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT       = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DEVNET_DIR = join(ROOT, 'devnet');
const DIST       = join(DEVNET_DIR, 'dist');
const BIN        = join(DEVNET_DIR, 'node_modules', '.bin');

const execute = process.argv.includes('--execute');
const cfg     = JSON.parse(await readFile(join(DEVNET_DIR, 'config.json'), 'utf8'));
const { domain, env } = cfg;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: DEVNET_DIR, ...opts });
  if (r.status !== 0) { console.error(`\n✗ ${cmd} ${args.join(' ')} exited ${r.status}`); process.exit(1); }
}

const installed = (bin) =>
  spawnSync(join(BIN, bin), ['--version'], { cwd: DEVNET_DIR, stdio: 'ignore' }).status === 0;

// ── Preflight ────────────────────────────────────────────────────────────────
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) { console.error(`✗ Node ${process.versions.node} - pad and dotns require Node 22+`); process.exit(1); }

console.log(`Polkadot Products Devnet · ${domain}.dot · --env ${env}\n`);

console.log('→ Toolchain');
let toolingOk = true;
for (const bin of ['dotns', 'pad']) {
  const ok = installed(bin);
  toolingOk &&= ok;
  console.log(`  ${ok ? '✓' : '✗'} ${bin}${ok ? '' : '   missing - run: npm install --prefix devnet'}`);
}
if (!toolingOk) process.exit(1);

console.log('\n→ Rebuilding bundle');
run(process.execPath, [join(DEVNET_DIR, 'scripts', 'build.mjs')]);
console.log('\n→ Verifying bundle');
run(process.execPath, [join(DEVNET_DIR, 'scripts', 'verify.mjs')]);

// ── The publish plan ─────────────────────────────────────────────────────────
// Steps 1-3 are one-time per signing account; step 4 repeats on every release.
// `pad` defaults to --env paseo-next-v2, so --env devnet is always explicit.
const setup = [
  ['dotns', ['account', 'map', '--env', env],
   'Map your Substrate account to an EVM address (once per account).'],
  ['dotns', ['bulletin', 'authorize', '<YOUR_SS58_ADDRESS>', '--transactions', '1000', '--bytes', '104857600', '--env', env],
   'Grant Bulletin storage allowance. Time-limited - re-run `bulletin refresh` if it expires.'],
  ['dotns', ['register', 'domain', '-n', domain, '--env', env],
   `Register ${domain}.dot via commit-reveal. Takes several minutes. Once only.`],
];
const release = [
  ['pad', ['./dist', `${domain}.dot`, '--env', env],
   'Upload the bundle to Bulletin and repoint the domain at the new CID.'],
];

const show = (steps, offset) => steps.forEach(([bin, args, why], i) => {
  console.log(`\n  ${offset + i}. ${why}`);
  console.log(`     npx ${bin} ${args.join(' ')}`);
});

if (!execute) {
  console.log(`\n→ Domain status`);
  // Read-only RPC query - no transaction, no signing.
  run(join(BIN, 'dotns'), ['lookup', 'owner-of', domain, '--env', env]);

  console.log('\n\nDRY RUN - nothing was sent to the chain. Commands that would run:\n');
  console.log('  One-time account setup');
  show(setup, 1);
  console.log('\n  Every release');
  show(release, 4);
  console.log('\n\nTo publish:');
  console.log('  1. Fund the account at https://faucet.polkadot.io (Paseo Asset Hub)');
  console.log('  2. export DEVNET_MNEMONIC="…"   # or use `npx pad login` for mobile signing');
  console.log('  3. node devnet/scripts/deploy.mjs --execute\n');
  console.log(`Afterwards it is live at https://${domain}.dev-dot.li and ${domain}.dot in the Polkadot app.`);
  process.exit(0);
}

// ── Execute ──────────────────────────────────────────────────────────────────
// Only the repeatable publish step is automated. Account mapping, storage
// authorization and domain registration are one-time and interactive - run
// those by hand from the dry-run output.
if (!process.env.DEVNET_MNEMONIC) {
  console.error('\n✗ DEVNET_MNEMONIC is not set. Export it, then re-run with --execute.');
  console.error('  (Or sign in with `npx --prefix devnet pad login` and use the mobile app instead.)');
  process.exit(1);
}

console.log(`\n→ Publishing ./dist to ${domain}.dot`);
run(join(BIN, 'pad'), [DIST, `${domain}.dot`, '--env', env], {
  env: { ...process.env, MNEMONIC: process.env.DEVNET_MNEMONIC },
});
console.log(`\n✓ Published → https://${domain}.dev-dot.li`);
