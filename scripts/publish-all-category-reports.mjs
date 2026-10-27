#!/usr/bin/env node
/**
 * Scan all categories for India via google-play-scraper (no SerpApi)
 * and publish SEO weekly reports — one per category + one combined hub.
 */
import gplay from 'google-play-scraper';
import {
    saveReport,
    regenerateAllReportHtml,
    ensureReportsDir,
    CATEGORY_LABELS
} from '../lib/reports.mjs';

const CATEGORY_KEYWORD_MAP = {
    PRODUCTIVITY: ['study planner', 'school planner', 'pomodoro timer', 'pdf annotator', 'digital planner', 'flashcards pro', 'habit tracker pro', 'daily agenda'],
    EDUCATION: ['math games kids', 'spelling game', 'phonics game', 'coding game kids', 'geography quiz pro', 'chess tutor', 'language learning pro'],
    TOOLS: ['scientific calculator pro', 'document scanner pro', 'wifi analyzer pro', 'audio recorder pro', 'file manager pro', 'clipboard manager pro', 'unit converter pro'],
    GAMES: ['brain training pro', 'logic puzzle educational', 'chess tutor', 'sudoku pro', 'puzzle games kids', 'math puzzle'],
    BUSINESS: ['invoice maker pro', 'receipt scanner', 'budget planner pro', 'expense tracker pro'],
    HEALTH: ['workout planner pro', 'calorie counter pro', 'fasting tracker pro', 'stretch routine', 'posture tracker']
};

const ALL_CATEGORIES = Object.keys(CATEGORY_KEYWORD_MAP);
const COUNTRY = 'in';
const MAX_RATING = 3.5;
const MIN_REVIEWS = 100;
const MONETIZATION = ['paid', 'iap'];
const NUM = 45;
const CANDIDATE_CAP = 55;
const DETAIL_DELAY_MS = 300;
const SEARCH_DELAY_MS = 280;
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'http://localhost:3000';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function matchesMonetization(details, monetizationList) {
    const isPaid = !details.free && details.price > 0;
    const hasIAP = Boolean(details.offersIAP);
    const hasAds = Boolean(details.adSupported);
    const isPureFree = Boolean(details.free) && !hasIAP && !hasAds;
    let ok = false;
    if (monetizationList.includes('all')) ok = true;
    if (monetizationList.includes('paid') && isPaid) ok = true;
    if (monetizationList.includes('iap') && hasIAP) ok = true;
    if (monetizationList.includes('ads') && hasAds) ok = true;
    if (monetizationList.includes('free') && isPureFree) ok = true;
    return { ok, isPaid, hasIAP, hasAds, isPureFree };
}

async function scanCategory(catKey, { country, maxRating, minReviews, monetization, num, candidateCap }) {
    const terms = CATEGORY_KEYWORD_MAP[catKey] || [];
    const candidateApps = new Map();
    const errors = [];

    console.log(`\n=== Scanning ${catKey} (${CATEGORY_LABELS[catKey] || catKey}) @ ${country.toUpperCase()} ===`);

    // Chart list
    if (gplay.category[catKey]) {
        try {
            console.log(`  [list] TOP_PAID chart…`);
            const catApps = await gplay.list({
                category: gplay.category[catKey],
                collection: gplay.collection.TOP_PAID,
                num,
                country
            });
            for (const app of catApps) {
                if (app.score && app.score > maxRating + 0.3) continue;
                if (!candidateApps.has(app.appId)) {
                    candidateApps.set(app.appId, { ...app, _country: country });
                }
            }
            console.log(`  [list] candidates=${candidateApps.size}`);
        } catch (e) {
            errors.push(`list:${e.message}`);
            console.warn(`  [list] error: ${e.message}`);
        }
        await sleep(SEARCH_DELAY_MS);
    }

    for (let i = 0; i < terms.length; i++) {
        const term = terms[i];
        try {
            console.log(`  [search] (${i + 1}/${terms.length}) "${term}"`);
            const results = await gplay.search({
                term,
                num,
                country,
                lang: 'en'
            });
            for (const app of results) {
                if (app.score && app.score > maxRating + 0.3) continue;
                if (!candidateApps.has(app.appId)) {
                    candidateApps.set(app.appId, { ...app, _country: country });
                }
            }
        } catch (e) {
            errors.push(`search:${term}:${e.message}`);
            console.warn(`  [search] error "${term}": ${e.message}`);
        }
        await sleep(SEARCH_DELAY_MS);
        if (candidateApps.size >= candidateCap * 2) break;
    }

    let list = Array.from(candidateApps.values()).slice(0, candidateCap);
    console.log(`  Evaluating ${list.length} candidates (cap ${candidateCap})…`);

    const matches = [];
    let checked = 0;
    for (const candidate of list) {
        checked++;
        try {
            const details = await gplay.app({
                appId: candidate.appId,
                country: candidate._country || country,
                lang: 'en'
            });
            const rating = typeof details.score === 'number' ? details.score : 0;
            const reviewsCount = details.ratings || details.reviews || 0;
            const mon = matchesMonetization(details, monetization);
            if (mon.ok && rating > 0 && rating <= maxRating && reviewsCount >= minReviews) {
                const modelLabels = [];
                if (mon.isPaid) modelLabels.push('Paid Upfront');
                if (mon.hasIAP) modelLabels.push('In-App Purchases');
                matches.push({
                    title: details.title,
                    appId: details.appId,
                    developer: details.developer || candidate.developer || '',
                    genre: details.genre || '',
                    score: Number(rating.toFixed(2)),
                    ratingsCount: reviewsCount,
                    priceText: details.priceText || (details.free ? 'Free' : `${details.currency || ''} ${details.price}`),
                    free: details.free,
                    offersIAP: Boolean(details.offersIAP),
                    url: details.url || `https://play.google.com/store/apps/details?id=${details.appId}`,
                    summary: details.summary || '',
                    icon: details.icon || candidate.icon || ''
                });
                console.log(`    ✓ ${details.title} (${rating.toFixed(2)}★ / ${reviewsCount})`);
            }
        } catch (e) {
            // region-locked / missing — skip
        }
        await sleep(DETAIL_DELAY_MS);
        if (checked % 10 === 0) {
            console.log(`  …checked ${checked}/${list.length}, matches=${matches.length}`);
        }
    }

    console.log(`  Done ${catKey}: ${matches.length} matches from ${checked} evaluated`);
    return { matches, errors, checked };
}

