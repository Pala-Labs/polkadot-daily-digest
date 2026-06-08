# Context: Add a "Stats" section for X posts (Supabase-backed)

Paste this into the new chat (after the Supabase MCP server has loaded) to continue.

## Goal
Add a **Stats** section to the site that visualizes the X (Twitter) posts we ingest
daily and store in Supabase. Charts/graphs of post activity.

## Hosting situation (already decided)
- The site is a **pure static site on GitHub Pages**.
  - Repo: `Pala-Labs/polkadot-daily-digest`
  - Custom domain: `news.openshore.io` (CNAME)
  - Everything lives in a single `index.html` (~58KB) + `digests/` + `community_digests/` folders.
  - `.nojekyll` present; a workflow `.github/workflows/update-manifest.yml` regenerates a digest manifest.
- **Decision: NO separate backend / no extra deployment needed.** Supabase is queried
  **directly from the browser** using the public **anon key**. GitHub Pages just serves
  the HTML/JS; data fetching happens client-side.

## Security requirement (must do)
- Enable **Row Level Security (RLS)** on the posts table.
- Add a **read-only (SELECT) policy for the `anon` role** — ideally only on the views/columns
  we expose, NOT the full raw table.
- The anon key is public/visible in page source — that's expected and fine *as long as RLS is set*.

## Stats to build (in priority order)
1. **Total counts** — headline numbers: total posts, unique handles, date range covered.
2. **Posts per day/week** — time-series line/bar chart of post volume over time.
3. **Top handles** — bar chart / leaderboard of accounts with the most posts.
4. **Engagement** — IF we store likes/reposts/views: top posts by engagement.

## Aggregation approach (decided)
- Use **Postgres views** (NOT client-side JS aggregation).
- Create views in Supabase such as:
  - `posts_per_day` (date, count)
  - `top_handles` (handle, post_count [, total_engagement])
  - a totals view/RPC (total_posts, unique_handles, min_date, max_date)
- The static site queries these pre-aggregated views via `@supabase/supabase-js`.
- Grant `SELECT` on the views to `anon`.

## Rendering (decided)
- No build step — load libs from CDN to match the current single-file static setup:
  - `@supabase/supabase-js` (CDN/ESM)
  - **Chart.js** (CDN) for the graphs
- Add a "Stats" tab/section into `index.html`.

## What's needed next (action items for the new chat)
1. **Inspect the Supabase schema via MCP**: find the posts table name, columns
   (especially: post id, handle/author, created_at/timestamp, and any engagement columns
   like likes/reposts/views/replies).
2. Create the Postgres **views** listed above (matching real column names).
3. Set up **RLS + anon SELECT policies** on those views.
4. Get the **Supabase project URL + anon key** to wire into `index.html`.
5. Build the **Stats UI** in `index.html` (Chart.js + supabase-js, matching the existing
   warm light/dark theme — CSS vars like `--surface`, `--on-surface`, `--green`, `--blue`, etc.).

## Open info still needed from user
- Confirm the posts table name + column names (the MCP inspection should reveal these).
- Confirm whether engagement metrics (likes/reposts/views) are actually stored.
- Supabase project URL + anon key.
