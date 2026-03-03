/**
 * Rough Country Feed Import Script
 *
 * Fetches product data from Rough Country's XLSX feed and imports into database.
 * Can be run directly via `npx tsx scripts/import-rough-country.ts`
 * or via the admin API endpoint.
 *
 * Feed URL: https://feeds.roughcountry.com/jobber_pc1.xlsx
 * ~7,910 products, ~14MB file
 */

import ExcelJS from "exceljs";
import { db } from "../server/db";
import { products } from "@shared/schema";
import { eq, sql, inArray } from "drizzle-orm";

const FEED_URL = "https://feeds.roughcountry.com/jobber_pc1.xlsx";
const DATA_SOURCE = "rough_country";

interface RoughCountryRow {
  sku?: string;
  title?: string;
  manufacturer?: string;
  category?: string;
  description?: string;
  price?: string | number;
  cost?: string | number;
  discount?: string | number;
  image_1?: string;
  image_2?: string;
  image_3?: string;
  image_4?: string;
  NV_Stock?: string | number;
  TN_Stock?: string | number;
  features?: string;
  notes?: string;
  link?: string;
  [key: string]: unknown;
}

export interface ImportStats {
  total: number;
  added: number;
  updated: number;
  skipped: number;
  errors: number;
  errorMessages: string[];
}

interface ImportOptions {
  dryRun?: boolean;
  limit?: number;
  onProgress?: (current: number, total: number) => void;
}

/**
 * Parse fitment from product title
 */
function parseFitmentFromTitle(title: string | undefined): {
  make: string | null;
  model: string | null;
  years: string | null;
} {
  if (!title) return { make: null, model: null, years: null };

  const makes = [
    "Chevrolet", "Chevy", "Ford", "Dodge", "Ram", "GMC", "Jeep",
    "Toyota", "Nissan", "Honda", "Subaru", "Lexus", "Cadillac",
    "Buick", "Lincoln", "Hummer", "Polaris", "Can-Am", "Kawasaki", "Yamaha",
  ];

  let years: string | null = null;
  const yearParenMatch = title.match(/\((\d{2,4}[-+]?\d{0,4})\)/);
  if (yearParenMatch) {
    const yearStr = yearParenMatch[1];
    if (yearStr.match(/^\d{2}[-+]?\d{0,2}$/)) {
      const parts = yearStr.split(/[-+]/);
      years = parts.map(p => p ? `20${p}` : "").join(yearStr.includes("+") ? "+" : "-");
    } else {
      years = yearStr;
    }
  }

  let make: string | null = null;
  let model: string | null = null;

  for (const m of makes) {
    const makeRegex = new RegExp(`\\b${m}\\b`, "i");
    if (makeRegex.test(title)) {
      make = m === "Chevy" ? "Chevrolet" : m;
      const makeMatch = title.match(new RegExp(`${m}[/\\w]*\\s+([\\w\\s-]+?)(?:\\s*\\(|\\s*\\||$)`, "i"));
      if (makeMatch) {
        model = makeMatch[1].trim().replace(/\s+(2WD|4WD|4x4)$/i, "");
      }
      break;
    }
  }

  if (title.match(/Chevy\/GMC|GMC\/Chevy/i)) {
    make = "Chevrolet/GMC";
  }

  return { make, model, years };
}

/**
 * Calculate total stock from NV and TN warehouses
 */
function calculateStock(nvStock: unknown, tnStock: unknown): number {
  const nv = typeof nvStock === "number" ? nvStock : parseInt(String(nvStock || "0"), 10);
  const tn = typeof tnStock === "number" ? tnStock : parseInt(String(tnStock || "0"), 10);
  return (isNaN(nv) ? 0 : nv) + (isNaN(tn) ? 0 : tn);
}

/**
 * Normalize price value to string for decimal fields
 */
function normalizePrice(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return value.toFixed(2);
  const str = String(value).replace(/[$,]/g, "").trim();
  const num = parseFloat(str);
  return isNaN(num) ? null : num.toFixed(2);
}

