# Devnet deployment

Publishes a trimmed copy of the site to the **Polkadot Products Devnet** as
`dailydigest.dot`, reachable at `https://dailydigest.dev-dot.li` on the web
gateway and as `dailydigest.dot` inside the Polkadot app.

This directory is **self-contained and additive**. It reads the production site
and writes only into `devnet/dist/`. No build ever modifies a file outside
`devnet/`, and the live site at [news.openshore.io](https://news.openshore.io)
is unaffected by anything in here.

The one deliberate exception is a link: flier page 1 in `index.html` points
readers at the devnet edition. It is three lines of markup and is listed in the
removal steps below.

> **To remove the devnet deployment entirely:**
>
> 1. Delete `devnet/`.
> 2. Delete the `# Devnet deployment` block at the bottom of `.gitignore` (the
>    secrets rules above it are general - leave them).
> 3. In `index.html`, drop the *Devnet Edition* link and the sentence above it
>    from flier page 1 (search for `dev-dot.li`).
>
> That is the whole footprint. Step 3 is the only reference from outside this
> directory, and it is cosmetic - leaving it just means a dead link.

---

## How the devnet edition differs from production

| | Production | Devnet |
|---|---|---|
| Archive depth | Full (112+ daily, 74+ community editions) | Last **7 days** of each edition |
| Webfonts, Chart.js | Google Fonts / jsDelivr CDN | Vendored into `vendor/` |
| Google Analytics | On | Removed |
| Ad-hoc Reports tab | On | Removed |
| Monthly Wraps, Methodology, Twitter Activity | On | On |
| Archive notice strip | - | Added, links back to the full archive |
| Devnet flier link | Points at `dailydigest.dev-dot.li` | Same (self-referential) |

Everything else - layout, navigation, theming, the Socials/Legacy editions, the
flier deck - is byte-identical to production. The build never edits
`index.html` in place; it transforms a copy in memory.

The Twitter Activity charts still read from Supabase at runtime, so that tab
needs outbound network from the app host. It already degrades to a "couldn't
load" message if the request is blocked, so the rest of the app is unaffected.

## Layout

```
devnet/
├── config.json                     # domain, window size, feature toggles
├── polkadot-app-deploy.config.ts   # product manifest (Browse card metadata)
├── app-icon.svg                    # source mark, lifted from the OpenShore logo
├── app-icon.png                    # 512x512 render; `pad` requires it
├── package.json                    # pins dotns + pad locally, not globally
├── scripts/
│   ├── vendor.mjs                  # downloads Chart.js + webfonts -> vendor/
│   ├── build.mjs                   # emits dist/
│   ├── verify.mjs                  # pre-publish checks on dist/
│   └── deploy.mjs                  # dry-run by default, --execute to publish
├── vendor/                         # committed, regenerate only on version bumps
└── dist/                           # git-ignored build output
```

## Usage

```bash
npm install --prefix devnet      # once

node devnet/scripts/build.mjs    # -> devnet/dist/
node devnet/scripts/verify.mjs   # pre-publish checks
node devnet/scripts/deploy.mjs   # dry run: prints every command, sends nothing
```

Preview the bundle exactly as the gateway serves it:

```bash
python3 -m http.server 8899 --directory devnet/dist
```

Change the window without editing config: `node devnet/scripts/build.mjs --days 14`.

## Configuration

`config.json`:

| Key | Meaning |
|---|---|
| `domain` | Name without the `.dot` suffix. Must match `polkadot-app-deploy.config.ts`. |
| `env` | `pad`/`dotns` environment id. **Must be `devnet`** - `pad` defaults to `paseo-next-v2`. |
| `windowDays` | How many days of editions to ship. |
| `anchor` | `latest` windows back from the newest edition on disk; `today` from the current date. `latest` guarantees a full window even if a day is missed. |
| `include.analytics` | Google Analytics tag. Off. |
| `include.adhocReports` | Ad-hoc Reports tab, ticker item, page and flier. Off. |
| `include.monthlyWraps` | Monthly Wraps carousel. On. Turning it off also drops ~3 MB of cover images. |
| `archiveNotice` | The strip under the ticker pointing at the full archive. |

The build asserts on every markup landmark it touches. If someone restructures
`index.html`, the build **fails loudly** with the name of the transform that
lost its anchor rather than silently shipping a broken bundle.

## Deploying today's update

This is the whole daily routine. Run it after the day's editions have landed in
`digests/` and `community_digests/`.

```bash
export DEVNET_MNEMONIC="…"                    # devnet-only seed, see Signing below
node devnet/scripts/deploy.mjs --execute
```

That single command rebuilds, verifies and publishes. Nothing else is needed -
the window is not pinned to a date anywhere, so a rebuild automatically rolls
forward to the newest seven editions on disk.

What it does, in order:

1. Checks Node 22+ and that `dotns`/`pad` resolve.
2. **Rebuilds** `dist/` from the current `index.html` and the newest 7 editions.
   `anchor: "latest"` windows back from the newest file present, so a missed day
   still yields a full seven.
3. **Verifies** the bundle - forbidden CDN origins, dangling refs, flier deck
   consistency, manifest↔disk agreement, size. It **refuses to publish** if any
   check fails.
4. **Uploads** `dist/` to Bulletin as one CAR and repoints `dailydigest.dot` at
   the new CID, then writes the `manifest` and `executable` text records.

Expect it to take a few minutes; the text-record steps wait on chain
finalization. Confirm afterwards:

```bash
npx --prefix devnet dotns lookup owner-of dailydigest --env devnet
npx --prefix devnet dotns text view dailydigest manifest --env devnet
npx --prefix devnet dotns text view app.dailydigest executable --env devnet
```

Then open <https://dailydigest.dev-dot.li>. The gateway is a client-side shell
that unpacks the CAR in the browser, so `curl` on that URL always returns the
same ~20 KB loader - it is not a sign the deploy failed. Check the browser, or
compare CIDs against `dist/` if you want proof.

**Dry run first**, any time you want to see the plan without touching the chain:

```bash
node devnet/scripts/deploy.mjs        # no --execute: builds, verifies, prints commands
```

**Publishing an off-cycle window** (say a 14-day edition) needs the build and the
publish split, since `deploy.mjs` always rebuilds with the configured window:

```bash
node devnet/scripts/build.mjs --days 14
node devnet/scripts/verify.mjs
npx --prefix devnet pad ./dist dailydigest.dot --env devnet
```

### Signing

The mnemonic is passed to `pad` through the environment, never as a
command-line argument - argv is readable by any process on the machine via `ps`.
Keep it out of the repo entirely; `.gitignore` blocks `*.env` and `*.mnemonic`
as a backstop, but the safest place is your shell keychain or a file under
`/tmp`. **Use a devnet-only seed** - never one holding real value.

Two alternatives that avoid handling the seed at all:

```bash
npx --prefix devnet pad login          # sign from the Polkadot mobile app
export DOTNS_KEYSTORE_PASSWORD="…"     # or use the encrypted keystore in ~/.dotns
```

### Troubleshooting

| Symptom | Cause |
|---|---|
| `DEVNET_MNEMONIC is not set` | Env not exported into *this* shell. Note that piping `deploy.mjs` into `tail` masks its exit code. |
| `Keystore password:` prompt hangs | No mnemonic in env, so it fell back to `~/.dotns/keystore`. Export the seed or `DOTNS_KEYSTORE_PASSWORD`. |
| `ERR_PACKAGE_PATH_NOT_EXPORTED` | The `polkadot-api` override was lost. Re-run `npm install --prefix devnet`. |
| `icon.path … not found` (exit 78) | `app-icon.png` missing. Regenerate it - see `polkadot-app-deploy.config.ts`. |
| Upload rejected by Bulletin | Allowance expired or exhausted. Check with `dotns bulletin status --env devnet`, extend with `dotns bulletin refresh --env devnet`. |
| Build throws `[transform] anchor not found` | Someone restructured `index.html`. Fix the anchor in `scripts/build.mjs` - this is the guard working, not a bug. |

## One-time setup (already done for `dailydigest.dot`)

Kept for reference, or for standing this up on a fresh account. Requires Node
22+ (both CLIs fail on 20).

```bash
# 1. Fund a Paseo Asset Hub account: https://faucet.polkadot.io
# 2. Map it to an EVM address (once per account)
npx --prefix devnet dotns account map --env devnet

# 3. Grant Bulletin storage allowance (time-limited; `bulletin refresh` to extend)
npx --prefix devnet dotns bulletin authorize <YOUR_SS58_ADDRESS> \
    --transactions 1000 --bytes 104857600 --env devnet

# 4. Register the name (commit-reveal, takes several minutes)
npx --prefix devnet dotns register domain -n dailydigest --env devnet
```

`dailydigest` has an 11-character stem, so it is in the open tier - no proof of
personhood needed. Names of 6-8 characters are personhood-gated and 5 or fewer
are reserved.

Storage is authorization-based, not fee-per-upload: the allowance is a quota of
transactions and bytes, so a daily republish costs nothing beyond it. Refresh it
if daily publishes start failing.

## Known gaps

- **Listing in Browse** (`pad --publish`) requires proof of personhood. The app
  is reachable by name and by gateway URL without it; it just isn't in the
  directory.
- **Nothing is automated.** There is no scheduled job - each day's publish is the
  manual command above. See *Keeping it in sync*.

## The polkadot-api override

`package.json` pins `polkadot-api` to `2.2.2` inside `@novasamatech/host-papp`.

`host-papp` declares `polkadot-api: ">=2"` but imports `polkadot-api/signer`, an
export that was **dropped in 3.0.0**. Without the override npm resolves 3.x and
`pad` dies at startup with `ERR_PACKAGE_PATH_NOT_EXPORTED`. `2.2.2` is the newest
release that still provides it.

`devnet/package-lock.json` is committed (via a negation in `.gitignore`) so this
resolution is reproducible. Drop the override once `host-papp` tightens its range.

## Keeping it in sync

The bundle is a snapshot, so the devnet edition is only as fresh as the last
publish. If you skip a day the site does not break - it just keeps showing the
older seven-day window until the next `--execute`.

Nothing updates automatically. The
[Update Digest Manifest](../.github/workflows/update-manifest.yml) workflow
regenerates the production manifests and is unaware of this directory; the
devnet build regenerates its own manifests from `dist/` independently.

To automate it, add a step to that workflow (or a separate scheduled one) after
the digests are committed:

```yaml
- name: Publish devnet edition
  run: |
    npm install --prefix devnet
    node devnet/scripts/deploy.mjs --execute
  env:
    DEVNET_MNEMONIC: ${{ secrets.DEVNET_MNEMONIC }}
```

That needs `actions/setup-node` at 22+ and a `DEVNET_MNEMONIC` repository secret
holding a **devnet-only** seed. `verify.mjs` gates the publish, so a bad build
fails the job rather than shipping.

Re-run `scripts/vendor.mjs` only when Chart.js or the font stack in
`index.html` changes; the vendored output is committed so normal builds are
offline and reproducible.
