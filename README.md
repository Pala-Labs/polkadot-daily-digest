# Polkadot Daily Digest

![Polkadot Daily Digest](polkadot-post.png)

A daily, source-linked briefing on the Polkadot ecosystem - technical updates, governance, and community discussion, condensed into a single readable edition every morning.

🌐 **Live site: [news.openshore.io](https://news.openshore.io)**

The digest is a **pure static site** served from GitHub Pages. Every edition is a plain HTML file committed to this repository the moment it's generated, so the full archive is open, verifiable, scriptable, and self-hostable. Every claim links back to its primary source.

> Maintained by [Pala Labs](https://palalabs.org) · Governance data via [OpenShore](https://openshore.io) · Powered by [Polkadot](https://polkadot.com/)

---

## About this digest

Hi Polkadot community! 👋

We're [Pala Labs](https://palalabs.org/), and we're thrilled to announce the revival of the **Polkadot Daily Digest**. Governance proposals, SDK releases, community debates - there's so much happening every single day, and most of it gets scattered across forums, feeds, and social media before anyone has had their first coffee. We wanted to change that.

This digest picks up the tradition started by the Web3 Foundation's original Daily Digest: one clear, source-linked briefing every morning (CET), free for anyone to read. We rebuilt the curation process from the ground up as a fully automated pipeline - studied how the original worked, defined editorial standards at the system level, and tested it quietly for a month before going live.

But what makes us feel good about it is that every single edition, though built automatically, is read, checked, and corrected by a real human on our team before it ever goes live. We believe this best-of-both-worlds approach is the only way to do this right - automation gives us the coverage to track everything the ecosystem produces at scale, while the human review ensures that what reaches you is actually worth your time.

We publish two editions daily: the **Community Edition**, which focuses on community voices and X (Twitter) activity across the ecosystem, posted on the Polkadot Forum; and the **Legacy Digest**, a more authoritative brief covering governance, SDK releases, and ecosystem updates, shared on the Element channel. Both are available in full at [news.openshore.io](https://news.openshore.io/).

Our [Methodology](https://news.openshore.io/#methodology) is public, every claim links back to its source, and the full archive lives openly at [news.openshore.io](https://news.openshore.io/). Straight from the ecosystem, nothing inflated, nothing left out. We're also open to feedback - please create a GitHub Issue [here](https://github.com/Pala-Labs/polkadot-daily-digest/issues).

Thank you for reading this far. We hope you love the new digest as much as we loved building it.

---

## What's inside

The site is organized into editions, each a parallel stream of dated digests:

| Edition | Description |
|---|---|
| **Front Page** | The latest daily digest plus the recent archive. |
| **Legacy Digest** | The original daily digest format. |
| **Community Edition** | A curated digest drawn from Polkadot Forum and community sources. |
| **Twitter Activity** | Interactive charts of X (Twitter) post activity across curated ecosystem accounts. |

Each daily edition covers:

- **Technical** - protocol, tooling, and SDK news
- **Ecosystem** - parachains, projects, and integrations
- **OpenGov Updates** - new referenda and proposals approaching a decision deadline
- **Other** - events, announcements, and miscellaneous signal
- **Processing Logs** - a per-edition count of data points curated from each source

## How a digest is made

The same automated pipeline runs end-to-end every day - no manual selection, no per-day adjustments. *The process is the editor.*

```
Ingest  →  Deduplicate  →  Normalise  →  Synthesise  →  Publish
```

1. **Ingest** - a scheduled trigger fans out to every source in parallel (feeds, APIs, on-chain queries) in a single fetch wave.
2. **Deduplicate** - overlapping items across feeds (a forum thread surfaced on X, a release linked from Medium) collapse to one canonical entry.
3. **Normalise** - heterogeneous source formats are mapped to a uniform internal structure (title, body, link, timestamp, category).
4. **Synthesise** - AI-assisted summarisation drafts each section. The taxonomy, structure, and editorial standards are defined by humans and applied uniformly; the model only condenses normalised material into the briefing format. It does **not** decide what counts as news.
5. **Publish** - the finished edition is rendered to static HTML, committed to the public archive, and distributed by email and chat. A GitHub Action rebuilds the manifest this site reads from.

### Sources

| Stream | Source | What it covers |
|---|---|---|
| Community | **Polkadot Forum** | Daily / Top / Latest feeds - the primary venue for technical and governance discussion. |
| Long-form | **Medium** | Editorial posts from Web3 Foundation and Pala Labs - research, announcements, analysis. |
| Social | **X (Twitter)** | A curated list of official ecosystem accounts. Promotional / low-signal posts are filtered at ingest. |
| Development | **Polkadot SDK Releases** | New version tags from `paritytech/polkadot-sdk`. |
| Governance | **OpenGov Referenda** | On-chain governance data - new and decision-approaching referenda, sourced directly from the chain. |

## Repository layout

```
.
├── index.html               # The entire single-page app (UI, navigation, charts)
├── digests/                 # Daily digest editions, one HTML file per date
│   └── manifest.json        # Auto-generated index of editions
├── community_digests/       # Community Edition digests + manifest
├── architecture.png         # Production pipeline diagram (shown on the Methodology page)
├── CNAME                    # Custom domain for GitHub Pages (news.openshore.io)
├── .nojekyll                # Tells GitHub Pages to serve files as-is
└── .github/workflows/
    └── update-manifest.yml  # Rebuilds digest manifests on push to main
```

There is **no build step and no backend.** The site is a single `index.html` that loads its dependencies ([Chart.js](https://www.chartjs.org/) and [`@supabase/supabase-js`](https://supabase.com/)) from a CDN. Twitter Activity charts are read directly from a public Supabase database in the browser using a read-only publishable key - data is pre-aggregated through Postgres views with row-level security.

## Running locally

Because it's a static site, any local web server works:

```bash
# clone
git clone https://github.com/Pala-Labs/polkadot-daily-digest.git
cd polkadot-daily-digest

# serve (pick one)
python3 -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000>. No dependencies to install, no environment variables required.

### Manifests

`digests/manifest.json` and `community_digests/manifest.json` are the indexes the front-end reads to list editions. They're regenerated automatically by the [Update Digest Manifest](.github/workflows/update-manifest.yml) GitHub Action whenever a digest HTML file is pushed to `main`, so you don't normally edit them by hand. To rebuild them locally, run the Python snippet embedded in that workflow.

## Contributing

This is an open community project - contributions are welcome.

- **Spot something wrong in an edition?** The source is one click away from every claim. If a summary misrepresents its source, [open an issue](https://github.com/Pala-Labs/polkadot-daily-digest/issues) with the date and the link.
- **Improvements to the site** (UI, accessibility, new charts, performance): open a PR against `main`. Keep the no-build, single-file ethos - dependencies load from CDN, not a bundler.
- **New sources or pipeline ideas:** open an issue to discuss before building.

Please keep changes focused and describe what you changed and why. Since the site ships straight to production from `main`, test locally before opening a PR.

## License

Open-sourced for the Polkadot community. See the repository for license details, or open an issue if licensing terms are unclear.

---

*If something looks off, the source is one click away. If something looks like it shouldn't be there - [open an issue](https://github.com/Pala-Labs/polkadot-daily-digest/issues).*
