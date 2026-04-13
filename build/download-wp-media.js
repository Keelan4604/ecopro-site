/**
 * EcoPro USA — WordPress Media Download Script
 *
 * Downloads all media files (images, PDFs, videos) from the WordPress
 * media library via the REST API and organizes them into static/.
 *
 * Features:
 *   - Paginated API fetching (100 per page)
 *   - Product slug matching via data/products.json
 *   - Skip files that already exist locally
 *   - Retry on download failure (up to 3 attempts)
 *   - Progress display with running totals
 *   - Graceful error handling (continues on individual failures)
 *
 * Usage: node build/download-wp-media.js
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// ── Config ──────────────────────────────────────────────────────────────────
const WP_API = 'https://ecoprousa.com/wp-json/wp/v2/media';
const ROOT_DIR = path.join(__dirname, '..');
const STATIC_DIR = path.join(ROOT_DIR, 'static');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PER_PAGE = 100;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// ── Load products.json for slug matching ────────────────────────────────────
let products = [];
try {
  const raw = fs.readFileSync(path.join(DATA_DIR, 'products.json'), 'utf8');
  products = JSON.parse(raw).products || [];
  console.log(`Loaded ${products.length} products from products.json`);
} catch (e) {
  console.warn('Warning: Could not load products.json — will use filename heuristics only');
}

// Build a map of image URL -> product slug from products.json
const imageToProductSlug = new Map();
for (const p of products) {
  if (!p.images) continue;
  const urls = p.images.sources || [];
  if (p.images.main) urls.push(p.images.main);
  if (p.images.gallery) urls.push(...p.images.gallery);
  for (const imgUrl of urls) {
    if (imgUrl) imageToProductSlug.set(imgUrl, p.slug);
  }
}
console.log(`Indexed ${imageToProductSlug.size} image URLs to product slugs\n`);

// ── Filename-to-product-slug heuristic patterns ─────────────────────────────
// Order matters: more specific patterns first
const FILENAME_PRODUCT_PATTERNS = [
  // Turbo II HD and machine-specific T2 kits
  { test: /t2hd|tiihd|turbo[-_]?ii|turbo[-_]?2/i, slug: 'turbo-ii-hd' },
  { test: /what[-_]we[-_]do/i, slug: 'turbo-ii-hd' },
  { test: /^t2[-_]/i, slug: 'turbo-ii-hd' },

  // CCAP / Clean Cabin Air Pressurizer
  { test: /ccap|pressurizer|cabin[-_]air/i, slug: 'clean-cabin-air-pressurizer' },
  { test: /^cap[-_]/i, slug: 'clean-cabin-air-pressurizer' },

  // Desiccant breathers
  { test: /desiccant|dessicant|breather/i, slug: 'desiccant-breathers' },

  // EZ3 kits
  { test: /ez3|ez[-_]?3/i, slug: 'ez3' },

  // LED lights
  { test: /duralux|h30\d|h50\d|h40\d|h01\d|h90\d|h0[15]\d/i, slug: 'led-lights' },
  { test: /\bled\b|tipper[-_]led|dozer[-_]led|work[-_]light|beacon/i, slug: 'led-lights' },

  // Jump starters
  { test: /h05\d|jump[-_]?start/i, slug: 'jump-starters' },

  // Metal / rubber adapters, baffles, stack extensions
  { test: /baffle/i, slug: 'turbo-ii-hd' },
  { test: /adapter|grm[-_]|mse[-_]|mea[-_]/i, slug: 'metal-adapters' },

  // HVAC
  { test: /hvac/i, slug: 'clean-cabin-air-pressurizer' },

  // Machine names commonly associated with Turbo II
  { test: /hyster|john[-_]?deere|966m?|836|826|950|980|988|972|938|320|330|323|336/i, slug: 'turbo-ii-hd' },

  // Spinner / PreScreen parts
  { test: /spinner|pre[-_]?screen/i, slug: 'turbo-ii-hd' },
];

// ── PDF category patterns ───────────────────────────────────────────────────
const PDF_CATEGORY_PATTERNS = [
  { test: /t2|turbo|spinner|pre[-_]?screen|air[-_]?filter|baffle/i, folder: 'turbo-ii' },
  { test: /ccap|pressurizer|cabin/i, folder: 'ccap' },
  { test: /h30|h50|h40|h01|h90|led|light|dozer|bracket|beacon|duralux|tipper/i, folder: 'lights' },
  { test: /h05|jump/i, folder: 'jump-starters' },
  { test: /desiccant|dessicant|breather/i, folder: 'desiccant' },
  { test: /ez3/i, folder: 'ez3' },
  { test: /hvac/i, folder: 'hvac' },
  { test: /adapter|mse|mea|grm/i, folder: 'adapters' },
];

// ── Image category patterns (for non-product images) ────────────────────────
const IMAGE_CATEGORY_PATTERNS = [
  { test: /logo|eco[-_]?pro[-_]?logo/i, folder: path.join('images', 'logo') },
  { test: /slide|banner|hero/i, folder: path.join('images', 'hero') },
  { test: /^c\d+|testimonial|client/i, folder: path.join('images', 'clients') },
  { test: /founder|our[-_]history|team|staff|about/i, folder: path.join('images', 'about') },
  { test: /favicon|icon/i, folder: path.join('images', 'icons') },
];

// ── Determine local file path for a media item ─────────────────────────────
function getLocalPath(sourceUrl, mimeType) {
  const filename = path.basename(sourceUrl).split('?')[0];
  const lower = filename.toLowerCase();

  // PDFs -> static/pdfs/{category}/
  if (mimeType === 'application/pdf') {
    for (const pat of PDF_CATEGORY_PATTERNS) {
      if (pat.test.test(lower)) {
        return path.join(STATIC_DIR, 'pdfs', pat.folder, filename);
      }
    }
    return path.join(STATIC_DIR, 'pdfs', filename);
  }

  // Videos -> static/videos/
  if (mimeType && mimeType.startsWith('video/')) {
    return path.join(STATIC_DIR, 'videos', filename);
  }

  // Images — first check if this exact URL is in products.json
  const knownSlug = imageToProductSlug.get(sourceUrl);
  if (knownSlug) {
    return path.join(STATIC_DIR, 'images', 'products', knownSlug, filename);
  }

  // Try filename heuristics to match to a product
  for (const pat of FILENAME_PRODUCT_PATTERNS) {
    if (pat.test.test(lower)) {
      return path.join(STATIC_DIR, 'images', 'products', pat.slug, filename);
    }
  }

  // Try non-product image categories (logo, hero, clients, about)
  for (const pat of IMAGE_CATEGORY_PATTERNS) {
    if (pat.test.test(lower)) {
      return path.join(STATIC_DIR, pat.folder, filename);
    }
  }

  // Catch-all
  return path.join(STATIC_DIR, 'images', 'wp-media', filename);
}

// ── HTTP helpers ────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpGet(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const transport = parsed.protocol === 'https:' ? https : http;

    transport.get(targetUrl, {
      headers: { 'User-Agent': 'EcoPro-MediaDownloader/1.0' }
    }, (res) => {
      resolve(res);
    }).on('error', reject);
  });
}

function fetchJSON(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const transport = parsed.protocol === 'https:' ? https : http;

    transport.get(targetUrl, {
      headers: { 'User-Agent': 'EcoPro-MediaDownloader/1.0' }
    }, (res) => {
      // Handle redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchJSON(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} fetching ${targetUrl}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          // WP API returns an object with code/message on error pages
          if (parsed && parsed.code === 'rest_post_invalid_page_number') {
            resolve({ items: [], totalPages: 0 });
          } else if (Array.isArray(parsed)) {
            resolve({
              items: parsed,
              totalPages: parseInt(res.headers['x-wp-totalpages'] || '1', 10),
              totalItems: parseInt(res.headers['x-wp-total'] || '0', 10),
            });
          } else {
            resolve({ items: [], totalPages: 0 });
          }
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(sourceUrl, destPath, attempt) {
  attempt = attempt || 1;
  return new Promise(async (resolve, reject) => {
    const dir = path.dirname(destPath);
    fs.mkdirSync(dir, { recursive: true });

    // Skip if file exists and has content
    if (fs.existsSync(destPath)) {
      const stat = fs.statSync(destPath);
      if (stat.size > 0) {
        resolve('skipped');
        return;
      }
      // Remove empty files from previous failed downloads
      fs.unlinkSync(destPath);
    }

    try {
      const res = await httpGet(sourceUrl);

      // Handle redirects (up to 5 levels)
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        const location = res.headers.location;
        res.resume(); // drain the response
        if (!location) {
          reject(new Error('Redirect with no Location header'));
          return;
        }
        try {
          const result = await downloadFile(location, destPath, attempt);
          resolve(result);
        } catch (e) {
          reject(e);
        }
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(destPath);
      res.pipe(file);

      file.on('finish', () => {
        file.close(() => resolve('downloaded'));
      });

      file.on('error', (err) => {
        file.close();
        try { fs.unlinkSync(destPath); } catch (_) {}
        reject(err);
      });

      res.on('error', (err) => {
        file.close();
        try { fs.unlinkSync(destPath); } catch (_) {}
        reject(err);
      });

    } catch (err) {
      reject(err);
    }
  });
}

async function downloadWithRetry(sourceUrl, destPath) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await downloadFile(sourceUrl, destPath, attempt);
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt;
        console.log(`    RETRY ${attempt}/${MAX_RETRIES} in ${delay}ms — ${err.message}`);
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
}

// ── Progress display ────────────────────────────────────────────────────────
function progressBar(current, total, width) {
  width = width || 30;
  const pct = total > 0 ? current / total : 0;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  return '[' + '#'.repeat(filled) + '-'.repeat(empty) + '] ' +
         Math.round(pct * 100) + '% (' + current + '/' + total + ')';
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('========================================');
  console.log('  EcoPro USA - WP Media Downloader');
  console.log('========================================\n');

  // Ensure output dirs exist
  for (const dir of [
    path.join(STATIC_DIR, 'images', 'wp-media'),
    path.join(STATIC_DIR, 'images', 'products'),
    path.join(STATIC_DIR, 'pdfs'),
    path.join(STATIC_DIR, 'videos'),
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Phase 1: Fetch all media items from WP API
  console.log('Phase 1: Fetching media list from WordPress API...\n');

  let allItems = [];
  let page = 1;
  let totalPages = 1;
  let totalItems = 0;

  while (page <= totalPages) {
    const apiUrl = `${WP_API}?per_page=${PER_PAGE}&page=${page}`;
    process.stdout.write(`  Fetching page ${page}...`);

    try {
      const result = await fetchJSON(apiUrl);
      if (page === 1) {
        totalPages = result.totalPages;
        totalItems = result.totalItems;
        console.log(` found ${totalItems} total media items across ${totalPages} pages`);
      } else {
        console.log(` got ${result.items.length} items`);
      }

      if (!result.items || result.items.length === 0) break;
      allItems = allItems.concat(result.items);
    } catch (err) {
      console.log(` ERROR: ${err.message}`);
      // If first page fails, there is nothing to do
      if (page === 1) {
        console.error('\nFailed to reach WP API. Aborting.');
        process.exit(1);
      }
      break;
    }

    page++;
  }

  console.log(`\nCollected ${allItems.length} media items total.\n`);

  if (allItems.length === 0) {
    console.log('No media items found. Exiting.');
    return;
  }

  // Phase 2: Download files
  console.log('Phase 2: Downloading media files...\n');

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  // Track where files go for the summary
  const folderCounts = {};

  for (const item of allItems) {
    processed++;
    const sourceUrl = item.source_url;
    const mimeType = item.mime_type || '';
    const title = (item.title && item.title.rendered) || item.slug || '';

    if (!sourceUrl) {
      console.log(`  [${processed}/${allItems.length}] SKIP (no URL): ${title}`);
      skipped++;
      continue;
    }

    const localPath = getLocalPath(sourceUrl, mimeType);
    const relPath = path.relative(ROOT_DIR, localPath);
    const folderKey = path.dirname(path.relative(STATIC_DIR, localPath));

    process.stdout.write(`  ${progressBar(processed, allItems.length)} `);

    try {
      const result = await downloadWithRetry(sourceUrl, localPath);

      if (result === 'skipped') {
        console.log(`SKIP ${path.basename(localPath)}`);
        skipped++;
      } else {
        console.log(`OK   ${relPath}`);
        downloaded++;
      }

      folderCounts[folderKey] = (folderCounts[folderKey] || 0) + 1;

    } catch (err) {
      console.log(`FAIL ${path.basename(sourceUrl)} - ${err.message}`);
      failed++;
    }
  }

  // Phase 3: Summary
  console.log('\n========================================');
  console.log('  Download Summary');
  console.log('========================================');
  console.log(`  Total media items:  ${allItems.length}`);
  console.log(`  Downloaded:         ${downloaded}`);
  console.log(`  Skipped (existing): ${skipped}`);
  console.log(`  Failed:             ${failed}`);
  console.log('');
  console.log('  Files by folder:');

  const sortedFolders = Object.entries(folderCounts).sort((a, b) => b[1] - a[1]);
  for (const [folder, count] of sortedFolders) {
    console.log(`    ${folder}: ${count}`);
  }

  console.log('\nDone!');
  if (failed > 0) {
    console.log(`\nNote: ${failed} file(s) failed after ${MAX_RETRIES} retries each.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
