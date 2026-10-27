import gplay from 'google-play-scraper';
import XLSX from 'xlsx';

// 1. Target keywords across Productivity, Tools/Utilities, and Educational Games
const SEARCH_TERMS = [
    // Productivity & Study
    'study planner', 'school planner', 'homework tracker', 'pomodoro timer',
    'pdf annotator', 'digital planner', 'flashcards pro', 'habit tracker pro',
    'mind map pro', 'daily agenda', 'gpa calculator', 'lecture notes',
    // Tools & Utilities
    'scientific calculator pro', 'file manager pro', 'document scanner pro',
    'ip camera viewer pro', 'wifi analyzer pro', 'audio recorder pro',
    'unit converter pro', 'automation tool', 'clipboard manager pro', 'qr scanner pro',
    // Educational Games
    'math games kids', 'spelling game', 'phonics game', 'coding game kids',
    'geography quiz pro', 'chess tutor', 'brain training pro', 'logic puzzle educational'
];

// Set country to 'us' (widest pool of paid apps with 100+ reviews) or 'in' (India store)
const COUNTRY = 'in';
const MAX_RATING = 3.5;
const MIN_REVIEWS = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findLowRatedPaidApps() {
    console.log(`🔍 Step 1: Searching Google Play (${COUNTRY.toUpperCase()}) for PAID apps across ${SEARCH_TERMS.length} keywords...`);
    const candidateAppIds = new Set();

    for (const term of SEARCH_TERMS) {
        try {
            const results = await gplay.search({
                term: term,
                num: 50,
                price: 'paid', // Strictly paid upfront apps
                country: COUNTRY,
                lang: 'en'
            });

            for (const app of results) {
                // Quick pre-filter: if score exists and is > 3.5, skip early to save time
                if (app.score && app.score > MAX_RATING) continue;
                candidateAppIds.add(app.appId);
            }
            process.stdout.write(`.`);
            await sleep(300); // Polite delay to avoid rate-limiting
        } catch (err) {
            console.error(`\n⚠️ Error searching "${term}":`, err.message);
        }
    }

    console.log(`\n✅ Found ${candidateAppIds.size} potential low-rated paid candidates. Fetching full store details...`);

    const matchedApps = [];
    let checked = 0;

    for (const appId of candidateAppIds) {
        checked++;
        try {
            const details = await gplay.app({ appId, country: COUNTRY, lang: 'en' });

            const isPaidOneTime = !details.free && details.price > 0;
            const rating = details.score || 0;
            const reviewsCount = details.ratings || 0; // Total number of user ratings

            // Apply strict filters: Paid + Rating <= 3.5 (and > 0) + Reviews >= 100
            if (isPaidOneTime && rating > 0 && rating <= MAX_RATING && reviewsCount >= MIN_REVIEWS) {
                matchedApps.push({
                    'App Name': details.title,
                    'Package ID': details.appId,
                    'Category': details.genre || 'Unknown',
                    'Price': details.priceText || `${details.currency} ${details.price}`,
                    'In-App Purchases': details.offersIAP ? 'Yes (Has IAP)' : 'No (Pure One-Time)',
                    'Rating (<=3.5)': Number(rating.toFixed(2)),
                    'Total Ratings (>=100)': reviewsCount,
                    'Written Reviews': details.reviews || 0,
                    'Downloads': details.installs || 'N/A',
                    'Last Updated': details.updated ? new Date(details.updated).toISOString().split('T')[0] : 'N/A',
                    'Summary': details.summary || '',
                    'Play Store URL': details.url
                });

                console.log(`🎯 MATCH [${matchedApps.length}]: ${details.title} | ${rating.toFixed(2)}★ | ${reviewsCount} ratings | ${details.priceText}`);
            }

            if (checked % 20 === 0) {
                console.log(`   ...checked ${checked}/${candidateAppIds.size} apps (${matchedApps.length} matches so far)`);
            }
            await sleep(250);
        } catch (err) {
            // Ignore 404s or region-locked apps
        }
    }

    // Sort by highest number of ratings first (biggest proven buyer demand with unhappy users)
    matchedApps.sort((a, b) => b['Total Ratings (>=100)'] - a['Total Ratings (>=100)']);

    // Add Priority Rank column
    const finalData = matchedApps.map((item, index) => ({
        'Priority Rank': index + 1,
        ...item
    }));

    // Export to Excel (.xlsx) with clickable hyperlinks
    const worksheet = XLSX.utils.json_to_sheet(finalData);

    // Convert the Play Store URL column (Column M) into clickable Excel hyperlinks
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    for (let row = 1; row <= range.e.r; row++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: 12 }); // Column M (0-indexed 12)
        const cell = worksheet[cellAddress];
        if (cell && cell.v) {
            cell.l = { Target: cell.v, Tooltip: 'Click to open in Google Play Store' };
        }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Filtered Paid Apps');

    const fileName = 'Low_Rated_Paid_Apps.xlsx';
    XLSX.writeFile(workbook, fileName);

    console.log(`\n🎉 Done! Exported ${finalData.length} verified apps to "${fileName}".`);
}

findLowRatedPaidApps();