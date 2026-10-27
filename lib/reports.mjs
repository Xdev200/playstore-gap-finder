import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

/** Bundled reports shipped with the deploy (read-only on Vercel). */
export const BUNDLED_REPORTS_DIR = path.join(ROOT, 'data', 'reports');

/** Writable dir: /tmp on Vercel (ephemeral), else same as bundled. */
export const WRITABLE_REPORTS_DIR = process.env.VERCEL
    ? '/tmp/playstore-gap-reports'
    : BUNDLED_REPORTS_DIR;

/** @deprecated Prefer BUNDLED_REPORTS_DIR / WRITABLE_REPORTS_DIR — kept for callers. */
export const REPORTS_DIR = WRITABLE_REPORTS_DIR;

const IS_VERCEL = Boolean(process.env.VERCEL);

const MAX_APPS_STORED = 50;

const CATEGORY_LABELS = {
    PRODUCTIVITY: 'Productivity',
    EDUCATION: 'Education',
    TOOLS: 'Tools & Utilities',
    GAMES: 'Games & Puzzles',
    BUSINESS: 'Business & Finance',
    HEALTH: 'Health & Fitness'
};

const CATEGORY_OUTLOOK = {
    PRODUCTIVITY: 'India’s productivity layer on Android is crowded with planners, PDF tools, and habit apps — yet many paid and IAP titles still ship with clunky UX, weak offline modes, and support gaps that drive 1–3★ reviews. Founders who ship a focused planner or annotator with crisp onboarding and reliable sync can win installs that already search for “pro” keywords.',
    EDUCATION: 'EdTech demand in India remains high across kids’ learning, quizzes, and language practice. Low-rated paid education apps often fail on localization, age-appropriate design, or progress tracking. A polished niche tutor or quiz product that respects parents’ trust and school curricula can convert the same traffic that currently leaves angry reviews.',
    TOOLS: 'Utility apps (scanners, calculators, file managers, Wi-Fi tools) convert well when they solve one job clearly. Many “pro” tools on Play still bundle ads, aggressive permissions, or buggy exports — classic gap signals. Clean, permission-light tools with transparent pricing tend to earn organic ASO lift in India.',
    GAMES: 'Casual puzzle and brain-training games monetize through IAP, but retention collapses when levels feel unfair, ads interrupt, or localization is poor. Gaps show up as high-volume titles with weak scores — opportunity for fair difficulty curves, offline play, and kid-safe designs aimed at Indian households.',
    BUSINESS: 'Invoice, expense, and receipt apps serve freelancers and SMBs who already pay for software. Frustration clusters around GST/tax fields, export quality, and sync failures. A India-first invoicing or expense workflow with solid PDF output and clear pricing can capture buyers stuck on poorly rated competitors.',
    HEALTH: 'Fitness, fasting, and calorie apps face trust and accuracy complaints. Users abandon trackers that miscount, nag with ads, or ignore local food databases. A focused health habit or workout planner with honest metrics and light monetization can stand out where rating volume proves demand.'
};

const COUNTRY_LABELS = {
    in: 'India',
    us: 'United States',
    gb: 'United Kingdom',
    ca: 'Canada',
    au: 'Australia',
    de: 'Germany',
    fr: 'France',
    br: 'Brazil',
    jp: 'Japan',
    sg: 'Singapore',
    ae: 'United Arab Emirates',
    tier1: 'Tier-1 (US, UK, CA, AU)'
};

export function ensureReportsDirSync() {
    // Always ensure writable dir; bundled dir is created at build/local time.
    try {
        fsSync.mkdirSync(WRITABLE_REPORTS_DIR, { recursive: true });
    } catch {
        // read-only FS edge case
    }
    if (!IS_VERCEL) {
        try {
            fsSync.mkdirSync(BUNDLED_REPORTS_DIR, { recursive: true });
        } catch {
            // ignore
        }
    }
}

export async function ensureReportsDir() {
    try {
        await fs.mkdir(WRITABLE_REPORTS_DIR, { recursive: true });
    } catch {
        // ignore
    }
    if (!IS_VERCEL) {
        try {
            await fs.mkdir(BUNDLED_REPORTS_DIR, { recursive: true });
        } catch {
            // ignore
        }
    }
}

async function listJsonFilesIn(dir) {
    try {
        const files = await fs.readdir(dir);
        return files.filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f));
    } catch {
        return [];
    }
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function slugifyPart(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'report';
}

/** ISO week number (1–53) for a Date */
export function getIsoWeekParts(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { year: d.getUTCFullYear(), week: weekNo };
}

export function buildSlug({ weekOf, categories = [], countries = [] }) {
    const d = weekOf ? new Date(weekOf) : new Date();
    const { year, week } = getIsoWeekParts(Number.isNaN(d.getTime()) ? new Date() : d);
    const cats = (categories || []).map((c) => String(c).toUpperCase()).filter(Boolean);
    let catPart;
    if (cats.length === 0) catPart = 'all';
    else if (cats.length > 1) catPart = 'all-categories';
    else catPart = slugifyPart(cats[0].toLowerCase());
    const countryPart = slugifyPart((countries[0] || 'global').toString().toLowerCase());
    return `${year}-w${String(week).padStart(2, '0')}-${catPart}-${countryPart}`;
}

