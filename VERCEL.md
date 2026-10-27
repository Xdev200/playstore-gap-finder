# Deploying Play Store Gap Finder on Vercel

## Deploy

From the project root (with Vercel CLI logged in):

```bash
vercel --prod
```

Or link once with `vercel`, then `vercel --prod`.

Node **20.x** is set in `package.json` `engines`. Entry is `server.mjs` (Express, ESM). Locally the app still listens on `PORT`; on Vercel it exports the app and does not call `listen`.

## Bundled weekly reports

HTML/JSON under `data/reports/` are included in the deploy (`includeFiles` in `vercel.json` + `.vercelignore` does **not** exclude them). After deploy they appear at `/reports` and in `/sitemap.xml`.

Note: those files are gitignored for git, but `vercel` CLI uploads from disk unless ignored by `.vercelignore`. Publish locally (or keep files on disk) before `vercel --prod` so they ship.

## New publishes on Vercel (ephemeral)

`POST /api/reports` on Vercel writes under `/tmp/playstore-gap-reports`. List/get merge **bundled** `data/reports` with **/tmp** overlays. `/tmp` is wiped on cold starts / new instances — fine for v1 demos, not for permanent SEO pages.

**Permanent new reports:** publish locally into `data/reports/`, then redeploy (`vercel --prod`). Later option: store reports in Vercel Blob (or similar) instead of the filesystem.

## Long scans

`maxDuration` is **300** seconds for `server.mjs` so SSE `/api/stream-search` can finish. Deep crawl still increases runtime and Google Play throttling risk — keep it off for production scans when possible.

## Health check

`GET /api/health` → `engine: google-play-scraper`, `apiKeyRequired: false`.
