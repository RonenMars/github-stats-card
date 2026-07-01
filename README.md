# github-stats-card (Cloudflare Worker)

Serves a live GitHub stats SVG for `RonenMars`, rendered at the Cloudflare edge.
Fetches all-time stats via the GitHub GraphQL API, renders the Catppuccin card,
caches for 1h so GitHub's image proxy doesn't exhaust the API rate limit.

## Files
- `worker.js` — fetch stats → render SVG → cache
- `wrangler.toml` — config (username is a plain var; token is a secret)
- `test.mjs` — self-check for the render helpers (`node test.mjs`)

## Deploy (4 steps — you run these)

All commands use `npx wrangler` (no global install needed; Node 24 present).

### 1. Create a GitHub token (read-only, public data)
- Go to https://github.com/settings/tokens?type=beta (fine-grained token)
- Name it e.g. `stats-card`, expiration as you like
- **Repository access:** Public repositories (read-only) is enough
- No extra account permissions needed for public contribution counts
- Copy the token (starts with `github_pat_`)

### 2. Log in to Cloudflare (opens a browser once)
```
cd stats-worker
npx wrangler login
```

### 3. Store the token as a secret (paste it when prompted)
```
npx wrangler secret put GITHUB_TOKEN
```

### 4. Deploy
```
npx wrangler deploy
```
Wrangler prints your Worker URL, e.g.
`https://github-stats-card.<your-subdomain>.workers.dev`

## Use in the README
Replace the current stats image with:
```html
<img src="https://github-stats-card.<your-subdomain>.workers.dev" alt="GitHub stats" />
```

## Local preview
```
npx wrangler dev
```
Then set the secret locally too: `npx wrangler secret put GITHUB_TOKEN` won't
apply to `dev`; instead create a `.dev.vars` file with `GITHUB_TOKEN=...`
(git-ignored) for local runs.

## Notes
- Cache is 1h (`s-maxage=3600`). Numbers update at most hourly — fine for a profile.
- The animation uses SMIL `<animateTransform>` so it plays through GitHub's image proxy.
- All-time commits = GitHub's attributed contribution total (per-year sum); same basis as github-readme-stats.
