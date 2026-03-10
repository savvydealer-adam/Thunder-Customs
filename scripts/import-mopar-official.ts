/**
 * Node bridge: reads JSON exports from the Python mopar-scraper pipeline
 * and upserts products into the ThunderCustoms PostgreSQL database via Drizzle.
 *
 * Usage:
 *   npx tsx scripts/import-mopar-official.ts --type=full_catalog
 *   npx tsx scripts/import-mopar-official.ts --type=incremental
 *   npx tsx scripts/import-mopar-official.ts --type=enrichment
 *   npx tsx scripts/import-mopar-official.ts --dry-run
 *   npx tsx scripts/import-mopar-official.ts --limit=100
 */

import fs from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { db } from '../server/db';
import { products } from '../shared/schema';

const EXPORTS_DIR = 'C:/Users/adam/mopar-scraper/data/exports';
const ARCHIVE_DIR = 'C:/Users/adam/mopar-scraper/data/exports/archive';
const BATCH_SIZE = 500;

interface ExportProduct {
  partNumber: string;
  partName: string;
  manufacturer: string;
  category: string;
  description: string | null;
  price: string | null;
  imageUrl: string | null;
  imageSource: string | null;
  dataSource: string;
  isHidden: boolean;
}

interface ExportPayload {
  export_type: 'full_catalog' | 'incremental' | 'enrichment';
  exported_at: string;
  products: ExportProduct[];
  removed_part_numbers: string[];
  total_count: number;
}

function findExportFiles(typeFilter?: string): string[] {
  if (!fs.existsSync(EXPORTS_DIR)) {
    return [];
  }

  let files = fs.readdirSync(EXPORTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort(); // Process oldest first

  if (typeFilter) {
    files = files.filter(f => f.startsWith(typeFilter));
  }

  return files.map(f => path.join(EXPORTS_DIR, f));
}

function archiveFile(filePath: string): void {
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }
  const filename = path.basename(filePath);
  fs.renameSync(filePath, path.join(ARCHIVE_DIR, filename));
}

