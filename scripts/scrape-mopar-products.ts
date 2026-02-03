/**
 * Scrape MoparSupply product pages to get full product details
 * Designed for long-running operation over multiple days
 * 
 * Features:
 * - Progress tracking (resume from interruption)
 * - Polite delays (3-8 seconds between requests)
 * - Batch database commits
 * - Image downloading with tc- prefix
 * 
 * Usage:
 *   npx tsx scripts/scrape-mopar-products.ts [--limit=1000] [--resume] [--dry-run]
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { db } from '../server/db';
import { products } from '../shared/schema';
import { eq } from 'drizzle-orm';

interface ScrapedProduct {
  partNumber: string;
  name: string;
  description: string;
  price: number;
  msrp: number;
  imageUrl: string;
  category: string;
  manufacturer: string;
  url: string;
  scrapedAt: Date;
}

interface ScrapeProgress {
  totalUrls: number;
  completedUrls: string[];
  failedUrls: { url: string; error: string; attempts: number }[];
  lastUpdated: string;
  startedAt: string;
}

const PROGRESS_FILE = 'data/scrape-progress.json';
const IMAGES_DIR = 'attached_assets/product_images';
const DELAY_MIN = 3000; // 3 seconds
const DELAY_MAX = 8000; // 8 seconds
const BATCH_SIZE = 50; // Commit to DB every 50 products
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(): number {
  return Math.floor(Math.random() * (DELAY_MAX - DELAY_MIN)) + DELAY_MIN;
}

function loadProgress(): ScrapeProgress {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return {
    totalUrls: 0,
    completedUrls: [],
    failedUrls: [],
    lastUpdated: new Date().toISOString(),
    startedAt: new Date().toISOString()
  };
}

function saveProgress(progress: ScrapeProgress): void {
  progress.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function loadProductUrls(): string[] {
  const urlsPath = 'data/mopar-product-urls.json';
  if (!fs.existsSync(urlsPath)) {
    throw new Error(`Product URLs file not found: ${urlsPath}\nRun fetch-mopar-sitemap.ts first`);
  }
  return JSON.parse(fs.readFileSync(urlsPath, 'utf-8'));
}

async function downloadImage(imageUrl: string, partNumber: string): Promise<string | null> {
  if (!imageUrl || imageUrl.includes('placeholder') || imageUrl.includes('no-image')) {
    return null;
  }

  const filename = `tc-${partNumber}.jpg`;
  const filepath = path.join(IMAGES_DIR, filename);
  
  // Skip if already exists
  if (fs.existsSync(filepath)) {
    return filename;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(null);
    }, 15000);

    https.get(imageUrl, (response) => {
      if (response.statusCode !== 200) {
        clearTimeout(timeout);
        resolve(null);
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        clearTimeout(timeout);
        const buffer = Buffer.concat(chunks);
        if (buffer.length > 1000) { // Skip tiny/broken images
          fs.writeFileSync(filepath, buffer);
          resolve(filename);
        } else {
          resolve(null);
        }
      });
      response.on('error', () => {
        clearTimeout(timeout);
        resolve(null);
      });
    }).on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

async function scrapeProductPage(page: Page, url: string): Promise<ScrapedProduct | null> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for Cloudflare challenge to complete (check for real product title)
    let cloudflareCleared = false;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(1000);
      const title = await page.title();
      // Real product pages have part number in title like "68714723AA - Floor Mat"
      if (title.match(/[A-Z0-9]{7,12}\s*-/) || title.includes('Mopar Supply')) {
        if (!title.includes('moment') && !title.includes('Attention') && !title.includes('blocked')) {
          cloudflareCleared = true;
          break;
        }
      }
    }
    
    if (!cloudflareCleared) {
      console.log('  ⚠ Cloudflare challenge not cleared');
      return null;
    }
    
    // Wait for content to fully load
    await page.waitForTimeout(4000);

    // Extract product data from page text (more reliable than selectors)
    const data = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      
      // Part number from URL
      const urlMatch = window.location.pathname.match(/-([0-9a-z]{7,12})$/i);
      const partNumber = urlMatch ? urlMatch[1].toUpperCase() : '';

      // Product name from H1
      const h1 = document.querySelector('h1')?.textContent?.trim() || '';
      const name = h1.replace(/\s*\([^)]+\)\s*$/, '').trim(); // Remove part number from end

      // Extract prices from text
      const msrpMatch = bodyText.match(/MSRP:\s*\$([0-9,.]+)/);
      const salePriceMatch = bodyText.match(/Sale Price:\s*\$([0-9,.]+)/);
      const msrp = msrpMatch ? parseFloat(msrpMatch[1].replace(',', '')) : 0;
      const price = salePriceMatch ? parseFloat(salePriceMatch[1].replace(',', '')) : msrp;

      // Extract description
      const descMatch = bodyText.match(/Description:([^]*?)(?:Condition:|WARNING:|$)/);
      const description = descMatch ? descMatch[1].trim().slice(0, 500) : '';

      // Extract brand
      const brandMatch = bodyText.match(/Brand:\s*([^\n]+)/);
      const brand = brandMatch ? brandMatch[1].trim() : 'Mopar';

      // Find product image (not logos)
      const images = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
      const productImg = images.find(img => 
        img.src && 
        !img.src.includes('logo') && 
        !img.src.includes('icon') &&
        (img.width > 150 || img.src.includes('product'))
      );
      const imageUrl = productImg?.src || '';

      // Category from breadcrumbs
      const breadcrumbs = Array.from(document.querySelectorAll('a')).filter(a => 
        a.href.includes('/categories/') || a.textContent?.includes('Categories')
      );
      const categoryLink = breadcrumbs[breadcrumbs.length - 1];
      const category = categoryLink?.textContent?.trim() || '';

      return { partNumber, name, price, msrp, description, imageUrl, category, brand };
    });

    if (!data.partNumber || !data.name) {
      return null;
    }

    return {
      partNumber: data.partNumber,
      name: data.name,
      description: data.description,
      price: data.price,
      msrp: data.msrp,
      imageUrl: data.imageUrl,
      category: data.category,
      manufacturer: data.brand || 'Mopar',
      url: url,
      scrapedAt: new Date()
    };
  } catch (error) {
    console.error(`  Error scraping ${url}: ${error}`);
    return null;
  }
}

async function saveProductToDatabase(product: ScrapedProduct, imageFilename: string | null): Promise<void> {
  // Check if product already exists
  const existing = await db.select({ id: products.id })
    .from(products)
    .where(eq(products.partNumber, product.partNumber))
    .limit(1);

  const imageUrl = imageFilename 
    ? `/attached_assets/product_images/${imageFilename}`
    : '/attached_assets/product_images/tc-placeholder.jpg';

  if (existing.length > 0) {
    // Update existing product
    await db.update(products)
      .set({
        description: product.description || undefined,
        price: product.price > 0 ? String(product.price) : undefined,
        msrp: product.msrp > 0 ? String(product.msrp) : undefined,
        imageUrl: imageFilename ? imageUrl : undefined,
        updatedAt: new Date()
      })
      .where(eq(products.partNumber, product.partNumber));
  } else {
    // Insert new product
    await db.insert(products).values({
      partNumber: product.partNumber,
      name: product.name,
      description: product.description,
      price: String(product.price || 0),
      msrp: String(product.msrp || product.price || 0),
      cost: '0',
      manufacturer: product.manufacturer,
      category: product.category || 'OEM Parts',
      imageUrl: imageUrl,
      inStock: true,
      vehicleMake: 'Universal',
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;
  const resume = args.includes('--resume');
  const dryRun = args.includes('--dry-run');

  console.log('[Scraper] Starting MoparSupply product scraper');
  console.log(`  Limit: ${limit === Infinity ? 'none' : limit}`);
  console.log(`  Resume: ${resume}`);
  console.log(`  Dry run: ${dryRun}`);

  // Ensure directories exist
  fs.mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true });
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  // Load URLs and progress
  const allUrls = loadProductUrls();
  let progress = resume ? loadProgress() : {
    totalUrls: allUrls.length,
    completedUrls: [],
    failedUrls: [],
    lastUpdated: new Date().toISOString(),
    startedAt: new Date().toISOString()
  };

  const completedSet = new Set(progress.completedUrls);
  const failedMap = new Map(progress.failedUrls.map(f => [f.url, f]));

  // Filter URLs to process
  const urlsToProcess = allUrls.filter(url => !completedSet.has(url));
  const urlsToScrape = urlsToProcess.slice(0, limit);

  console.log(`\n[Scraper] URLs to process: ${urlsToScrape.length} of ${allUrls.length} total`);
  console.log(`  Already completed: ${completedSet.size}`);
  console.log(`  Failed (will retry): ${failedMap.size}`);

  if (urlsToScrape.length === 0) {
    console.log('\n[Scraper] All URLs have been processed!');
    return;
  }

  // Launch browser with stealth-like settings
  const browser = await chromium.launch({ 
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York'
  });
  
  // Remove webdriver flag
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  
  const page = await context.newPage();
  
  // First, visit the homepage to establish a session and pass Cloudflare
  console.log('\n[Scraper] Establishing session with MoparSupply...');
  await page.goto('https://www.moparsupply.com/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(5000); // Wait for Cloudflare challenge
  
  const title = await page.title();
  if (title.includes('blocked') || title.includes('Attention')) {
    console.log('[Scraper] WARNING: Cloudflare is blocking. Waiting longer...');
    await page.waitForTimeout(10000);
  }
  console.log('[Scraper] Session established, starting scrape...');

  let successCount = 0;
  let failCount = 0;
  let batchProducts: { product: ScrapedProduct; imageFilename: string | null }[] = [];

  try {
    for (let i = 0; i < urlsToScrape.length; i++) {
      const url = urlsToScrape[i];
      const progressPct = ((i + 1) / urlsToScrape.length * 100).toFixed(1);
      
      console.log(`\n[${i + 1}/${urlsToScrape.length}] (${progressPct}%) Scraping: ${url}`);

      const product = await scrapeProductPage(page, url);

      if (product) {
        console.log(`  ✓ ${product.partNumber}: ${product.name.slice(0, 50)}... $${product.price}`);
        
        // Download image
        let imageFilename: string | null = null;
        if (product.imageUrl && !dryRun) {
          imageFilename = await downloadImage(product.imageUrl, product.partNumber);
          if (imageFilename) {
            console.log(`  📷 Downloaded: ${imageFilename}`);
          }
        }

        batchProducts.push({ product, imageFilename });
        successCount++;
        completedSet.add(url);
        progress.completedUrls.push(url);
      } else {
        console.log(`  ✗ Failed to extract product data`);
        failCount++;
        
        const existing = failedMap.get(url);
        if (existing) {
          existing.attempts++;
          if (existing.attempts >= MAX_RETRIES) {
            completedSet.add(url); // Give up after max retries
            progress.completedUrls.push(url);
          }
        } else {
          progress.failedUrls.push({ url, error: 'No data extracted', attempts: 1 });
        }
      }

      // Batch commit to database
      if (batchProducts.length >= BATCH_SIZE && !dryRun) {
        console.log(`\n[Scraper] Saving batch of ${batchProducts.length} products to database...`);
        for (const { product, imageFilename } of batchProducts) {
          await saveProductToDatabase(product, imageFilename);
        }
        batchProducts = [];
        saveProgress(progress);
        console.log('[Scraper] Batch saved, progress updated');
      }

      // Polite delay
      const delay = randomDelay();
      console.log(`  ⏳ Waiting ${(delay / 1000).toFixed(1)}s...`);
      await sleep(delay);
    }

    // Save remaining batch
    if (batchProducts.length > 0 && !dryRun) {
      console.log(`\n[Scraper] Saving final batch of ${batchProducts.length} products...`);
      for (const { product, imageFilename } of batchProducts) {
        await saveProductToDatabase(product, imageFilename);
      }
    }

    saveProgress(progress);

  } finally {
    await browser.close();
  }

  console.log('\n[Scraper] === SUMMARY ===');
  console.log(`  Successful: ${successCount}`);
  console.log(`  Failed: ${failCount}`);
  console.log(`  Total completed: ${progress.completedUrls.length} / ${allUrls.length}`);
  console.log(`  Remaining: ${allUrls.length - progress.completedUrls.length}`);
  
  const elapsed = (Date.now() - new Date(progress.startedAt).getTime()) / 1000 / 60;
  const rate = successCount / elapsed;
  const remaining = allUrls.length - progress.completedUrls.length;
  const etaMinutes = remaining / rate;
  
  console.log(`\n[Scraper] Rate: ${rate.toFixed(1)} products/min`);
  console.log(`[Scraper] ETA for remaining: ${(etaMinutes / 60).toFixed(1)} hours`);
}

main().catch(err => {
  console.error('[Scraper] Fatal error:', err);
  process.exit(1);
});
