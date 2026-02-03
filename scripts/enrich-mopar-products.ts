import puppeteer, { Browser, Page } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { db } from '../server/db';
import { products } from '../shared/schema';
import { eq, and, isNull, or } from 'drizzle-orm';
import * as fs from 'fs';

const stealth = StealthPlugin();
puppeteer.use(stealth);

const PROGRESS_FILE = './data/enrich-progress.json';
const RATE_LIMIT_DELAY = 2000; // 2 seconds between requests to avoid blocking
const BATCH_SIZE = 50;

interface Progress {
  totalProcessed: number;
  totalEnriched: number;
  totalNoImage: number;
  totalUnavailable: number;
  totalFailed: number;
  lastPartNumber: string | null;
  startedAt: string;
  lastUpdatedAt: string;
}

interface ProductData {
  price: number | null;
  imageUrl: string | null;
  description: string | null;
  available: boolean;
}

function loadProgress(): Progress {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return {
    totalProcessed: 0,
    totalEnriched: 0,
    totalNoImage: 0,
    totalUnavailable: 0,
    totalFailed: 0,
    lastPartNumber: null,
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString()
  };
}

function saveProgress(progress: Progress) {
  progress.lastUpdatedAt = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function setupBrowser(): Promise<Browser> {
  return await puppeteer.launch({
    headless: 'new' as any,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });
}

async function setupPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  });

  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
  
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  });

  return page;
}

async function dismissPopup(page: Page) {
  try {
    const closeButton = await page.$('button[aria-label="Close"], .close-modal, [class*="close"]');
    if (closeButton) {
      await closeButton.click();
      await new Promise(r => setTimeout(r, 500));
    }
  } catch (e) {
    // Popup might not exist, that's fine
  }
}

