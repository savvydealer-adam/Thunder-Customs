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
    
    // Filter for product sitemaps (ppicker = product picker)
    const productSitemaps = entries.filter(e => 
      e.loc.includes('ppicker') || e.loc.includes('product')
    );
    console.log(`[Sitemap] Found ${productSitemaps.length} product sitemaps`);
    
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
    
    console.log(`\n[Sitemap] Total product URLs: ${allProductUrls.length}`);
    
    // Show sample URLs
    console.log('\n[Sitemap] Sample product URLs:');
    allProductUrls.slice(0, 10).forEach(entry => {
      console.log(`  - ${entry.loc}`);
    });
    
    // Extract part numbers from URLs
    const partNumbers: string[] = [];
    for (const entry of allProductUrls) {
      // Pattern: /genuine-mopar-{partname}-{partnumber}.html
      // or /mopar-{partnumber}.html
      const match = entry.loc.match(/([A-Z0-9]{8,}[A-Z]{2})(?:\.html)?$/i);
      if (match) {
        partNumbers.push(match[1].toUpperCase());
      }
    }
    
    console.log(`\n[Sitemap] Extracted ${partNumbers.length} part numbers`);
    
    if (partNumbers.length > 0) {
      console.log('\n[Sitemap] Sample part numbers:');
      partNumbers.slice(0, 20).forEach(pn => {
        console.log(`  - ${pn}`);
      });
      
      // Save part numbers to file
      const pnPath = path.join(process.cwd(), 'data', 'mopar-part-numbers.json');
      fs.writeFileSync(pnPath, JSON.stringify(partNumbers, null, 2));
      console.log(`\n[Sitemap] Saved ${partNumbers.length} part numbers to ${pnPath}`);
      
      // Save all URLs for reference
      const urlsPath = path.join(process.cwd(), 'data', 'mopar-product-urls.json');
      fs.writeFileSync(urlsPath, JSON.stringify(allProductUrls.map(e => e.loc), null, 2));
      console.log(`[Sitemap] Saved ${allProductUrls.length} URLs to ${urlsPath}`);
    }
    
  } catch (error) {
    console.error('[Sitemap] Error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

// Run directly
main();
