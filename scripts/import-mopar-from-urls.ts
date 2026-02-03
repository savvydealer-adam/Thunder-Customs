import fs from 'fs';
import path from 'path';
import { db } from '../server/db';
import { products } from '../shared/schema';

const URLS_FILE = path.join(process.cwd(), 'data', 'mopar-product-urls.json');
const PROGRESS_FILE = path.join(process.cwd(), 'data', 'mopar-import-progress.json');
const BATCH_SIZE = 500;

interface ImportProgress {
  lastProcessedIndex: number;
  totalImported: number;
  totalSkipped: number;
  totalFailed: number;
  startedAt: string;
  lastUpdatedAt: string;
}

interface ParsedProduct {
  partNumber: string;
  name: string;
  slug: string;
  url: string;
}

function parseUrlToProduct(url: string): ParsedProduct | null {
  // URL format: https://www.moparsupply.com/oem-parts/mopar-{name-slug}-{partnumber}
  const match = url.match(/\/oem-parts\/mopar-(.+)-([a-z0-9]{5,12})$/i);
  if (!match) return null;

  const [, nameSlug, partNumber] = match;
  
  // Convert slug to readable name: "liquid-gasket" -> "Liquid Gasket"
  const name = nameSlug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return {
    partNumber: partNumber.toUpperCase(),
    name,
    slug: nameSlug,
    url
  };
}

function loadProgress(): ImportProgress {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.log('Could not load progress file, starting fresh');
  }
  return {
    lastProcessedIndex: -1,
    totalImported: 0,
    totalSkipped: 0,
    totalFailed: 0,
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString()
  };
}

function saveProgress(progress: ImportProgress): void {
  progress.lastUpdatedAt = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function importBatch(parsedProducts: ParsedProduct[]): Promise<{ imported: number; skipped: number; failed: number }> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  // Batch insert with ON CONFLICT DO NOTHING
  const insertValues = parsedProducts.map(p => ({
    partNumber: p.partNumber,
    partName: p.name,
    manufacturer: 'Mopar',
    category: 'OEM Parts',
    description: `Mopar OEM Part - ${p.name}`,
    dataSource: 'moparsupply',
    imageSource: 'pending',
    createdAt: new Date(),
    updatedAt: new Date()
  }));

  try {
    const result = await db.insert(products)
      .values(insertValues)
      .onConflictDoNothing({ target: products.partNumber });
    
    imported = (result as any).rowCount || 0;
    skipped = parsedProducts.length - imported;
  } catch (e: any) {
    // If batch fails, fall back to individual inserts
    console.log(`  Batch failed (${e.message}), trying individual...`);
    for (const product of parsedProducts) {
      try {
        const result = await db.insert(products).values({
          partNumber: product.partNumber,
          partName: product.name,
          manufacturer: 'Mopar',
          category: 'OEM Parts',
          description: `Mopar OEM Part - ${product.name}`,
          dataSource: 'moparsupply',
          imageSource: 'pending',
          createdAt: new Date(),
          updatedAt: new Date()
        }).onConflictDoNothing({ target: products.partNumber });
        
        if ((result as any).rowCount > 0) {
          imported++;
        } else {
          skipped++;
        }
      } catch (err: any) {
        failed++;
      }
    }
  }

  return { imported, skipped, failed };
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
  const dryRun = args.includes('--dry-run');
  const reset = args.includes('--reset');

  console.log('[Import] Starting MoparSupply URL-based import');
  console.log(`  Limit: ${limit || 'none'}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log(`  Reset progress: ${reset}`);
  console.log('');

  // Load URLs
  if (!fs.existsSync(URLS_FILE)) {
    console.error('Error: URL file not found. Run fetch-mopar-sitemap.ts first.');
    process.exit(1);
  }

  const urls: string[] = JSON.parse(fs.readFileSync(URLS_FILE, 'utf-8'));
  console.log(`[Import] Loaded ${urls.length.toLocaleString()} URLs`);

  // Load or reset progress
  let progress = reset ? {
    lastProcessedIndex: -1,
    totalImported: 0,
    totalSkipped: 0,
    totalFailed: 0,
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString()
  } : loadProgress();

  const startIndex = progress.lastProcessedIndex + 1;
  const endIndex = limit ? Math.min(startIndex + limit, urls.length) : urls.length;
  const urlsToProcess = urls.slice(startIndex, endIndex);

  console.log(`[Import] Processing URLs ${startIndex + 1} to ${endIndex} (${urlsToProcess.length.toLocaleString()} items)`);
  if (progress.totalImported > 0) {
    console.log(`  Resuming from previous run: ${progress.totalImported.toLocaleString()} already imported`);
  }
  console.log('');

  if (dryRun) {
    // Just parse and show samples
    console.log('[Dry Run] Sample parsed products:');
    const samples = urlsToProcess.slice(0, 10).map(parseUrlToProduct).filter(Boolean);
    samples.forEach(p => {
      console.log(`  ${p!.partNumber}: "${p!.name}"`);
    });
    
    const allParsed = urlsToProcess.map(parseUrlToProduct);
    const validCount = allParsed.filter(Boolean).length;
    console.log(`\n[Dry Run] ${validCount.toLocaleString()} / ${urlsToProcess.length.toLocaleString()} URLs parsed successfully`);
    return;
  }

  // Process in batches
  const startTime = Date.now();
  let batchNum = 0;
  
  for (let i = 0; i < urlsToProcess.length; i += BATCH_SIZE) {
    batchNum++;
    const batchUrls = urlsToProcess.slice(i, i + BATCH_SIZE);
    const batchParsed = batchUrls
      .map(parseUrlToProduct)
      .filter((p): p is ParsedProduct => p !== null);

    if (batchParsed.length === 0) continue;

    const result = await importBatch(batchParsed);
    
    progress.totalImported += result.imported;
    progress.totalSkipped += result.skipped;
    progress.totalFailed += result.failed;
    progress.lastProcessedIndex = startIndex + i + batchUrls.length - 1;
    
    // Calculate progress
    const totalProcessed = i + batchUrls.length;
    const percent = ((totalProcessed / urlsToProcess.length) * 100).toFixed(1);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = totalProcessed / elapsed;
    const remaining = (urlsToProcess.length - totalProcessed) / rate;
    
    console.log(
      `[Batch ${batchNum}] ${percent}% | ` +
      `+${result.imported} imported, ${result.skipped} skipped | ` +
      `Total: ${progress.totalImported.toLocaleString()} | ` +
      `ETA: ${Math.ceil(remaining / 60)}min`
    );
    
    // Save progress every batch
    saveProgress(progress);
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log('');
  console.log('[Import] === COMPLETE ===');
  console.log(`  Total imported: ${progress.totalImported.toLocaleString()}`);
  console.log(`  Total skipped (duplicates): ${progress.totalSkipped.toLocaleString()}`);
  console.log(`  Total failed: ${progress.totalFailed.toLocaleString()}`);
  console.log(`  Time: ${elapsed} minutes`);
  console.log(`  Rate: ${(urlsToProcess.length / parseFloat(elapsed)).toFixed(0)} products/min`);
}

main().catch(console.error);