async function main() {
    await ensureReportsDir();
    const weekOf = new Date().toISOString().slice(0, 10);
    const results = [];
    const allMatches = [];
    const seenIds = new Set();

    for (const cat of ALL_CATEGORIES) {
        try {
            const { matches, errors, checked } = await scanCategory(cat, {
                country: COUNTRY,
                maxRating: MAX_RATING,
                minReviews: MIN_REVIEWS,
                monetization: MONETIZATION,
                num: NUM,
                candidateCap: CANDIDATE_CAP
            });

            const published = await saveReport({
                weekOf,
                countries: [COUNTRY],
                categories: [cat],
                maxRating: MAX_RATING,
                minReviews: MIN_REVIEWS,
                monetization: MONETIZATION,
                apps: matches
            }, { siteOrigin: SITE_ORIGIN, allowEmpty: true });

            console.log(`  Published → ${published.url} (${published.totalCount} apps)`);
            results.push({
                category: cat,
                slug: published.slug,
                url: published.url,
                totalCount: published.totalCount,
                checked,
                errors
            });

            for (const m of matches) {
                if (!seenIds.has(m.appId)) {
                    seenIds.add(m.appId);
                    allMatches.push(m);
                }
            }
        } catch (e) {
            console.error(`  FAILED ${cat}:`, e.message);
            results.push({ category: cat, error: e.message, totalCount: 0 });
        }
    }

    // Combined hub report
    console.log(`\n=== Publishing combined all-categories hub (${allMatches.length} unique apps) ===`);
    let hub = null;
    try {
        hub = await saveReport({
            weekOf,
            countries: [COUNTRY],
            categories: ALL_CATEGORIES,
            maxRating: MAX_RATING,
            minReviews: MIN_REVIEWS,
            monetization: MONETIZATION,
            apps: allMatches,
            title: `Play Store Gaps: All Categories Android Market Opportunities in India — Week of ${new Date(weekOf).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        }, { siteOrigin: SITE_ORIGIN, allowEmpty: true });
        console.log(`  Hub → ${hub.url} (${hub.totalCount} apps)`);
    } catch (e) {
        console.error('  Hub publish failed:', e.message);
    }

    // Regenerate any pre-existing HTML with new SEO template
    const regen = await regenerateAllReportHtml({ siteOrigin: SITE_ORIGIN });
    console.log(`\nRegenerated HTML for ${regen.length} report(s).`);

    console.log('\n========== SUMMARY ==========');
    for (const r of results) {
        if (r.error) console.log(`  ${r.category}: ERROR ${r.error}`);
        else console.log(`  ${r.category}: ${r.totalCount} gaps → ${r.url}${r.errors?.length ? ` (warns: ${r.errors.length})` : ''}`);
    }
    if (hub) console.log(`  ALL: ${hub.totalCount} gaps → ${hub.url}`);
    console.log('=============================\n');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
