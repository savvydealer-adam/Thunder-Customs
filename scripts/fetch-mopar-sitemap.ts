import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const SITEMAP_URL = 'https://www.moparsupply.com/sitemap.xml';

interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

/**
 * Fetch sitemap using Playwright to bypass Cloudflare protection
 */
export async function fetchSitemapWithPlaywright(): Promise<string> {
  console.log('[Sitemap] Launching browser...');
  
  const browser = await chromium.launch({
    headless: true,
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  const page = await context.newPage();
  
  try {
    console.log(`[Sitemap] Navigating to ${SITEMAP_URL}...`);
    
    await page.goto(SITEMAP_URL, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    
    // Wait for Cloudflare challenge to complete
    await page.waitForTimeout(5000);
    
    // Get the page content
    const content = await page.content();
    
    // Check if we got the actual sitemap or still on Cloudflare page
    if (content.includes('<?xml') || content.includes('<urlset') || content.includes('<sitemapindex')) {
      console.log('[Sitemap] Successfully retrieved sitemap XML');
      
      // Extract the XML content
      const xmlMatch = content.match(/<\?xml[\s\S]*$/);
      if (xmlMatch) {
        return xmlMatch[0];
      }
      
      // Try to get raw text if it's displayed as XML
      const text = await page.innerText('body');
      return text;
    }
    
    // If still on challenge page, try waiting longer
    console.log('[Sitemap] Waiting for Cloudflare challenge...');
    await page.waitForTimeout(10000);
    
    const retryContent = await page.content();
    if (retryContent.includes('<urlset') || retryContent.includes('<sitemapindex')) {
      return retryContent;
    }
    
    throw new Error('Could not bypass Cloudflare protection');
    
  } finally {
    await browser.close();
  }
}

/**
 * Parse sitemap XML and extract URLs
 */
export function parseSitemap(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  
  // Check if this is a sitemap index (contains links to other sitemaps)
  const sitemapMatches = xml.matchAll(/<sitemap>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/sitemap>/g);
  const sitemapUrls: string[] = [];
  for (const match of sitemapMatches) {
    sitemapUrls.push(match[1]);
  }
  
  if (sitemapUrls.length > 0) {
    console.log(`[Sitemap] Found sitemap index with ${sitemapUrls.length} child sitemaps`);
    return sitemapUrls.map(url => ({ loc: url }));
  }
  
  // Parse regular sitemap URLs
  const urlMatches = xml.matchAll(/<url>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/url>/g);
  for (const match of urlMatches) {
    const entry: SitemapEntry = { loc: match[1] };
    
    const lastmodMatch = match[0].match(/<lastmod>(.*?)<\/lastmod>/);
    if (lastmodMatch) entry.lastmod = lastmodMatch[1];
    
    const changefreqMatch = match[0].match(/<changefreq>(.*?)<\/changefreq>/);
    if (changefreqMatch) entry.changefreq = changefreqMatch[1];
    
    const priorityMatch = match[0].match(/<priority>(.*?)<\/priority>/);
    if (priorityMatch) entry.priority = priorityMatch[1];
    
    entries.push(entry);
  }
  
  return entries;
}

/**
 * Extract product part numbers from sitemap URLs
 */
export function extractPartNumbers(entries: SitemapEntry[]): string[] {
  const partNumbers: string[] = [];
  
  for (const entry of entries) {
    // Common patterns for product URLs:
    // /product/PARTNUMBER
    // /products/PARTNUMBER
    // /p/PARTNUMBER
    // /item/PARTNUMBER
    const productMatch = entry.loc.match(/\/(?:product|products|p|item)\/([A-Za-z0-9-]+)/i);
    if (productMatch) {
      partNumbers.push(productMatch[1].toUpperCase());
    }
  }
  
  return partNumbers;
}

/**
 * Scrape a category page to find individual product links
 */
async function scrapeProductsFromCategory(page: any, categoryUrl: string, debugAll = false): Promise<{products: string[], allLinks: string[]}> {
  try {
    await page.goto(categoryUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000); // Wait for JS to fully load
    
    // Find all links on the page
    const links = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a[href]');
      const hrefs: string[] = [];
      anchors.forEach((a: Element) => {
        const href = (a as HTMLAnchorElement).href;
        if (href && href.startsWith('http')) hrefs.push(href);
      });
      return hrefs;
    });
    
    // Also look for product data in the page content - some sites use data attributes
    const pageContent = await page.content();
    
    // Look for part number patterns in page HTML
    const partPatterns = pageContent.match(/[0-9]{8,10}[A-Z]{0,2}/g) || [];
    
    // Filter for product-like URLs
    const productLinks = links.filter((url: string) => {
      return url.includes('/p/') || 
             url.includes('/product/') ||
             url.includes('/sku/') ||
             /[0-9]{8,10}[A-Z]{0,2}/i.test(url);
    });
    
    return {
      products: [...new Set(productLinks)],
      allLinks: [...new Set(links)]
    };
  } catch (error) {
    console.error(`  Error scraping ${categoryUrl}: ${error}`);
    return { products: [], allLinks: [] };
  }
}

/**
 * Fetch a child sitemap by triggering browser download
 */
async function fetchChildSitemapWithDownload(page: any, url: string): Promise<string> {
  // Set up download handling
  const downloadPromise = page.waitForEvent('download');
  
  // Navigate to trigger the download
  await page.goto(url).catch(() => {});
  
  // Wait for download
  const download = await downloadPromise;
  
  // Save to temp file
  const tempPath = `/tmp/sitemap_${Date.now()}.xml.gz`;
  await download.saveAs(tempPath);
  
  // Read the file
  const buffer = fs.readFileSync(tempPath);
  
  // Decompress if gzipped
  if (url.endsWith('.gz')) {
    const { gunzipSync } = await import('zlib');
    const decompressed = gunzipSync(buffer);
    
    // Clean up
    fs.unlinkSync(tempPath);
    
    return decompressed.toString('utf-8');
  }
  
  fs.unlinkSync(tempPath);
  return buffer.toString('utf-8');
}

/**
 * Main function to fetch and analyze sitemap
 */
async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  
  try {
    console.log('[Sitemap] Starting sitemap fetch...');
    
    // Fetch main sitemap
    console.log(`[Sitemap] Navigating to ${SITEMAP_URL}...`);
    await page.goto(SITEMAP_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    
    const xml = await page.content();
    
    // Save the raw XML for inspection
    const outputPath = path.join(process.cwd(), 'data', 'mopar-sitemap.xml');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, xml);
    console.log(`[Sitemap] Saved raw XML to ${outputPath}`);
    
    // Parse the sitemap index
    const entries = parseSitemap(xml);
    console.log(`[Sitemap] Found ${entries.length} child sitemaps`);
    
    // Filter for product sitemaps
    // spp_mopar = single product page (actual products with part numbers)
    // ppicker = product picker (category/vehicle navigation pages)
    const sppSitemaps = entries.filter(e => e.loc.includes('spp_mopar'));
    const ppickerSitemaps = entries.filter(e => e.loc.includes('ppicker'));
    
    console.log(`[Sitemap] Found ${sppSitemaps.length} SPP (product) sitemaps`);
    console.log(`[Sitemap] Found ${ppickerSitemaps.length} ppicker (category) sitemaps`);
    
    // Use SPP sitemaps - these should contain actual product URLs with part numbers
    const productSitemaps = sppSitemaps;
    
    // Fetch all child sitemaps using browser downloads
    const allProductUrls: SitemapEntry[] = [];
    
    for (const sitemap of productSitemaps) {
      try {
        console.log(`[Sitemap] Fetching ${sitemap.loc}...`);
        const childXml = await fetchChildSitemapWithDownload(page, sitemap.loc);
        const childEntries = parseSitemap(childXml);
        allProductUrls.push(...childEntries);
        console.log(`  -> Found ${childEntries.length} URLs`);
      } catch (error) {
        console.error(`  -> Error: ${error}`);
      }
    }
    
    console.log(`\n[Sitemap] Total category URLs: ${allProductUrls.length}`);
    
    // Show sample product URLs
    console.log('\n[Sitemap] Sample product URLs:');
    allProductUrls.slice(0, 10).forEach(entry => {
      console.log(`  - ${entry.loc}`);
    });
    
    // Extract part numbers from product URLs
    // MoparSupply URL pattern: /oem-parts/mopar-{name}-{partnumber}
    // Part numbers: alphanumeric, 7-12 chars (e.g., 1000a923, 04892320AC, 68292683AA)
    const partNumbers: string[] = [];
    for (const entry of allProductUrls) {
      const url = entry.loc;
      // Extract the last segment after the final dash
      // Pattern: mopar-{description}-{PARTNUMBER}
      const match = url.match(/-([0-9a-z]{7,12})$/i);
      if (match) {
        partNumbers.push(match[1].toUpperCase());
      }
    }
    
    const uniquePartNumbers = [...new Set(partNumbers)];
    console.log(`\n[Sitemap] Extracted ${uniquePartNumbers.length} unique part numbers from ${allProductUrls.length} URLs`);
    
    if (uniquePartNumbers.length > 0) {
      console.log('\n[Sitemap] Sample part numbers:');
      uniquePartNumbers.slice(0, 20).forEach(pn => console.log(`  - ${pn}`));
    }
    
    // Save results
    const urlsPath = path.join(process.cwd(), 'data', 'mopar-product-urls.json');
    fs.writeFileSync(urlsPath, JSON.stringify(allProductUrls.map(e => e.loc), null, 2));
    console.log(`\n[Sitemap] Saved ${allProductUrls.length} product URLs to ${urlsPath}`);
    
    const pnPath = path.join(process.cwd(), 'data', 'mopar-part-numbers.json');
    fs.writeFileSync(pnPath, JSON.stringify(uniquePartNumbers, null, 2));
    console.log(`[Sitemap] Saved ${uniquePartNumbers.length} part numbers to ${pnPath}`);
    
  } catch (error) {
    console.error('[Sitemap] Error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

// Run directly
main();