async function importFullCatalog(payload: ExportPayload, dryRun: boolean, limit: number | null): Promise<{ added: number; skipped: number; errors: number }> {
  let added = 0;
  let skipped = 0;
  let errors = 0;

  const items = limit ? payload.products.slice(0, limit) : payload.products;
  console.log(`[Mopar Official] Importing ${items.length} products (full catalog)...`);

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const insertValues = batch.map(p => ({
      partNumber: p.partNumber,
      partName: p.partName,
      manufacturer: p.manufacturer || 'Mopar',
      category: p.category || 'OEM Parts',
      description: p.description || `Mopar OEM Part - ${p.partName}`,
      dataSource: p.dataSource || 'mopar_official',
      imageSource: p.imageSource || 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    if (dryRun) {
      added += batch.length;
      continue;
    }

    try {
      const result = await db.insert(products)
        .values(insertValues)
        .onConflictDoNothing({ target: products.partNumber });

      const rowCount = (result as any).rowCount || 0;
      added += rowCount;
      skipped += batch.length - rowCount;
    } catch (e: any) {
      console.error(`  Batch error: ${e.message}`);
      // Fall back to individual inserts
      for (const val of insertValues) {
        try {
          const result = await db.insert(products)
            .values(val)
            .onConflictDoNothing({ target: products.partNumber });
          if ((result as any).rowCount > 0) added++;
          else skipped++;
        } catch {
          errors++;
        }
      }
    }

    const pct = (((i + batch.length) / items.length) * 100).toFixed(1);
    console.log(`  [${pct}%] +${added} added, ${skipped} skipped`);
  }

  return { added, skipped, errors };
}

async function importEnrichment(payload: ExportPayload, dryRun: boolean, limit: number | null): Promise<{ updated: number; skipped: number; errors: number }> {
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  const items = limit ? payload.products.slice(0, limit) : payload.products;
  console.log(`[Mopar Official] Enriching ${items.length} products...`);

  for (const p of items) {
    if (dryRun) {
      updated++;
      continue;
    }

    try {
      // Use the manuallyEdited CASE logic from storage.ts
      const result = await db.update(products)
        .set({
          // Price fields: always overwrite (not manually editable)
          ...(p.price ? {
            partMSRP: p.price,
            partRetail: p.price,
          } : {}),

          // Image: protected by manuallyEdited
          ...(p.imageUrl ? {
            imageUrl: sql`CASE WHEN ${products.manuallyEdited} THEN ${products.imageUrl} ELSE ${p.imageUrl} END`,
            imageSource: p.imageSource || 'mopar_official',
            imageAttemptedAt: new Date(),
          } : {}),

          // Description: protected by manuallyEdited
          ...(p.description ? {
            description: sql`CASE WHEN ${products.manuallyEdited} THEN ${products.description} ELSE ${p.description} END`,
          } : {}),

          // Hidden status: protected by manuallyEdited
          ...(p.isHidden !== undefined ? {
            isHidden: sql`CASE WHEN ${products.manuallyEdited} THEN ${products.isHidden} ELSE ${p.isHidden} END`,
          } : {}),

          updatedAt: new Date(),
        })
        .where(sql`${products.partNumber} = ${p.partNumber}`);

      const rowCount = (result as any).rowCount || 0;
      if (rowCount > 0) updated++;
      else skipped++;
    } catch (e: any) {
      errors++;
      if (errors <= 5) {
        console.error(`  Error updating ${p.partNumber}: ${e.message}`);
      }
    }
  }

  return { updated, skipped, errors };
}

async function importIncremental(payload: ExportPayload, dryRun: boolean, limit: number | null): Promise<{ added: number; removed: number; skipped: number; errors: number }> {
  // Import new products
  const catalogResult = await importFullCatalog(payload, dryRun, limit);

  // Mark removed products as hidden
  let removed = 0;
  if (payload.removed_part_numbers.length > 0) {
    console.log(`[Mopar Official] Marking ${payload.removed_part_numbers.length} products as hidden...`);

    for (const partNumber of payload.removed_part_numbers) {
      if (dryRun) {
        removed++;
        continue;
      }

      try {
        await db.update(products)
          .set({
            isHidden: sql`CASE WHEN ${products.manuallyEdited} THEN ${products.isHidden} ELSE true END`,
            updatedAt: new Date(),
          })
          .where(sql`${products.partNumber} = ${partNumber}`);
        removed++;
      } catch {
        // Product might not exist in DB yet
      }
    }
  }

  return {
    added: catalogResult.added,
    removed,
    skipped: catalogResult.skipped,
    errors: catalogResult.errors,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const typeFilter = args.find(a => a.startsWith('--type='))?.split('=')[1];
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
  const dryRun = args.includes('--dry-run');

  console.log('[Mopar Official] Import bridge starting');
  console.log(`  Type filter: ${typeFilter || 'all'}`);
  console.log(`  Limit: ${limit || 'none'}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log('');

  const files = findExportFiles(typeFilter);
  if (files.length === 0) {
    console.log('[Mopar Official] No export files found.');
    return;
  }

  console.log(`[Mopar Official] Found ${files.length} export file(s)`);

  for (const filePath of files) {
    const filename = path.basename(filePath);
    console.log(`\n[Mopar Official] Processing: ${filename}`);

    const raw = fs.readFileSync(filePath, 'utf-8');
    const payload: ExportPayload = JSON.parse(raw);

    console.log(`  Type: ${payload.export_type}, Products: ${payload.total_count}`);

    let result: any;

    switch (payload.export_type) {
      case 'full_catalog':
        result = await importFullCatalog(payload, dryRun, limit);
        console.log(`  Result: +${result.added} added, ${result.skipped} skipped, ${result.errors} errors`);
        break;

      case 'incremental':
        result = await importIncremental(payload, dryRun, limit);
        console.log(`  Result: +${result.added} added, -${result.removed} removed, ${result.skipped} skipped, ${result.errors} errors`);
        break;

      case 'enrichment':
        result = await importEnrichment(payload, dryRun, limit);
        console.log(`  Result: ${result.updated} updated, ${result.skipped} skipped, ${result.errors} errors`);
        break;

      default:
        console.log(`  Unknown export type: ${payload.export_type}, skipping`);
        continue;
    }

    // Archive processed file
    if (!dryRun) {
      archiveFile(filePath);
      console.log(`  Archived: ${filename}`);
    }
  }

  console.log('\n[Mopar Official] Import complete.');
}

main().catch(console.error);
