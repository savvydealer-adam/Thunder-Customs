/**
 * CSV Handler
 * Read part numbers from input CSV, write results to output CSV
 */

import { createReadStream, createWriteStream } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';

/**
 * Read part numbers from a CSV file
 * Expects a column named 'part_number', 'PartNumber', 'SKU', or similar
 */
export async function readPartNumbers(filePath) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let warnedAboutFallback = false;

    createReadStream(filePath)
      .pipe(parse({
        columns: true,
        skip_empty_lines: true,
        trim: true
      }))
      .on('data', (row) => {
        // Try to find the part number column (flexible naming)
        const partNumber =
          row.part_number ||
          row.PartNumber ||
          row.partNumber ||
          row.PART_NUMBER ||
          row.sku ||
          row.SKU ||
          row.Sku ||
          row.part ||
          row.Part ||
          row.PART;

        // Fall back to first column with warning
        const finalPartNumber = partNumber || Object.values(row)[0];

        if (!partNumber && !warnedAboutFallback) {
          console.warn('Warning: Could not find part number column (part_number, PartNumber, SKU, etc). Using first column:', Object.keys(row)[0]);
          warnedAboutFallback = true;
        }

        if (finalPartNumber && finalPartNumber.trim()) {
          parts.push({
            partNumber: finalPartNumber.trim(),
            originalRow: row
          });
        }
      })
      .on('end', () => resolve(parts))
      .on('error', reject);
  });
}

/**
 * Ensure directory exists before writing
 */
async function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
}

/**
 * Write results to a CSV file
 */
export async function writeResults(filePath, results) {
  await ensureDir(filePath);

  const records = results.map(r => ({
    part_number: r.partNumber,
    title: r.title || '',
    description: r.description || '',
    msrp: r.msrp || '',
    salePrice: r.salePrice || '',
    price_source: r.priceSource || '',
    image_url: r.imageUrl || '',
    image_source: r.imageSource || '',
    local_image: r.localImage || '',
    source_url: r.sourceUrl || '',
    scraped_at: r.scrapedAt || new Date().toISOString(),
    status: r.status || 'success',
    error: r.error || ''
  }));

  return new Promise((resolve, reject) => {
    stringify(records, {
      header: true,
      columns: [
        'part_number',
        'title',
        'description',
        'msrp',
        'salePrice',
        'price_source',
        'image_url',
        'image_source',
        'local_image',
        'source_url',
        'scraped_at',
        'status',
        'error'
      ]
    }, (err, output) => {
      if (err) return reject(err);
      writeFile(filePath, output)
        .then(resolve)
        .catch(reject);
    });
  });
}

/**
 * Append a single result to CSV (for real-time saving)
 */
export async function appendResult(filePath, result, isFirst = false) {
  if (isFirst) {
    await ensureDir(filePath);
  }

  const record = {
    part_number: result.partNumber,
    title: result.title || '',
    description: result.description || '',
    msrp: result.msrp || '',
    salePrice: result.salePrice || '',
    price_source: result.priceSource || '',
    image_url: result.imageUrl || '',
    image_source: result.imageSource || '',
    local_image: result.localImage || '',
    source_url: result.sourceUrl || '',
    scraped_at: result.scrapedAt || new Date().toISOString(),
    status: result.status || 'success',
    error: result.error || ''
  };

  return new Promise((resolve, reject) => {
    stringify([record], {
      header: isFirst,
      columns: [
        'part_number',
        'title',
        'description',
        'msrp',
        'salePrice',
        'price_source',
        'image_url',
        'image_source',
        'local_image',
        'source_url',
        'scraped_at',
        'status',
        'error'
      ]
    }, async (err, output) => {
      if (err) return reject(err);

      try {
        const existingContent = isFirst ? '' : await readFile(filePath, 'utf-8').catch(() => '');
        await writeFile(filePath, existingContent + output);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}
