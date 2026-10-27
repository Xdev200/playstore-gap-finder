# Weekly Reports

Publish scan results as **SEO-friendly static pages** for organic traffic and backlinks.

## URLs

| Path | Purpose |
| --- | --- |
| `/reports` | Index of all published weekly reports |
| `/reports/:slug` | Individual report (HTML + JSON-LD) |
| `/sitemap.xml` | Includes homepage + every report URL |
| `/robots.txt` | Allows `/reports` and points at the sitemap |

Slug shapes (ISO week):

- Single category: `2026-w44-productivity-in`
- All categories hub: `2026-w44-all-categories-in`

## Publish from the UI

1. Run a scan (Category + Country) until you have matches.
2. Open **Weekly Reports** (or the header **Reports** link).
3. Optionally edit title / week-of date.
4. Click **Publish weekly report**.
5. Toast shows the live URL; the list refreshes. Use **Browse all reports →** for the public index.

## Batch publish (all categories)

```bash
node scripts/publish-all-category-reports.mjs
```

Scans PRODUCTIVITY, TOOLS, EDUCATION, GAMES, BUSINESS, HEALTH for India via `google-play-scraper` (no SerpApi), publishes one report per category plus a combined hub, and regenerates HTML for existing JSON reports.

## API

```http
POST /api/reports
Content-Type: application/json

{
  "title": "optional override",
  "weekOf": "2026-10-27",
  "countries": ["in"],
  "categories": ["PRODUCTIVITY"],
  "maxRating": 3.5,
  "minReviews": 100,
  "monetization": ["paid", "iap"],
  "apps": [ /* scan result objects */ ]
}
```

UI posts reject empty `apps`. The batch script may publish honest 0-match pages via `saveReport(..., { allowEmpty: true })`.

```http
GET /api/reports
DELETE /api/reports/:slug
```

## Storage & deploy behavior

- JSON + HTML under `data/reports/` (gitignored except `.gitkeep`)
- Top **50** apps by `ratingsCount` stored per report; prose mentions total match count
- No SerpApi / no external SEO services — pure static generation via `lib/reports.mjs`

### Will new reports appear automatically after deployment?

| Environment | Behavior |
| --- | --- |
| **Local / already-running Node server** | **Yes, immediately.** Publishing writes files into `data/reports/`; `/reports` and `/reports/:slug` read that folder on each request. No deploy approval step. |
| **Hosted production** | Publishing **on that host** updates live pages the same way — but only if `data/reports` lives on the host (persistent volume, sync, or object storage mount). |
| **Git-only deploy** | **Does not ship reports** if `data/reports/*.json` and `*.html` are gitignored. You must sync `data/reports` to production separately, or publish from a job that writes onto the production filesystem. |

You do **not** need to manually approve each report for a running server. You **do** need a durable `data/` path on any hosted deploy.

## SEO targets (each report)

Act as research content, not thin doorway pages:

| Signal | Target |
| --- | --- |
| Body word count | **~900–1400 words** when matches exist (shorter OK for honest 0-match states) |
| H1 | One only — primary keyword: market + category + “Play Store gaps” / “Android market opportunities” |
| Structure | Intro → Key findings → Why gaps matter → Methodology → Category outlook → Opportunities table → How to use → FAQ |
| Meta description | ~150–160 chars with primary keyword + gap count |
| Meta keywords | 8–12 natural phrases (secondary signal) |
| Robots | `index,follow` |
| Canonical / OG / Twitter | Present |
| Internal links | `/`, `/reports` |

### Schema (JSON-LD `@graph`)

1. `Article` — `keywords`, `articleSection`, `inLanguage: en`
2. `ItemList` of `SoftwareApplication` (matched apps)
3. `BreadcrumbList` — Home → Weekly Reports → this report
4. `FAQPage` — matches on-page FAQ
5. `WebPage` — page entity

Index `/reports` uses richer intro (~120+ words) plus `CollectionPage` + `ItemList` + `BreadcrumbList`.

### Keywords approach

Blend head terms (`Play Store gaps`, `Android ASO`) with long-tails (`{category} apps {market}`, `low rated paid apps`). Keep phrases natural inside prose and FAQ — no stuffing.