function countryLabel(code) {
    const c = String(code || '').toLowerCase();
    return COUNTRY_LABELS[c] || c.toUpperCase() || 'Global';
}

function categoryLabel(key) {
    const k = String(key || '').toUpperCase();
    return CATEGORY_LABELS[k] || k || 'Custom';
}

function formatWeekOf(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toIsoDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
    return d.toISOString().slice(0, 10);
}

function normalizeApps(apps = []) {
    const list = Array.isArray(apps) ? apps.slice() : [];
    list.sort((a, b) => (b.ratingsCount || 0) - (a.ratingsCount || 0));
    const totalCount = list.length;
    const stored = list.slice(0, MAX_APPS_STORED).map((app, idx) => ({
        priorityRank: idx + 1,
        title: app.title || 'Untitled app',
        appId: app.appId || '',
        developer: app.developer || '',
        genre: app.genre || '',
        score: typeof app.score === 'number' ? app.score : parseFloat(app.score) || 0,
        ratingsCount: Number(app.ratingsCount) || 0,
        priceText: app.priceText || (app.free ? 'Free' : ''),
        free: Boolean(app.free),
        offersIAP: Boolean(app.offersIAP),
        url: app.url || (app.appId ? `https://play.google.com/store/apps/details?id=${app.appId}` : ''),
        summary: (app.summary || '').toString().slice(0, 280),
        icon: app.icon || ''
    }));
    return { stored, totalCount };
}

function categoriesPhrase(categories) {
    const cats = categories || [];
    if (cats.length === 0) return 'selected categories';
    if (cats.length > 1) return cats.map(categoryLabel).join(', ');
    return categoryLabel(cats[0]);
}

function marketsPhrase(countries) {
    const list = countries || [];
    if (list.length === 0) return 'selected markets';
    return list.map(countryLabel).join(', ');
}

function monetizationPhrase(monetization) {
    return (monetization || []).map((m) => {
        if (m === 'iap') return 'in-app purchases';
        if (m === 'paid') return 'paid apps';
        if (m === 'free') return 'free apps';
        if (m === 'ads') return 'ad-supported apps';
        return m;
    }).join(' + ') || 'paid apps and in-app purchases';
}

function avgRating(apps) {
    if (!apps || apps.length === 0) return null;
    const sum = apps.reduce((acc, a) => acc + (Number(a.score) || 0), 0);
    return sum / apps.length;
}

