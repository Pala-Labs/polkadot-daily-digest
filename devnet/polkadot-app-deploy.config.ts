import type { ProductConfig } from '@polkadot-community-foundation/polkadot-app-deploy';

/**
 * Product manifest for the devnet deployment.
 *
 * `pad` reads this to write the `manifest` text record on the domain, which is
 * what renders the app's card in the Polkadot app and in Browse. Publishing
 * works without it; the card just falls back to a bare name.
 *
 * `pad` fails preflight if `icon.path` is missing, so this file is required once
 * it exists. app-icon.png is generated from app-icon.svg, which lifts the square
 * mark out of assets/openshore-horizontal.svg (the wordmark half is dropped) and
 * centres it on the site's linen background. To regenerate at 512x512:
 *
 *   qlmanage -t -s 512 -o /tmp/icon devnet/app-icon.svg
 *   cp /tmp/icon/app-icon.svg.png devnet/app-icon.png
 *
 * Keep `domain` in sync with `domain` in devnet/config.json.
 */
const config: ProductConfig = {
  domain: 'dailydigest.dot',
  displayName: 'Polkadot Daily Digest',
  description:
    'A daily, source-linked briefing on the Polkadot ecosystem - technical updates, ' +
    'governance, and community discussion, condensed into a single readable edition.',
  icon: {
    path: './app-icon.png',
    format: 'png',
  },
  executables: [
    {
      kind: 'app',
      path: './dist',
      appVersion: [1, 0, 0],
    },
  ],
};

export default config;
