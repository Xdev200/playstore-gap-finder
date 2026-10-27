# Play Store Gap Finder

Find underserved Google Play niches with **high demand** (lots of ratings) and **low satisfaction** (ratings ≤ your threshold). Uses the open-source **`google-play-scraper`** package to query Play Store pages directly — **no API key and no SerpApi**.

---

## Prerequisites

- Node.js **18+**
- Network access to `play.google.com`

---

## Setup

```bash
cd playstore-gap-finder
npm install
# Optional:
cp .env.example .env   # PORT=3000 only
```

No API key is required.

---

## Run

```bash
npm start
```

Open **http://localhost:3000**

CLI niche scanner (same scraper backend):

```bash
npm run scraper
```

---

## Environment variables

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `PORT` | No | `3000` | HTTP server port |

---

## User journey (UI)

1. Landing shows only **Category** and **Country / market**, plus **Find gaps**.
2. Defaults apply automatically: rating ≤ 3.5★, ≥ 100 reviews, paid + IAP, etc.
3. After a scan finishes, **Refine filters** unlocks so you can tweak monetization, rating, reviews, deep crawl, and re-run.
4. With matches on screen, **Publish weekly report** writes an SEO page under `/reports/...` (also listed in `/sitemap.xml`).

---

## Features

- **Live SSE scanning** — progress bar, candidate counts, instant match rows
- **Stop anytime** — abort an in-flight scan
- **KPI tiles** — opportunity count, avg rating, frustrated audience, avg price
- **Sort & filter** — table toolbar for demand, rating, price, name
- **CSV / Excel export**
- **App detail modal**
- **Weekly SEO reports** — publish crawlable `/reports/:slug` pages + sitemap

---

## Project structure

```
playstore-gap-finder/
├── server.mjs              # Express API + SSE + weekly report routes
├── scraper.mjs             # CLI niche scanner
├── lib/reports.mjs         # Slugify, HTML/JSON-LD, disk IO for reports
├── data/reports/           # Published JSON + HTML (gitignored)
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── WEEKLY_REPORTS.md
├── .env.example            # PORT=3000
└── package.json
```

---

## API overview (local)

| Endpoint | Method | Notes |
| :--- | :---: | :--- |
| `/` | GET | Static UI |
| `/api/health` | GET | Health; `engine: google-play-scraper`, no key required |
| `/api/stream-search` | GET (SSE) | Live gap scan stream |
| `/api/search` | POST | JSON programmatic search |
| `/api/export-xlsx` | POST | Excel export of current results |
| `/api/reports` | GET / POST | List or publish weekly gap reports |
| `/api/reports/:slug` | DELETE | Remove a published report |
| `/reports` | GET | SEO index of weekly reports |
| `/reports/:slug` | GET | Individual SEO report page |
| `/sitemap.xml` | GET | Sitemap including report URLs |
| `/robots.txt` | GET | Allows `/reports` |

See **WEEKLY_REPORTS.md** for publish flow and SEO details.

---

## Rate limits / politeness

This scrapes Google Play HTML/JSON endpoints via `google-play-scraper`. There is **no paid API quota**, but Google may rate-limit or block aggressive traffic. The server uses short polite delays (~180–300 ms) between requests. If you see empty results or errors, wait and retry, reduce countries/categories, or turn off deep crawl.

---

## License

ISC