function topGenres(apps, limit = 4) {
    const counts = new Map();
    for (const a of apps || []) {
        const g = (a.genre || '').trim();
        if (!g) continue;
        counts.set(g, (counts.get(g) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([g]) => g);
}

function defaultTitle({ categories, countries, weekOf }) {
    const cats = categories || [];
    const cat = cats.length > 1 ? 'All Categories' : categoryLabel(cats[0]);
    const market = countryLabel((countries || [])[0]);
    return `Play Store Gaps: ${cat} Android Market Opportunities in ${market} — Week of ${formatWeekOf(weekOf)}`;
}

function buildKeywords(meta) {
    const market = marketsPhrase(meta.countries);
    const cats = meta.categories || [];
    const catLabels = cats.length ? cats.map(categoryLabel) : ['Android apps'];
    const primaryCat = catLabels[0];
    const phrases = [
        'Play Store gaps',
        'Android market opportunities',
        'Google Play ASO',
        'low rated paid apps',
        `${primaryCat} apps ${market}`,
        `Play Store gaps ${market}`,
        'high demand low satisfaction apps',
        'Android ASO research',
        'market opportunity Android',
        `${market} Play Store analysis`,
        'underserved Android niches',
        'weekly Play Store report'
    ];
    if (cats.length > 1) {
        phrases.splice(4, 0, `all categories Play Store gaps ${market}`);
    }
    return phrases.slice(0, 12);
}

function buildMetaDescription(meta) {
    const market = marketsPhrase(meta.countries);
    const cats = categoriesPhrase(meta.categories);
    const n = meta.totalCount || 0;
    // Target ~150–160 characters with primary keyword + gap count
    const candidates = [
        `${n} Play Store gaps in ${market} (${cats}): ≥${meta.minReviews} reviews yet ≤${Number(meta.maxRating).toFixed(1)}★. Weekly Android ASO market opportunity research for founders.`,
        `${n} Play Store gaps & Android market opportunities in ${market} — ${cats} apps with ≥${meta.minReviews} reviews and ≤${Number(meta.maxRating).toFixed(1)}★. Weekly ASO research.`,
        `${n} Google Play Store gaps in ${market} (${cats}): high demand, low satisfaction (≤${Number(meta.maxRating).toFixed(1)}★, ≥${meta.minReviews} reviews). Weekly Android opportunities.`
    ];
    let desc = candidates.find((c) => c.length >= 145 && c.length <= 160) || candidates[0];
    if (desc.length > 160) desc = desc.slice(0, 157).replace(/\s+\S*$/, '') + '...';
    if (desc.length < 145) {
        desc = `${desc} Cite this weekly report.`.slice(0, 160);
    }
    return desc;
}

function buildFaq(meta) {
    const market = marketsPhrase(meta.countries);
    const cats = categoriesPhrase(meta.categories);
    const n = meta.totalCount || 0;
    return [
        {
            q: `What are Play Store gaps in ${market}?`,
            a: `Play Store gaps are Android apps that already prove demand — typically ${Number(meta.minReviews).toLocaleString()}+ ratings — yet leave users unhappy with average scores of ${Number(meta.maxRating).toFixed(1)}★ or lower. In ${market}, those pockets signal product and ASO opportunities in ${cats} where a better experience can win organic installs.`
        },
        {
            q: `How do you find low-rated paid and IAP apps for ASO research?`,
            a: `We scan public Google Play listings with category keywords and chart lists, then evaluate monetization (paid upfront and in-app purchases), rating ceilings, and minimum review volume. Only apps that pass all filters appear in this weekly report — no private APIs or paid SerpApi keys are required.`
        },
        {
            q: `Why publish weekly Android market opportunity reports?`,
            a: `Weekly snapshots create crawlable, citeable research pages that founders, indie hackers, and ASO teams can link to when sizing niches. Consistent methodology, schema markup, and outbound Play Store links make each report a durable primary source for organic traffic and backlinks.`
        },
        {
            q: `How many ${cats} opportunities appear this week in ${market}?`,
            a: n === 0
                ? `This week’s scan found no apps in ${cats} for ${market} that matched rating ≤${Number(meta.maxRating).toFixed(1)}★, ≥${Number(meta.minReviews).toLocaleString()} ratings, and the selected monetization filters. Absence of matches is still useful signal — thresholds may be tight, or the niche may be healthier than expected.`
                : `This week we surfaced ${n} matching opportunit${n === 1 ? 'y' : 'ies'} in ${cats} for ${market}. The table ranks them by ratings count so you can prioritize validated demand first.`
        },
        {
            q: `Can I reuse this report for Android ASO and product validation?`,
            a: `Yes. Treat the list as a research shortlist: open each Play listing, read recent 1–2★ themes, validate willingness to pay, then prototype a sharper alternative. Link back to this page when you publish your own teardown so peers can verify the original filters and date.`
        }
    ];
}

function buildSections(meta) {
    const {
        totalCount,
        storedCount,
        categories,
        countries,
        maxRating,
        minReviews,
        monetization,
        weekOf,
        apps
    } = meta;
    const catList = categoriesPhrase(categories);
    const marketList = marketsPhrase(countries);
    const mon = monetizationPhrase(monetization);
    const avg = avgRating(apps);
    const genres = topGenres(apps);
    const weekLabel = formatWeekOf(weekOf);
    const isMulti = (categories || []).length > 1;
    const primaryKey = ((categories || [])[0] || '').toUpperCase();

    const intro = `This weekly Play Store gaps report maps Android market opportunities in ${marketList} for ${catList}. We highlight apps that already prove demand — at least ${Number(minReviews).toLocaleString()} Google Play ratings — yet leave users unsatisfied with average scores of ${Number(maxRating).toFixed(1)}★ or lower. The week of ${weekLabel} snapshot focuses on ${mon}, where buyers have shown willingness to pay. Founders, indie hackers, and ASO researchers can use this page as a citeable primary source when sizing underserved niches on Google Play in ${marketList}.`;

    let findings;
    if (totalCount === 0) {
        findings = `Key findings this week: the scan returned zero matches in ${catList} for ${marketList} under rating ≤${Number(maxRating).toFixed(1)}★, ≥${Number(minReviews).toLocaleString()} ratings, and ${mon}. That does not mean the category is empty — it means few public listings simultaneously fail satisfaction while clearing the demand and monetization bars. Use this as a calibration point: loosen rating or review thresholds in the Gap Finder, or revisit next week as charts rotate. Transparent empty states still help SEO readers understand methodology and avoid chasing false positives.`;
    } else {
        const genreBit = genres.length
            ? ` Dominant genres among matches include ${genres.join(', ')}.`
            : '';
        const avgBit = avg != null ? ` The average rating across listed opportunities is ${avg.toFixed(2)}★ — firmly in the dissatisfaction band.` : '';
        findings = `Key findings this week: we identified ${totalCount} Play Store gap${totalCount === 1 ? '' : 's'} in ${marketList} across ${catList}.${avgBit}${genreBit} ${storedCount < totalCount ? `The table below lists the top ${storedCount} by ratings count (of ${totalCount} total matches).` : `Every matched opportunity appears below, ranked by ratings count.`} High review volume paired with weak stars usually means a sticky job-to-be-done with a broken experience — not a missing category — which is exactly where Android market opportunities concentrate for product builders.`;
    }

    const whyMatter = `Why these gaps matter: paid and IAP apps that accumulate hundreds or thousands of ratings have already paid for distribution — keywords, featuring, or word of mouth. When their scores stay at or below ${Number(maxRating).toFixed(1)}★, users are loudly documenting friction you can fix: onboarding, performance, localization, pricing clarity, or missing features. For ASO, competing against a high-volume low-rated title can be easier than inventing demand from scratch, because searchers already query the problem space. For founders, each listing is a free qualitative dataset of complaints. Publishing these weekly Play Store gaps pages also creates linkable research assets that peers cite when comparing Android markets in ${marketList}, supporting organic traffic and backlinks over time.`;

    const methodology = `How we scored opportunities: scans use the open-source google-play-scraper library against public Play Store pages — no SerpApi key and no private Google API. For each category we pull relevant chart lists (when available) and run curated keyword searches, then fetch full app details. An app qualifies only when (1) monetization matches ${mon}, (2) average rating is greater than 0 and ≤ ${Number(maxRating).toFixed(1)}★, and (3) ratings count is ≥ ${Number(minReviews).toLocaleString()}. Deep-crawl of “similar apps” was off for this publish batch to keep runtime polite and reduce throttling. Scores, genres, prices, and review counts come from public listings only; we do not invent metrics. Re-run the same filters in the Gap Finder anytime to validate or refresh this snapshot.`;

    let outlook;
    if (isMulti) {
        const bits = (categories || []).map((c) => {
            const k = String(c).toUpperCase();
            const label = categoryLabel(k);
            const tip = CATEGORY_OUTLOOK[k] || `${label} remains an active Android category where UX debt and monetization friction create openings.`;
            return `${label}: ${tip}`;
        }).join(' ');
        outlook = `Category outlook for ${marketList} across all scanned verticals. ${bits} Cross-category reading helps teams pick where their skills (design, edtech, fintech, fitness) meet the loudest dissatisfaction signals this week.`;
    } else {
        const tip = CATEGORY_OUTLOOK[primaryKey] || `${catList} remains an active Android category on Google Play in ${marketList}, where UX debt and unclear monetization often drive low stars despite solid install demand.`;
        outlook = `Category outlook for ${catList} in ${marketList}. ${tip} Watch for localization into Indian languages, UPI-friendly payments where relevant, and lightweight installs that respect data costs — themes that repeatedly appear in low-star feedback across the region.`;
    }

    const howToUse = `How to use this report: (1) Skim the opportunity table and open the highest-ratings titles first — demand is validated. (2) Read the newest 1★ and 2★ reviews for recurring themes you can productize. (3) Check pricing and IAP clarity; confused monetization is a frequent gap driver. (4) Prototype a narrower alternative, then validate willingness to pay with landing pages or waitlists. (5) Cite this weekly Play Store gaps page when you publish teardowns or investor memos so others can verify filters, date, and market. Run a fresh scan from the Gap Finder home page whenever you need live numbers beyond this static snapshot.`;

    const faq = buildFaq(meta);

    return { intro, findings, whyMatter, methodology, outlook, howToUse, faq };
}

function sharedReportCss() {
    return `
:root {
  --bg-pink:#f8c8d8; --bg-lavender:#d8c8f0; --bg-sky:#b8d4f0;
  --glass:rgba(255,255,255,.52); --border:rgba(255,255,255,.6);
  --text:#2a2540; --muted:#5a5470; --soft:#8a849c;
  --accent:#8b5cf6; --accent-deep:#7c3aed;
  --emerald:#059669; --amber:#b45309;
  --radius:22px; --font:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif;
  --shadow:0 8px 32px rgba(120,100,160,.12);
}
*{box-sizing:border-box} body{margin:0;font-family:var(--font);color:var(--text);
  background:linear-gradient(135deg,var(--bg-pink) 0%,var(--bg-lavender) 45%,var(--bg-sky) 100%);
  background-attachment:fixed;min-height:100vh;line-height:1.65}
a{color:var(--accent-deep);text-decoration:none} a:hover{text-decoration:underline}
.wrap{max-width:960px;margin:0 auto;padding:28px 20px 64px}
.nav{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:22px;font-size:.9rem;font-weight:600}
.nav a{color:var(--muted)} .nav a:hover{color:var(--accent-deep)}
.card{background:var(--glass);border:1px solid var(--border);border-radius:var(--radius);
  padding:28px 30px;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:var(--shadow)}
h1{font-size:clamp(1.45rem,3vw,2rem);letter-spacing:-.03em;line-height:1.25;margin:0 0 10px}
.meta{color:var(--muted);font-size:.92rem;margin:0 0 18px}
.meta time{font-weight:600;color:var(--text)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px}
.chip{display:inline-flex;align-items:center;padding:5px 12px;border-radius:999px;
  background:rgba(255,255,255,.55);border:1px solid var(--border);font-size:.78rem;font-weight:600;color:var(--muted)}
.prose p{margin:0 0 14px;color:var(--muted)} .prose p:last-child{margin-bottom:0}
.prose section{margin-top:8px}
h2{font-size:1.15rem;margin:28px 0 12px;letter-spacing:-.02em}
.faq-item{margin:0 0 16px;padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.4);border:1px solid rgba(120,100,160,.1)}
.faq-item h3{margin:0 0 8px;font-size:1rem;letter-spacing:-.01em}
.faq-item p{margin:0;color:var(--muted);font-size:.92rem}
.table-wrap{overflow-x:auto;margin-top:8px;border-radius:14px;border:1px solid rgba(120,100,160,.12);background:rgba(255,255,255,.4)}
table{width:100%;border-collapse:collapse;font-size:.9rem}
th,td{padding:12px 14px;text-align:left;border-bottom:1px solid rgba(120,100,160,.1)}
th{font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--soft);background:rgba(255,255,255,.35)}
tr:last-child td{border-bottom:0}
.score{font-weight:700;color:var(--amber)} .reviews{font-variant-numeric:tabular-nums;font-weight:600;color:var(--emerald)}
.app-title{font-weight:700;color:var(--text)} .app-dev{display:block;font-size:.78rem;color:var(--soft);font-weight:500}
.footer{margin-top:28px;padding-top:18px;border-top:1px solid rgba(120,100,160,.12);font-size:.82rem;color:var(--soft)}
.list{display:grid;gap:14px;margin-top:18px}
.list a.report-card{display:block;padding:18px 20px;border-radius:16px;background:rgba(255,255,255,.48);
  border:1px solid var(--border);color:inherit;transition:transform .2s,box-shadow .2s}
.list a.report-card:hover{transform:translateY(-2px);box-shadow:var(--shadow);text-decoration:none}
.list h2{margin:0 0 6px;font-size:1.05rem}
.list .sub{margin:0;color:var(--muted);font-size:.88rem}
.empty{padding:40px 20px;text-align:center;color:var(--muted)}
.related{margin-top:12px;font-size:.9rem;color:var(--muted)}
`.trim();
}

export function renderReportHtml(report, { siteOrigin = '' } = {}) {
    const canonical = `${siteOrigin}/reports/${report.slug}`;
    const weekIso = toIsoDate(report.weekOf);
    const publishedIso = report.publishedAt || new Date().toISOString();
    const sections = buildSections({
        totalCount: report.totalCount,
        storedCount: (report.apps || []).length,
        categories: report.categories,
        countries: report.countries,
        maxRating: report.maxRating,
        minReviews: report.minReviews,
        monetization: report.monetization,
        weekOf: report.weekOf,
        apps: report.apps || []
    });
    const keywords = buildKeywords(report);
    const metaDescRaw = report.metaDescription || buildMetaDescription(report);
    const metaDesc = escapeHtml(metaDescRaw);
    const title = escapeHtml(report.title);

    const rows = (report.apps || []).map((app) => {
        const link = app.url
            ? `<a href="${escapeHtml(app.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(app.title)}</a>`
            : escapeHtml(app.title);
        return `<tr>
  <td>${app.priorityRank}</td>
  <td><span class="app-title">${link}</span>${app.developer ? `<span class="app-dev">${escapeHtml(app.developer)}</span>` : ''}</td>
  <td class="score">${Number(app.score).toFixed(2)}★</td>
  <td class="reviews">${Number(app.ratingsCount).toLocaleString()}</td>
  <td>${escapeHtml(app.genre || '—')}</td>
  <td>${escapeHtml(app.priceText || '—')}</td>
</tr>`;
    }).join('\n');

    const jsonLdGraph = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Article',
                '@id': `${canonical}#article`,
                headline: report.title,
                description: metaDescRaw,
                datePublished: publishedIso,
                dateModified: publishedIso,
                mainEntityOfPage: canonical,
                inLanguage: 'en',
                articleSection: categoriesPhrase(report.categories),
                keywords: keywords,
                author: { '@type': 'Organization', name: 'Play Store Gap Finder' },
                publisher: { '@type': 'Organization', name: 'Play Store Gap Finder' },
                about: `Google Play Store market gaps in ${marketsPhrase(report.countries)}`
            },
            {
                '@type': 'ItemList',
                '@id': `${canonical}#opportunities`,
                name: report.title,
                numberOfItems: (report.apps || []).length,
                itemListElement: (report.apps || []).map((app, i) => ({
                    '@type': 'ListItem',
                    position: i + 1,
                    item: {
                        '@type': 'SoftwareApplication',
                        name: app.title,
                        applicationCategory: app.genre || 'MobileApplication',
                        operatingSystem: 'Android',
                        aggregateRating: {
                            '@type': 'AggregateRating',
                            ratingValue: Number(app.score).toFixed(2),
                            ratingCount: Number(app.ratingsCount) || 0,
                            bestRating: '5',
                            worstRating: '1'
                        },
                        url: app.url || undefined
                    }
                }))
            },
            {
                '@type': 'BreadcrumbList',
                '@id': `${canonical}#breadcrumb`,
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteOrigin}/` },
                    { '@type': 'ListItem', position: 2, name: 'Weekly Reports', item: `${siteOrigin}/reports` },
                    { '@type': 'ListItem', position: 3, name: report.title, item: canonical }
                ]
            },
            {
                '@type': 'FAQPage',
                '@id': `${canonical}#faq`,
                mainEntity: sections.faq.map((item) => ({
                    '@type': 'Question',
                    name: item.q,
                    acceptedAnswer: { '@type': 'Answer', text: item.a }
                }))
            },
            {
                '@type': 'WebPage',
                '@id': canonical,
                url: canonical,
                name: report.title,
                description: metaDescRaw,
                isPartOf: { '@type': 'WebSite', name: 'Play Store Gap Finder', url: `${siteOrigin}/` },
                primaryImageOfPage: undefined
            }
        ]
    };

    const chips = [
        ...((report.countries || []).map((c) => countryLabel(c))),
        ...((report.categories || []).map((c) => categoryLabel(c))),
        `≤ ${Number(report.maxRating).toFixed(1)}★`,
        `≥ ${Number(report.minReviews).toLocaleString()} reviews`,
        `${report.totalCount} opportunities`
    ].map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('');

    const faqHtml = sections.faq.map((item) => `
    <div class="faq-item">
      <h3>${escapeHtml(item.q)}</h3>
      <p>${escapeHtml(item.a)}</p>
    </div>`).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${metaDesc}">
