/**
 * Sync Mopar products using MoparSupply sitemap as a quasi-API
 * Compares sitemap part numbers against database to detect:
 * - New products (in sitemap but not in DB)
 * - Discontinued products (in DB but not in sitemap)
 */

import fs from 'fs';
import path from 'path';
import { db } from '../server/db';
import { products } from '../shared/schema';
import { eq, like, inArray, sql } from 'drizzle-orm';

interface SyncResult {
  newPartNumbers: string[];
  discontinuedPartNumbers: string[];
  matchedCount: number;
  sitemapCount: number;
  dbCount: number;
}

async function loadSitemapPartNumbers(): Promise<Set<string>> {
  const pnPath = path.join(process.cwd(), 'data', 'mopar-part-numbers.json');
  
  if (!fs.existsSync(pnPath)) {
    throw new Error(`Part numbers file not found: ${pnPath}\nRun fetch-mopar-sitemap.ts first`);
  }
  
  const partNumbers: string[] = JSON.parse(fs.readFileSync(pnPath, 'utf-8'));
  console.log(`[Sync] Loaded ${partNumbers.length} part numbers from sitemap`);
  
  return new Set(partNumbers.map(pn => pn.toUpperCase()));
}

async function getMoparDbPartNumbers(): Promise<Set<string>> {
  // Get all Mopar-related products from DB
  // Manufacturers: Mopar, Dodge, Jeep, RAM, Chrysler, Fiat
  const moparManufacturers = ['Mopar', 'Dodge', 'Jeep', 'RAM', 'Chrysler', 'Fiat'];
  
  const dbProducts = await db
    .select({ partNumber: products.partNumber, manufacturer: products.manufacturer })
    .from(products)
    .where(inArray(products.manufacturer, moparManufacturers));
  
  console.log(`[Sync] Found ${dbProducts.length} Mopar products in database`);
  
  return new Set(dbProducts.map(p => p.partNumber.toUpperCase()));
}

async function syncMoparProducts(): Promise<SyncResult> {
  console.log('[Sync] Starting Mopar product sync...\n');
  
  // Load sitemap part numbers
  const sitemapPartNumbers = await loadSitemapPartNumbers();
  
  // Get database part numbers
  const dbPartNumbers = await getMoparDbPartNumbers();
  
  // Find differences
  const newPartNumbers: string[] = [];
  const discontinuedPartNumbers: string[] = [];
  let matchedCount = 0;
  
  // Check sitemap for new products not in DB
  for (const pn of sitemapPartNumbers) {
    if (dbPartNumbers.has(pn)) {
      matchedCount++;
    } else {
      newPartNumbers.push(pn);
    }
  }
  
  // Check DB for discontinued products not in sitemap
  for (const pn of dbPartNumbers) {
    if (!sitemapPartNumbers.has(pn)) {
      discontinuedPartNumbers.push(pn);
    }
  }
  
  const result: SyncResult = {
    newPartNumbers,
    discontinuedPartNumbers,
    matchedCount,
    sitemapCount: sitemapPartNumbers.size,
    dbCount: dbPartNumbers.size
  };
  
  // Print summary
  console.log('\n[Sync] === SYNC RESULTS ===');
  console.log(`Sitemap part numbers: ${result.sitemapCount}`);
  console.log(`Database part numbers: ${result.dbCount}`);
  console.log(`Matched: ${result.matchedCount}`);
  console.log(`New in sitemap (not in DB): ${result.newPartNumbers.length}`);
  console.log(`Discontinued (in DB, not in sitemap): ${result.discontinuedPartNumbers.length}`);
  
  // Save results
  const resultsDir = path.join(process.cwd(), 'data', 'sync-results');
  fs.mkdirSync(resultsDir, { recursive: true });
  
  const timestamp = new Date().toISOString().split('T')[0];
  
  if (result.newPartNumbers.length > 0) {
    const newPath = path.join(resultsDir, `new-products-${timestamp}.json`);
    fs.writeFileSync(newPath, JSON.stringify(result.newPartNumbers.slice(0, 1000), null, 2));
    console.log(`\n[Sync] Saved ${Math.min(result.newPartNumbers.length, 1000)} new part numbers to ${newPath}`);
    
    console.log('\nSample new part numbers:');
    result.newPartNumbers.slice(0, 20).forEach(pn => console.log(`  + ${pn}`));
  }
  
  if (result.discontinuedPartNumbers.length > 0) {
    const discPath = path.join(resultsDir, `discontinued-${timestamp}.json`);
    fs.writeFileSync(discPath, JSON.stringify(result.discontinuedPartNumbers, null, 2));
    console.log(`\n[Sync] Saved ${result.discontinuedPartNumbers.length} discontinued part numbers to ${discPath}`);
    
    console.log('\nSample discontinued part numbers:');
    result.discontinuedPartNumbers.slice(0, 20).forEach(pn => console.log(`  - ${pn}`));
  }
  
  return result;
}

// Run
syncMoparProducts()
  .then(() => {
    console.log('\n[Sync] Complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('[Sync] Error:', err);
    process.exit(1);
  });