const MOJIBAKE_REPLACEMENTS: [string, string][] = [
  ["\u0393\u00c7\u00d6", "'"],
  ["\u0393\u00c7\u00bf", "'"],
  ["\u0393\u00c7\u00a3", '"'],
  ["\u0393\u00c7\u00a5", '"'],
  ["\u0393\u00c7\u00f4", "\u2014"],
  ["\u0393\u00c7\u00f6", "\u2013"],
  ["\u0393\u00c7\u00bb", "\u2022"],
  ["\u0393\u00c7\u00c9", "..."],
  ["\u0393\u00c7\u00ef", ""],
  ["\u0393\u00e4\u00f3", "\u2122"],
  ["\u0393\u00e0\u00a5", "\u2265"],
  ["\u00c2\u00a0", " "],
  ["\u00c2\u00b0", "\u00b0"],
  ["\u00c2\u00be", "\u00be"],
  ["\u00c2\u00bc", "\u00bc"],
  ["\u00c2\u00ba", "\u00ba"],
  ["\u00c2\u00ae", "\u00ae"],
  ["\u00c2\u00bd", "\u00bd"],
];

function cleanMojibake(text: string): string {
  let result = text;
  for (const [bad, good] of MOJIBAKE_REPLACEMENTS) {
    result = result.replaceAll(bad, good);
  }
  return result;
}

/**
 * Extract primitive value from ExcelJS cell value
 * ExcelJS can return objects for hyperlinks, rich text, etc.
 */
function extractCellValue(value: ExcelJS.CellValue): string | number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'string') return cleanMojibake(value);
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  // Handle hyperlink objects
  if (typeof value === 'object' && 'text' in value) {
    return String((value as { text: string }).text || '');
  }
  // Handle rich text
  if (typeof value === 'object' && 'richText' in value) {
    const richText = (value as { richText: Array<{ text: string }> }).richText;
    return richText.map(rt => rt.text).join('');
  }
  // Handle formula results
  if (typeof value === 'object' && 'result' in value) {
    return extractCellValue((value as { result: ExcelJS.CellValue }).result);
  }
  // Fallback - try to get a string representation
  return String(value);
}

/**
 * Fetch and parse the Rough Country XLSX feed
 */