<meta name="keywords" content="${escapeHtml(keywords.join(', '))}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${metaDesc}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${metaDesc}">
<meta name="theme-color" content="#d8c8f0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${sharedReportCss()}</style>
<script type="application/ld+json">${JSON.stringify(jsonLdGraph)}</script>
</head>
<body>
<div class="wrap">
  <nav class="nav" aria-label="Breadcrumb">
    <a href="/">← Gap Finder</a>
    <span aria-hidden="true">·</span>
    <a href="/reports">Weekly Reports</a>
  </nav>
  <article class="card">
    <header>
      <h1>${title}</h1>
      <p class="meta">Published <time datetime="${escapeHtml(publishedIso)}">${escapeHtml(formatWeekOf(publishedIso))}</time>
        · Week of <time datetime="${escapeHtml(weekIso)}">${escapeHtml(formatWeekOf(report.weekOf))}</time></p>
      <div class="chips">${chips}</div>
    </header>
    <div class="prose">
      <p>${escapeHtml(sections.intro)}</p>
      <section>
        <h2>Key findings this week</h2>
        <p>${escapeHtml(sections.findings)}</p>
      </section>
      <section>
        <h2>Why these gaps matter</h2>
        <p>${escapeHtml(sections.whyMatter)}</p>
      </section>
      <section>
        <h2>How we scored opportunities</h2>
        <p>${escapeHtml(sections.methodology)}</p>
      </section>
      <section>
        <h2>Category outlook for ${escapeHtml(marketsPhrase(report.countries))}</h2>
        <p>${escapeHtml(sections.outlook)}</p>
      </section>
    </div>
    <h2>Top opportunities</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>App</th>
            <th>Rating</th>
            <th>Ratings</th>
            <th>Genre</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
