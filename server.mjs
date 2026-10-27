import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { config as loadEnv } from 'dotenv';
import gplay from 'google-play-scraper';
import XLSX from 'xlsx';
import {
    ensureReportsDirSync,
    listReports,
    getReport,
    createReport,
    deleteReport,
    renderReportHtml,
    renderReportsIndexHtml,
    renderSitemapXml,
    renderRobotsTxt
} from './lib/reports.mjs';

loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

ensureReportsDirSync();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function siteOriginFromReq(req) {
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString().split(',')[0].trim();
    const host = (req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`).toString().split(',')[0].trim();
    return `${proto}://${host}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CATEGORY_KEYWORD_MAP = {
    PRODUCTIVITY: ['study planner', 'school planner', 'pomodoro timer', 'pdf annotator', 'digital planner', 'flashcards pro', 'habit tracker pro', 'daily agenda'],
    EDUCATION: ['math games kids', 'spelling game', 'phonics game', 'coding game kids', 'geography quiz pro', 'chess tutor', 'language learning pro'],
    TOOLS: ['scientific calculator pro', 'document scanner pro', 'wifi analyzer pro', 'audio recorder pro', 'file manager pro', 'clipboard manager pro', 'unit converter pro'],
    GAMES: ['brain training pro', 'logic puzzle educational', 'chess tutor', 'sudoku pro', 'puzzle games kids', 'math puzzle'],
    BUSINESS: ['invoice maker pro', 'receipt scanner', 'budget planner pro', 'expense tracker pro'],
    HEALTH: ['workout planner pro', 'calorie counter pro', 'fasting tracker pro', 'stretch routine', 'posture tracker']
};


app.get('/api/health', (_req, res) => {
    res.json({
        ok: true,
        service: 'playstore-gap-finder',
        engine: 'google-play-scraper',
        scraperConfigured: true,
        serpapiConfigured: false,
        apiKeyRequired: false
    });
});

// Stream search results via Server-Sent Events (SSE)
app.get('/api/stream-search', async (req, res) => {
    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let isAborted = false;
    req.on('close', () => {
        isAborted = true;
    });

    const sendEvent = (event, data) => {
        if (isAborted) return;
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const rawCountry = (req.query.country || req.query.countries || 'in').toString().trim().toLowerCase();
        const countries = rawCountry === 'tier1'
            ? ['us', 'gb', 'ca', 'au']
            : rawCountry.split(/[,;\s]+/).filter(Boolean);
        const primaryCountry = countries[0] || 'in';

        const maxRating = parseFloat(req.query.maxRating ?? 3.5);
        const minReviews = parseInt(req.query.minReviews ?? 100, 10);

        // Multi-monetization models: e.g. ['paid', 'iap']
        const rawMonetization = (req.query.monetization || req.query.price || 'paid,iap').toString().toLowerCase();
        const monetizationList = rawMonetization.split(/[,;\s]+/).filter(Boolean);

        // Multi-category support: e.g. ['PRODUCTIVITY', 'TOOLS']
        const rawCategories = (req.query.categories || req.query.category || 'PRODUCTIVITY').toString().trim().toUpperCase();
        const categoryKeys = rawCategories === 'ALL'
            ? Object.keys(CATEGORY_KEYWORD_MAP)
            : rawCategories.split(/[,;\s]+/).filter(Boolean);

        const rawTerms = (req.query.term || req.query.query || '').toString().trim();
        const limitPerTerm = Math.min(Math.max(parseInt(req.query.num || 50, 10), 10), 250);
        const deepCrawl = req.query.deepCrawl === 'true';

        // Determine search price parameter: only restrict if strictly pure paid or strictly free
        const searchPriceParam = (monetizationList.length === 1 && monetizationList[0] === 'paid')
            ? 'paid'
            : (monetizationList.length === 1 && monetizationList[0] === 'free')
                ? 'free'
                : undefined;

        // Terms to search: custom user query OR aggregated terms from all chosen categories
        let terms = [];
        if (rawTerms) {
            terms = rawTerms.split(/[,;\n]+/).map((t) => t.trim()).filter(Boolean);
        } else {
            for (const cat of categoryKeys) {
                if (CATEGORY_KEYWORD_MAP[cat]) {
                    terms.push(...CATEGORY_KEYWORD_MAP[cat]);
                }
            }
        }

        if (terms.length === 0 && categoryKeys.length === 0) {
            sendEvent('error', { message: 'Please select at least one Category or enter a search keyword.' });
            return res.end();
        }

        const countryLabel = rawCountry === 'tier1' ? 'Tier-1 Bundle (US, UK, CA, AU)' : countries.map(c => c.toUpperCase()).join(', ');
        const categoryLabel = categoryKeys.join(', ') || 'Custom';

        sendEvent('status', {
            step: 'init',
            message: `Scanning [${countryLabel}] for Categories: [${categoryLabel}] (${terms.length} search queries)...`,
            country: rawCountry,
            categories: categoryKeys,
            maxRating,
            minReviews,
            monetization: monetizationList,
            deepCrawl
        });

        const candidateApps = new Map(); // appId -> initial preview data

        for (let cIdx = 0; cIdx < countries.length; cIdx++) {
            if (isAborted) break;
            const country = countries[cIdx];

            // 1. Fetch Top chart apps for each selected category
            for (const catKey of categoryKeys) {
                if (isAborted) break;
                if (gplay.category[catKey]) {
                    sendEvent('status', {
                        step: 'category_list',
                        message: `[${country.toUpperCase()}] Fetching Top apps in Category [${catKey}]...`,
                        percent: 8 + Math.round((cIdx / countries.length) * 10)
                    });
                    try {
                        const collection = searchPriceParam === 'paid' ? gplay.collection.TOP_PAID : gplay.collection.TOP_FREE;
                        const catApps = await gplay.list({
                            category: gplay.category[catKey],
                            collection,
                            num: limitPerTerm,
                            country
                        });
                        for (const app of catApps) {
                            if (app.score && app.score > maxRating + 0.3) continue;
                            if (!candidateApps.has(app.appId)) {
                                candidateApps.set(app.appId, { ...app, _country: country });
                            }
                        }
                    } catch (catErr) {
                        console.warn(`Category list error for ${catKey} (${country}):`, catErr.message);
                    }
                }
            }

            // 2. Search category terms
            for (let i = 0; i < terms.length; i++) {
                if (isAborted) break;
                const term = terms[i];
                sendEvent('status', {
                    step: 'searching',
                    message: `[${country.toUpperCase()}] Searching for "${term}" (${i + 1}/${terms.length})...`,
                    currentTerm: term,
                    percent: 18 + Math.round(((i + 0.5) / terms.length) * 12)
                });

                try {
                    const searchOptions = {
                        term,
                        num: limitPerTerm,
                        country,
                        lang: 'en'
                    };

                    if (searchPriceParam) {
                        searchOptions.price = searchPriceParam;
                    }

                    const results = await gplay.search(searchOptions);

                    for (const app of results) {
                        if (app.score && app.score > maxRating + 0.3) {
                            continue;
                        }
                        if (!candidateApps.has(app.appId)) {
                            candidateApps.set(app.appId, { ...app, _country: country });
                        }
                    }

                    sendEvent('candidates_count', {
                        totalCandidates: candidateApps.size,
                        currentTerm: `${term} (${country.toUpperCase()})`,
                        foundInTerm: results.length
                    });

                    await sleep(200);
                } catch (err) {
                    console.error(`Error querying term "${term}" (${country}):`, err.message);
                }
            }
        }

        // Optional Deep Crawl: Query 'Similar Apps' for top discovered candidates
        if (deepCrawl && candidateApps.size > 0 && !isAborted) {
            sendEvent('status', {
                step: 'deep_crawling',
                message: `Deep Crawling: Inspecting Google Play "Similar Apps" carousels to uncover hidden niche competitors...`,
                percent: 30
            });
            const seedApps = Array.from(candidateApps.values()).slice(0, 6);
            for (const seed of seedApps) {
                if (isAborted) break;
                try {
                    const similar = await gplay.similar({ appId: seed.appId, country: seed._country || primaryCountry, lang: 'en' });
                    for (const app of similar) {
                        if (app.score && app.score > maxRating + 0.3) continue;
                        if (!candidateApps.has(app.appId)) {
                            candidateApps.set(app.appId, { ...app, _country: seed._country || primaryCountry });
                        }
                    }
                    await sleep(200);
                } catch (e) {}
            }
            sendEvent('candidates_count', {
                totalCandidates: candidateApps.size,
                currentTerm: 'Similar & Related Apps',
                foundInTerm: candidateApps.size
            });
        }

        const candidateList = Array.from(candidateApps.values());
        sendEvent('status', {
            step: 'fetching_details',
            message: `Evaluating ${candidateList.length} candidate apps against strict criteria (Rating ≤ ${maxRating}★, Reviews ≥ ${minReviews})...`,
            totalCandidates: candidateList.length,
            percent: 35
        });

        let matchedCount = 0;
        let checked = 0;
        let unratedCount = 0;
        let highRatingCount = 0;
        let lowReviewCount = 0;

        for (const candidate of candidateList) {
            if (isAborted) break;
            checked++;

            const currentProgress = 35 + Math.round((checked / (candidateList.length || 1)) * 65);

            try {
                const targetCountry = candidate._country || primaryCountry;
                const details = await gplay.app({
                    appId: candidate.appId,
                    country: targetCountry,
                    lang: 'en'
                });

                const isPaid = !details.free && details.price > 0;
                const hasIAP = Boolean(details.offersIAP);
                const hasAds = Boolean(details.adSupported);
                const isPureFree = Boolean(details.free) && !hasIAP && !hasAds;

                let matchesMonetization = false;
                if (monetizationList.includes('all')) matchesMonetization = true;
                if (monetizationList.includes('paid') && isPaid) matchesMonetization = true;
                if (monetizationList.includes('iap') && hasIAP) matchesMonetization = true;
                if (monetizationList.includes('ads') && hasAds) matchesMonetization = true;
                if (monetizationList.includes('free') && isPureFree) matchesMonetization = true;

                const rating = typeof details.score === 'number' ? details.score : 0;
                const reviewsCount = details.ratings || details.reviews || 0;

                // Condition: matches monetization model + rating in range (0, maxRating] + reviewsCount >= minReviews
                if (matchesMonetization && rating > 0 && rating <= maxRating && reviewsCount >= minReviews) {
                    matchedCount++;
                    const modelLabels = [];
                    if (isPaid) modelLabels.push('Paid Upfront');
                    if (hasIAP) modelLabels.push('In-App Purchases');
                    if (hasAds) modelLabels.push('Ads');
                    if (isPureFree) modelLabels.push('Free');

                    const matchItem = {
                        priorityRank: matchedCount,
                        appId: details.appId,
                        title: details.title,
                        icon: details.icon || candidate.icon || '',
                        developer: details.developer || candidate.developer || 'Unknown',
                        developerId: details.developerId || '',
                        genre: details.genre || 'Unknown',
                        price: details.price || 0,
                        priceText: details.priceText || (details.free ? 'Free' : `${details.currency || ''} ${details.price}`),
                        free: details.free,
                        currency: details.currency || '',
                        offersIAP: Boolean(details.offersIAP),
                        adSupported: Boolean(details.adSupported),
                        iapBadge: modelLabels.join(' + ') || (details.free ? 'Free' : 'Paid'),
                        score: Number(rating.toFixed(2)),
                        ratingsCount: reviewsCount,
                        writtenReviews: details.reviews || 0,
                        installs: details.installs || 'N/A',
                        updated: details.updated ? new Date(details.updated).toISOString().split('T')[0] : 'N/A',
                        summary: details.summary || '',
                        description: details.description || '',
                        url: details.url || `https://play.google.com/store/apps/details?id=${details.appId}`
                    };

                    sendEvent('match', matchItem);
                } else {
                    if (rating === 0) unratedCount++;
                    else if (rating > maxRating) highRatingCount++;
                    else if (reviewsCount < minReviews) lowReviewCount++;
                }

                if (checked % 5 === 0 || checked === candidateList.length) {
                    sendEvent('progress', {
                        checked,
                        total: candidateList.length,
                        matchedCount,
                        percent: currentProgress,
                        currentAppTitle: details.title
                    });
                }

                await sleep(180);
            } catch (detailErr) {
                // Ignore missing or region-locked individual app details
            }
        }

        const completeMsg = matchedCount > 0
            ? `Completed! Found ${matchedCount} market gap opportunities out of ${checked} evaluated apps.`
            : `Completed! Found 0 matches among ${checked} candidates (${highRatingCount} rated > ${maxRating}★, ${lowReviewCount} had < ${minReviews} reviews, ${unratedCount} unrated).`;

        sendEvent('complete', {
            message: completeMsg,
            totalCandidates: candidateList.length,
            totalChecked: checked,
            matchedCount,
            percent: 100,
            breakdown: {
                unratedCount,
                highRatingCount,
                lowReviewCount,
                matchedCount
            }
        });

        res.end();
    } catch (err) {
        console.error('Fatal streaming error:', err);
        sendEvent('error', { message: err.message || 'Internal server error during search' });
        res.end();
    }
});

// JSON Search Endpoint (Fallback / programmatic API)
app.post('/api/search', async (req, res) => {
    try {
        const country = (req.body.country || 'in').toString().trim().toLowerCase();
        const maxRating = parseFloat(req.body.maxRating ?? 3.5);
        const minReviews = parseInt(req.body.minReviews ?? 100, 10);
        const priceFilter = (req.body.price || 'paid').toString().toLowerCase();
        const rawTerms = (req.body.term || req.body.query || '').toString().trim();
        const limitPerTerm = Math.min(Math.max(parseInt(req.body.num || 50, 10), 10), 100);

        if (!rawTerms) {
            return res.status(400).json({ error: 'Search term is required.' });
        }

        const terms = rawTerms
            .split(/[,;\n]+/)
            .map((t) => t.trim())
            .filter((t) => t.length > 0);

        const candidateApps = new Map();
        for (const term of terms) {
            try {
                const results = await gplay.search({
                    term,
                    num: limitPerTerm,
                    country,
                    lang: 'en',
                    ...(priceFilter === 'paid' ? { price: 'paid' } : priceFilter === 'free' ? { price: 'free' } : {})
                });
                for (const app of results) {
                    if (app.score && app.score > maxRating) continue;
                    candidateApps.set(app.appId, app);
                }
            } catch (e) {
                console.error(`Search error for ${term}:`, e.message);
            }
        }

        const matches = [];
        for (const candidate of candidateApps.values()) {
            try {
                const details = await gplay.app({ appId: candidate.appId, country, lang: 'en' });
                const isPaid = !details.free && details.price > 0;
                const matchesPrice =
                    priceFilter === 'all' ||
                    (priceFilter === 'paid' && isPaid) ||
                    (priceFilter === 'free' && details.free);
                const rating = typeof details.score === 'number' ? details.score : 0;
                const reviewsCount = details.ratings || details.reviews || 0;

                if (matchesPrice && rating > 0 && rating <= maxRating && reviewsCount >= minReviews) {
                    matches.push({
                        title: details.title,
                        appId: details.appId,
                        developer: details.developer,
                        genre: details.genre,
                        priceText: details.priceText || (details.free ? 'Free' : `${details.currency} ${details.price}`),
                        score: Number(rating.toFixed(2)),
                        ratingsCount: reviewsCount,
                        writtenReviews: details.reviews,
                        installs: details.installs,
                        updated: details.updated ? new Date(details.updated).toISOString().split('T')[0] : 'N/A',
                        url: details.url,
                        icon: details.icon
                    });
                }
            } catch (e) {}
        }

        // Sort by review count descending
        matches.sort((a, b) => b.ratingsCount - a.ratingsCount);

        res.json({
            success: true,
            totalMatches: matches.length,
            filters: { country, maxRating, minReviews, priceFilter },
            results: matches
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Export to Excel (.xlsx) endpoint
app.post('/api/export-xlsx', (req, res) => {
    try {
        const apps = req.body.apps || [];
        if (!apps.length) {
            return res.status(400).send('No data provided for export.');
        }

        const rows = apps.map((item, idx) => ({
            'Priority Rank': idx + 1,
            'App Name': item.title || '',
            'Package ID': item.appId || '',
            'Developer': item.developer || '',
            'Category': item.genre || '',
            'Price': item.priceText || '',
            'Monetization': item.offersIAP ? 'In-App Purchases' : (item.free ? 'Free' : 'Pure Paid'),
            'Rating (<= Max)': item.score || 0,
            'Total Ratings (>= Min)': item.ratingsCount || 0,
            'Written Reviews': item.writtenReviews || 0,
            'Downloads': item.installs || '',
            'Last Updated': item.updated || '',
            'Play Store Link': item.url || '',
            'Summary': item.summary || ''
        }));

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const range = XLSX.utils.decode_range(worksheet['!ref']);

        // Make URL column clickable
        for (let row = 1; row <= range.e.r; row++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: 12 });
            const cell = worksheet[cellAddress];
            if (cell && cell.v) {
                cell.l = { Target: cell.v, Tooltip: 'Open in Play Store' };
            }
        }

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Play Store Gaps');

        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const dateStr = new Date().toISOString().split('T')[0];

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="playstore_gaps_${dateStr}.xlsx"`);
        res.send(buffer);
    } catch (err) {
        console.error('XLSX export error:', err);
        res.status(500).json({ error: 'Failed to generate Excel file.' });
    }
});

// ============================================================
// WEEKLY REPORTS (SEO static HTML + JSON on disk)
// ============================================================

app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(renderRobotsTxt({ siteOrigin: siteOriginFromReq(req) }));
});

app.get('/sitemap.xml', async (req, res) => {
    try {
        const reports = await listReports();
        res.type('application/xml').send(renderSitemapXml(reports, { siteOrigin: siteOriginFromReq(req) }));
    } catch (err) {
        console.error('sitemap error:', err);
        res.status(500).type('text/plain').send('Failed to build sitemap');
    }
});

app.get('/api/reports', async (_req, res) => {
    try {
        const reports = await listReports();
        res.json({ success: true, reports });
    } catch (err) {
        console.error('list reports error:', err);
        res.status(500).json({ error: err.message || 'Failed to list reports' });
    }
});

app.post('/api/reports', async (req, res) => {
    try {
        const created = await createReport(req.body || {}, { siteOrigin: siteOriginFromReq(req), allowEmpty: false });
        res.status(201).json({ success: true, ...created });
    } catch (err) {
        const status = err.status || 500;
        if (status >= 500) console.error('create report error:', err);
        res.status(status).json({ error: err.message || 'Failed to publish report' });
    }
});

app.delete('/api/reports/:slug', async (req, res) => {
    try {
        const result = await deleteReport(req.params.slug);
        res.json({ success: true, ...result });
    } catch (err) {
        const status = err.status || 500;
        res.status(status).json({ error: err.message || 'Failed to delete report' });
    }
});

app.get('/reports', async (req, res) => {
    try {
        const reports = await listReports();
        const html = renderReportsIndexHtml(reports, { siteOrigin: siteOriginFromReq(req) });
        res.type('html').send(html);
    } catch (err) {
        console.error('reports index error:', err);
        res.status(500).send('Failed to load reports index');
    }
});

app.get('/reports/:slug', async (req, res) => {
    try {
        const report = await getReport(req.params.slug);
        if (!report) {
            return res.status(404).type('html').send(`<!DOCTYPE html><html><head><title>Report not found</title></head><body style="font-family:system-ui;padding:40px"><h1>Report not found</h1><p><a href="/reports">Back to weekly reports</a></p></body></html>`);
        }
        // Prefer freshly rendered HTML so SEO tags always match current origin
        const html = renderReportHtml(report, { siteOrigin: siteOriginFromReq(req) });
        res.type('html').send(html);
    } catch (err) {
        console.error('report page error:', err);
        res.status(500).send('Failed to load report');
    }
});

// Vercel imports this module and handles HTTP; only listen locally.
export default app;

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Play Store Gap Finder running at http://localhost:${PORT}`);
        console.log(`Engine: google-play-scraper (no API key required)`);
        console.log(`Weekly reports: http://localhost:${PORT}/reports`);
    });
}