export async function fetchRoughCountryFeed(): Promise<RoughCountryRow[]> {
  console.log(`[RC Import] Fetching feed from ${FEED_URL}...`);

  const response = await fetch(FEED_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch feed: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  console.log(`[RC Import] Downloaded ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(arrayBuffer));
  
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("No worksheet found in workbook");
  }

  // Get headers from first row
  const headers: string[] = [];
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    const val = extractCellValue(cell.value);
    headers[colNumber - 1] = String(val || '').toLowerCase().trim();
  });

  // Parse rows into objects
  const rows: RoughCountryRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header row
    
    const rowData: RoughCountryRow = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (header) {
        rowData[header] = extractCellValue(cell.value) as any;
      }
    });
    rows.push(rowData);
  });

  console.log(`[RC Import] Parsed ${rows.length} rows from feed`);
  return rows;
}

/**
 * Import products from Rough Country feed
 */
export async function importRoughCountryFeed(
  options: ImportOptions = {}
): Promise<ImportStats> {
  const { dryRun = false, limit, onProgress } = options;

  const stats: ImportStats = {
    total: 0,
    added: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    errorMessages: [],
  };

  try {
    const rows = await fetchRoughCountryFeed();
    let processRows = rows;

    if (limit && limit > 0) {
      processRows = rows.slice(0, limit);
      console.log(`[RC Import] Limited to ${limit} rows for processing`);
    }

    stats.total = processRows.length;
    const batchSize = 100;

    for (let i = 0; i < processRows.length; i += batchSize) {
      const batch = processRows.slice(i, i + batchSize);
      // Use Map to deduplicate by partNumber within batch (last one wins)
      const productMap = new Map<string, any>();

      for (const row of batch) {
        try {
          if (!row.sku || !String(row.sku).trim()) {
            stats.skipped++;
            continue;
          }

          const partNumber = String(row.sku).trim();
          const title = row.title ? String(row.title).trim() : partNumber;
          const { make, model } = parseFitmentFromTitle(title);

          // Build description with features
          let description = row.description ? String(row.description).trim() : "";
          if (row.features) {
            description += (description ? "\n\n" : "") + "Features:\n" + String(row.features).trim();
          }

          productMap.set(partNumber, {
            partNumber,
            partName: title,
            manufacturer: row.manufacturer ? String(row.manufacturer).trim() : "Rough Country",
            category: row.category ? String(row.category).trim() : "Accessories",
            vehicleMake: make,
            vehicleModel: model,
            description: description || null,
            price: normalizePrice(row.price),
            cost: normalizePrice(row.cost),
            partCost: normalizePrice(row.cost),
            partMSRP: normalizePrice(row.price),
            imageUrl: row.image_1 ? String(row.image_1).trim() : null,
            imageSource: row.image_1 ? DATA_SOURCE : null,
            stockQuantity: calculateStock(row.NV_Stock, row.TN_Stock),
            dataSource: DATA_SOURCE,
            isHidden: false,
          });
        } catch (rowError) {
          stats.errors++;
          const errorMsg = `SKU ${row.sku}: ${rowError instanceof Error ? rowError.message : String(rowError)}`;
          if (stats.errorMessages.length < 20) {
            stats.errorMessages.push(errorMsg);
          }
        }
      }

      // Convert Map to array (deduplicated)
      const productBatch = Array.from(productMap.values());

      if (productBatch.length > 0) {
        if (dryRun) {
          // Check which would be adds vs updates
          for (const p of productBatch) {
            const existing = await db
              .select({ id: products.id })
              .from(products)
              .where(eq(products.partNumber, p.partNumber))
              .limit(1);
            if (existing.length > 0) {
              stats.updated++;
            } else {
              stats.added++;
            }
          }
        } else {
          const existingParts = await db
            .select({ partNumber: products.partNumber })
            .from(products)
            .where(inArray(products.partNumber, productBatch.map(p => p.partNumber)));
          const existingSet = new Set(existingParts.map(p => p.partNumber));

          await db
            .insert(products)
            .values(productBatch)
            .onConflictDoUpdate({
              target: products.partNumber,
              set: {
                partName: sql`excluded.part_name`,
                manufacturer: sql`excluded.manufacturer`,
                category: sql`excluded.category`,
                vehicleMake: sql`excluded.vehicle_make`,
                vehicleModel: sql`excluded.vehicle_model`,
                description: sql`CASE WHEN products.manually_edited THEN products.description ELSE excluded.description END`,
                price: sql`excluded.price`,
                cost: sql`excluded.cost`,
                partCost: sql`excluded.part_cost`,
                partMSRP: sql`excluded.part_msrp`,
                imageUrl: sql`CASE WHEN products.manually_edited THEN products.image_url WHEN excluded.image_url IS NOT NULL AND excluded.image_url != '' THEN excluded.image_url ELSE products.image_url END`,
                imageSource: sql`CASE WHEN products.manually_edited THEN products.image_source WHEN excluded.image_url IS NOT NULL AND excluded.image_url != '' THEN excluded.image_source ELSE products.image_source END`,
                isHidden: sql`CASE WHEN products.manually_edited THEN products.is_hidden ELSE excluded.is_hidden END`,
                isPopular: sql`CASE WHEN products.manually_edited THEN products.is_popular ELSE excluded.is_popular END`,
                stockQuantity: sql`excluded.stock_quantity`,
                dataSource: sql`excluded.data_source`,
                updatedAt: new Date(),
              },
            });

          for (const p of productBatch) {
            if (existingSet.has(p.partNumber)) {
              stats.updated++;
            } else {
              stats.added++;
            }
          }
        }
      }

      if (onProgress) {
        onProgress(Math.min(i + batchSize, processRows.length), processRows.length);
      }
    }

    console.log(`[RC Import] Complete: ${stats.added} processed, ${stats.skipped} skipped, ${stats.errors} errors`);
    return stats;
  } catch (error) {
    console.error("[RC Import] Fatal error:", error);
    throw error;
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, "/")) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  console.log(`[RC Import] Starting import...`);
  if (dryRun) console.log(`[RC Import] DRY RUN MODE - no changes will be made`);
  if (limit) console.log(`[RC Import] Limited to ${limit} rows`);

  importRoughCountryFeed({
    dryRun,
    limit,
    onProgress: (current, total) => {
      console.log(`[RC Import] Progress: ${current}/${total} (${Math.round((current / total) * 100)}%)`);
    },
  })
    .then((stats) => {
      console.log("\n[RC Import] Final Statistics:");
      console.log(`  Total processed: ${stats.total}`);
      console.log(`  Added/Updated: ${stats.added}`);
      console.log(`  Skipped: ${stats.skipped}`);
      console.log(`  Errors: ${stats.errors}`);

      if (stats.errorMessages.length > 0) {
        console.log("\n[RC Import] Errors:");
        stats.errorMessages.forEach((msg) => console.log(`  - ${msg}`));
      }

      process.exit(0);
    })
    .catch((error) => {
      console.error("[RC Import] Failed:", error);
      process.exit(1);
    });
}