${rows || '<tr><td colspan="6">No apps matched the filters this week — see findings above.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="prose">
      <section>
        <h2>How to use this report</h2>
        <p>${escapeHtml(sections.howToUse)}</p>
      </section>
      <section>
        <h2>FAQ</h2>
        ${faqHtml}
      </section>
    </div>
    <p class="related">Related: <a href="/reports">All weekly Play Store gap reports</a> · <a href="/">Run a live Gap Finder scan</a></p>
    <footer class="footer">
      Published ${escapeHtml(formatWeekOf(publishedIso))} · Generated by Play Store Gap Finder ·
      <a href="/reports">All weekly reports</a> · <a href="/">Run your own scan</a>
    </footer>
  </article>
</div>
</body>
</html>`;
}

export function renderReportsIndexHtml(reports, { siteOrigin = '' } = {}) {
    const canonical = `${siteOrigin}/reports`;
    const title = 'Weekly Play Store Gap Reports | Android Market Opportunity Research';
    const desc = 'Browse weekly Google Play Store gap reports — high-demand, low-satisfaction Android niches by market and category. Linkable ASO research for founders.';
    const intro = `These weekly Play Store gap reports publish transparent snapshots of underserved Google Play niches — Android apps with proven demand (high rating volume) and weak satisfaction (low star scores) in named markets and categories. Founders, product managers, and ASO researchers use them as shareable primary sources when sizing market opportunities, comparing monetization models, and citing public Play data. Each report is a static, crawlable article with methodology prose, FAQ schema, breadcrumb markup, and outbound links to Play Store listings. New reports appear as soon as they are written to this server’s data folder — no separate approval step on a running instance. Run a fresh scan anytime from the Gap Finder home page, or browse the archive below for India and other markets.`;

    const cards = reports.length === 0
        ? `<div class="empty"><p>No weekly reports published yet. Run a scan in the <a href="/">Gap Finder</a> and click <strong>Publish weekly report</strong>.</p></div>`
        : `<div class="list">${reports.map((r) => {
            const markets = (r.countries || []).map(countryLabel).join(', ');
            const cats = (r.categories || []).map(categoryLabel).join(', ');
            return `<a class="report-card" href="/reports/${escapeHtml(r.slug)}">
  <h2>${escapeHtml(r.title)}</h2>
  <p class="sub"><time datetime="${escapeHtml(toIsoDate(r.weekOf))}">${escapeHtml(formatWeekOf(r.weekOf))}</time>
    · ${escapeHtml(markets)} · ${escapeHtml(cats)} · ${r.totalCount || r.appCount || 0} opportunities</p>
</a>`;
        }).join('\n')}</div>`;

    const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'CollectionPage',
                '@id': `${canonical}#collection`,
                name: title,
                description: desc,
                url: canonical,
                inLanguage: 'en',
                isPartOf: { '@type': 'WebSite', name: 'Play Store Gap Finder', url: `${siteOrigin}/` }
            },
            {
                '@type': 'ItemList',
                '@id': `${canonical}#list`,
                name: 'Weekly Play Store Gap Reports',
                numberOfItems: reports.length,
                itemListElement: reports.map((r, i) => ({
                    '@type': 'ListItem',
                    position: i + 1,
                    url: `${siteOrigin}/reports/${r.slug}`,
                    name: r.title
                }))
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteOrigin}/` },
                    { '@type': 'ListItem', position: 2, name: 'Weekly Reports', item: canonical }
                ]
            }
        ]
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta name="keywords" content="Play Store gaps, weekly Android reports, Google Play ASO, market opportunity, low rated apps, Android research">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#d8c8f0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${sharedReportCss()}</style>
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<div class="wrap">
  <nav class="nav"><a href="/">← Gap Finder home</a></nav>
  <div class="card">
    <h1>Weekly Play Store Gap Reports</h1>
    <div class="prose">
      <p>${escapeHtml(intro)}</p>
    </div>
    ${cards}
  </div>
</div>
</body>
</html>`;
}