async function scrapeProductPage(page: Page, partNumber: string): Promise<ProductData | null> {
  const url = `https://www.moparsupply.com/oem-parts/mopar-${partNumber.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  
  try {
    const response = await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    if (!response || response.status() !== 200) {
      return null;
    }

    // Check for Cloudflare
    const content = await page.content();
    if (content.includes('Just a moment') || content.includes('challenge-platform')) {
      console.log(`  [CF] Cloudflare blocking ${partNumber}, waiting...`);
      await new Promise(r => setTimeout(r, 10000));
      const newContent = await page.content();
      if (newContent.includes('Just a moment')) {
        return null;
      }
    }

    await dismissPopup(page);
    await new Promise(r => setTimeout(r, 1000));

    const data = await page.evaluate(() => {
      // Check availability
      const unavailableEl = document.querySelector('[class*="unavailable"], [class*="Unavailable"]');
      const available = !unavailableEl || !unavailableEl.textContent?.includes('Unavailable');

      // Get price - look for actual price values
      let price: number | null = null;
      const priceText = document.body.innerHTML;
      
      // Try to find price in data attributes or structured data
      const priceMatch = priceText.match(/"price":\s*"?([\d.]+)"?/);
      if (priceMatch) {
        price = parseFloat(priceMatch[1]);
      }
      
      // Also check visible price elements
      const priceEls = document.querySelectorAll('[class*="price"], [class*="Price"]');
      for (let i = 0; i < priceEls.length; i++) {
        const text = priceEls[i].textContent || '';
        const match = text.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
        if (match) {
          const parsed = parseFloat(match[1].replace(',', ''));
          if (parsed > 0 && parsed < 100000) {
            price = parsed;
            break;
          }
        }
      }

      // Get image - look for actual product image, not placeholder
      let imageUrl: string | null = null;
      const imgs = document.querySelectorAll('img');
      for (let i = 0; i < imgs.length; i++) {
        const src = imgs[i].src || '';
        // Look for actual product images on CDN
        if (src.includes('rfrk.com') && !src.includes('mopar.png') && !src.includes('placeholder')) {
          imageUrl = src;
          break;
        }
      }
      
      // Check for "no image available"
      const noImageText = document.body.textContent || '';
      if (noImageText.toLowerCase().includes('no image available')) {
        imageUrl = null;
      }

      // Get description
      let description: string | null = null;
      const descEl = document.querySelector('[class*="description"], [data-testid*="description"]');
      if (descEl && descEl.textContent) {
        const text = descEl.textContent.trim();
        if (text.length > 3 && text !== 'Description:') {
          description = text.substring(0, 500);
        }
      }

      return { price, imageUrl, description, available };
    });

    return data;
  } catch (error: any) {
    console.log(`  [ERR] ${partNumber}: ${error.message}`);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 100;
  const resetProgress = args.includes('--reset');

  console.log('[Enrich] Starting MoparSupply product enrichment');
  console.log(`  Limit: ${limit} products`);
  console.log(`  Rate limit: ${RATE_LIMIT_DELAY}ms between requests\n`);

  let progress = resetProgress ? {
    totalProcessed: 0,
    totalEnriched: 0,
    totalNoImage: 0,
    totalUnavailable: 0,
    totalFailed: 0,
    lastPartNumber: null,
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString()
  } : loadProgress();

  // Get products that need enrichment (MoparSupply products with no price)
  const productsToEnrich = await db.select({
    id: products.id,
    partNumber: products.partNumber,
    partName: products.partName
  })
  .from(products)
  .where(
    and(
      eq(products.dataSource, 'moparsupply'),
      isNull(products.partRetail)
    )
  )
  .limit(limit);

  console.log(`[Enrich] Found ${productsToEnrich.length} products needing enrichment\n`);

  if (productsToEnrich.length === 0) {
    console.log('[Enrich] No products to enrich!');
    return;
  }

  const browser = await setupBrowser();
  const page = await setupPage(browser);

  // First visit homepage to establish session
  console.log('[Enrich] Establishing session on homepage...');
  await page.goto('https://www.moparsupply.com/', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));
  await dismissPopup(page);
  console.log('[Enrich] Session established\n');

  const startTime = Date.now();

  for (let i = 0; i < productsToEnrich.length; i++) {
    const product = productsToEnrich[i];
    const pct = ((i + 1) / productsToEnrich.length * 100).toFixed(1);
    
    process.stdout.write(`[${pct}%] ${product.partNumber} - `);
    
    const data = await scrapeProductPage(page, product.partNumber);
    
    if (data) {
      // Update product in database
      const updates: any = {};
      
      if (data.price && data.price > 0) {
        updates.partRetail = data.price.toString();
        updates.partMSRP = data.price.toString();
        console.log(`$${data.price}`);
        progress.totalEnriched++;
      } else if (!data.available) {
        console.log('unavailable');
        progress.totalUnavailable++;
      } else {
        console.log('no price');
      }
      
      if (data.imageUrl) {
        updates.imageUrl = data.imageUrl;
        updates.imageSource = 'moparsupply';
      } else {
        progress.totalNoImage++;
      }
      
      if (data.description) {
        updates.description = data.description;
      }
      
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date();
        await db.update(products)
          .set(updates)
          .where(eq(products.id, product.id));
      }
    } else {
      console.log('failed');
      progress.totalFailed++;
    }

    progress.totalProcessed++;
    progress.lastPartNumber = product.partNumber;

    // Save progress every 10 products
    if (i % 10 === 0) {
      saveProgress(progress);
    }

    // Rate limiting
    if (i < productsToEnrich.length - 1) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
    }
  }

  await browser.close();
  saveProgress(progress);

  const elapsed = (Date.now() - startTime) / 1000 / 60;
  console.log(`\n[Enrich] === COMPLETE ===`);
  console.log(`  Processed: ${progress.totalProcessed}`);
  console.log(`  Enriched (with price): ${progress.totalEnriched}`);
  console.log(`  No image available: ${progress.totalNoImage}`);
  console.log(`  Unavailable: ${progress.totalUnavailable}`);
  console.log(`  Failed: ${progress.totalFailed}`);
  console.log(`  Time: ${elapsed.toFixed(1)} minutes`);
  console.log(`  Rate: ${(progress.totalProcessed / elapsed).toFixed(0)} products/min`);
}

main().catch(console.error);