function jsonPathFor(slug, base = WRITABLE_REPORTS_DIR) {
    return path.join(base, `${slug}.json`);
}
function htmlPathFor(slug, base = WRITABLE_REPORTS_DIR) {
    return path.join(base, `${slug}.html`);
}

export async function listReports() {
    await ensureReportsDir();
    // Merge bundled (deployed) + writable (/tmp on Vercel). Writable wins on slug clash.
    const paths = [
        ...(await listJsonFilesIn(BUNDLED_REPORTS_DIR)),
        ...(await listJsonFilesIn(WRITABLE_REPORTS_DIR))
    ];
    const bySlug = new Map();
    for (const filePath of paths) {
        try {
            const raw = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(raw);
            if (data.deleted || !data.slug) continue;
            bySlug.set(data.slug, {
                slug: data.slug,
                title: data.title,
                weekOf: data.weekOf,
                publishedAt: data.publishedAt,
                countries: data.countries || [],
                categories: data.categories || [],
                maxRating: data.maxRating,
                minReviews: data.minReviews,
                monetization: data.monetization || [],
                totalCount: data.totalCount ?? (data.apps || []).length,
                appCount: (data.apps || []).length,
                url: `/reports/${data.slug}`
            });
        } catch {
            // skip corrupt
        }
    }
    const reports = Array.from(bySlug.values());
    reports.sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
    return reports;
}

export async function getReport(slug) {
    await ensureReportsDir();
    const safe = slugifyPart(slug).replace(/^-+|-+$/g, '') || slug;
    // Prefer writable overlay (newer publishes on Vercel), then bundled.
    const candidates = [
        jsonPathFor(slug, WRITABLE_REPORTS_DIR),
        jsonPathFor(safe, WRITABLE_REPORTS_DIR),
        jsonPathFor(slug, BUNDLED_REPORTS_DIR),
        jsonPathFor(safe, BUNDLED_REPORTS_DIR)
    ];
    for (const candidate of candidates) {
        try {
            const raw = await fs.readFile(candidate, 'utf8');
            const data = JSON.parse(raw);
            if (data.deleted) return null;
            return data;
        } catch {
            // try next
        }
    }
    return null;
}

/**
 * Persist a weekly report (JSON + HTML). Allows empty apps for honest 0-state pages.
 * Alias: saveReport
 */
export async function createReport(payload = {}, { siteOrigin = '', allowEmpty = true, overwriteSlug = null } = {}) {
    await ensureReportsDir();
    const countries = Array.isArray(payload.countries)
        ? payload.countries.map((c) => String(c).toLowerCase()).filter(Boolean)
        : String(payload.countries || 'in').split(/[,;\s]+/).filter(Boolean);
    const categories = Array.isArray(payload.categories)
        ? payload.categories.map((c) => String(c).toUpperCase()).filter(Boolean)
        : String(payload.categories || 'PRODUCTIVITY').split(/[,;\s]+/).filter(Boolean);
    const weekOf = payload.weekOf || new Date().toISOString().slice(0, 10);
    const maxRating = payload.maxRating != null ? Number(payload.maxRating) : 3.5;
    const minReviews = payload.minReviews != null ? Number(payload.minReviews) : 100;
    const monetization = Array.isArray(payload.monetization)
        ? payload.monetization
        : String(payload.monetization || 'paid,iap').split(/[,;\s]+/).filter(Boolean);

    const { stored, totalCount } = normalizeApps(payload.apps || []);
    if (totalCount === 0 && !allowEmpty) {
        const err = new Error('Cannot publish an empty report — run a scan first.');
        err.status = 400;
        throw err;
    }

    let slug = overwriteSlug || buildSlug({ weekOf, categories, countries });
    if (!overwriteSlug) {
        let attempt = 0;
        while (true) {
            const candidateSlug = attempt === 0 ? slug : `${slug}-${attempt + 1}`;
            const existsWritable = await fs.access(jsonPathFor(candidateSlug, WRITABLE_REPORTS_DIR)).then(() => true).catch(() => false);
            const existsBundled = await fs.access(jsonPathFor(candidateSlug, BUNDLED_REPORTS_DIR)).then(() => true).catch(() => false);
            if (!existsWritable && !existsBundled) {
                slug = candidateSlug;
                break;
            }
            attempt += 1;
            if (attempt > 20) {
                slug = candidateSlug;
                break;
            }
        }
    }

    const title = (payload.title && String(payload.title).trim()) || defaultTitle({ categories, countries, weekOf });
    const publishedAt = new Date().toISOString();
    const report = {
        slug,
        title,
        weekOf: toIsoDate(weekOf),
        publishedAt,
        countries,
        categories,
        maxRating,
        minReviews,
        monetization,
        totalCount,
        apps: stored,
        metaDescription: buildMetaDescription({
            totalCount,
            countries,
            categories,
            maxRating,
            minReviews
        }),
        keywords: buildKeywords({ countries, categories })
    };

    const html = renderReportHtml(report, { siteOrigin });
    // On Vercel, writes go to /tmp (ephemeral). Bundled reports ship with redeploy.
    await fs.writeFile(jsonPathFor(slug, WRITABLE_REPORTS_DIR), JSON.stringify(report, null, 2), 'utf8');
    await fs.writeFile(htmlPathFor(slug, WRITABLE_REPORTS_DIR), html, 'utf8');

    return {
        slug,
        url: `/reports/${slug}`,
        title: report.title,
        publishedAt,
        totalCount
    };
}

/** Alias kept for callers / scripts that prefer saveReport naming */
export async function saveReport(payload = {}, opts = {}) {
    return createReport(payload, opts);
}

/** Re-render HTML for every JSON report after template upgrades */
export async function regenerateAllReportHtml({ siteOrigin = '' } = {}) {
    await ensureReportsDir();
    // Prefer regenerating writable copies; also refresh bundled when not on Vercel.
    const dirs = IS_VERCEL
        ? [WRITABLE_REPORTS_DIR]
        : [BUNDLED_REPORTS_DIR, WRITABLE_REPORTS_DIR];
    const updated = [];
    const seen = new Set();
    for (const dir of dirs) {
        let jsonFiles = [];
        try {
            jsonFiles = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'));
        } catch {
            continue;
        }
        for (const file of jsonFiles) {
            try {
                const raw = await fs.readFile(path.join(dir, file), 'utf8');
                const data = JSON.parse(raw);
                if (data.deleted || !data.slug || seen.has(data.slug)) continue;
                data.metaDescription = buildMetaDescription(data);
                data.keywords = buildKeywords(data);
                const html = renderReportHtml(data, { siteOrigin });
                await fs.writeFile(htmlPathFor(data.slug, dir), html, 'utf8');
                await fs.writeFile(jsonPathFor(data.slug, dir), JSON.stringify(data, null, 2), 'utf8');
                seen.add(data.slug);
                updated.push(data.slug);
            } catch (e) {
                console.warn('regenerate skip', file, e.message);
            }
        }
    }
    return updated;
}

export async function deleteReport(slug) {
    await ensureReportsDir();
    // Delete from writable first; on Vercel bundled files cannot be removed.
    const jpW = jsonPathFor(slug, WRITABLE_REPORTS_DIR);
    const hpW = htmlPathFor(slug, WRITABLE_REPORTS_DIR);
    let removed = false;
    try {
        await fs.unlink(jpW);
        removed = true;
    } catch {
        // not in writable
    }
    try {
        await fs.unlink(hpW);
    } catch {
        // html optional
    }
    if (!IS_VERCEL) {
        try {
            await fs.unlink(jsonPathFor(slug, BUNDLED_REPORTS_DIR));
            removed = true;
        } catch {
            // not bundled
        }
        try {
            await fs.unlink(htmlPathFor(slug, BUNDLED_REPORTS_DIR));
        } catch {
            // optional
        }
    }
    if (!removed) {
        const err = new Error(IS_VERCEL
            ? 'Report not found in writable store (bundled reports cannot be deleted on Vercel)'
            : 'Report not found');
        err.status = 404;
        throw err;
    }
    return { ok: true, slug };
}

export function renderSitemapXml(reports, { siteOrigin = '' } = {}) {
    const origin = siteOrigin || '';
    const urls = [
        { loc: `${origin}/`, priority: '1.0', changefreq: 'weekly' },
        { loc: `${origin}/reports`, priority: '0.9', changefreq: 'weekly' },
        ...reports.map((r) => ({
            loc: `${origin}/reports/${r.slug}`,
            lastmod: (r.publishedAt || '').slice(0, 10) || undefined,
            priority: '0.8',
            changefreq: 'weekly'
        }))
    ];
    const body = urls.map((u) => {
        const last = u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : '';
        return `  <url>\n    <loc>${u.loc}</loc>${last}\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`;
    }).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function renderRobotsTxt({ siteOrigin = '' } = {}) {
    const sitemap = siteOrigin ? `${siteOrigin}/sitemap.xml` : '/sitemap.xml';
    return `User-agent: *\nAllow: /\nAllow: /reports\nAllow: /reports/\n\nSitemap: ${sitemap}\n`;
}

export { CATEGORY_LABELS, COUNTRY_LABELS, MAX_APPS_STORED, CATEGORY_OUTLOOK, IS_VERCEL };
