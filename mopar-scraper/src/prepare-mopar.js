#!/usr/bin/env node

/**
 * Prepare Mopar Parts for Scraping
 * Reads XLS files and creates a combined CSV for the scraper
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { load } from 'cheerio';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MOPAR_BRANDS = ['Chrysler.xls', 'Dodge.xls', 'Jeep.xls', 'Ram.xls', 'Fiat.xls'];

function parseXlsFile(filePath) {
  const html = readFileSync(filePath, 'utf8');
  const $ = load(html);

  const rows = $('table tr');
  const parts = [];

  // Get headers from first row
  const headers = [];
  rows.first().find('th, td').each((i, el) => {
    headers.push($(el).text().trim().toLowerCase());
  });

  // Find column indices
  const colIndex = {
    name: headers.findIndex(h => h === 'name'),
    manufacturer: headers.findIndex(h => h === 'manufacturer'),
    category: headers.findIndex(h => h === 'category'),
    partNumber: headers.findIndex(h => h === 'part #' || h === 'part#'),
    partCost: headers.findIndex(h => h === 'part cost'),
    partMsrp: headers.findIndex(h => h === 'part msrp'),
    partRetail: headers.findIndex(h => h === 'part retail'),
  };

  // Parse data rows
  rows.slice(1).each((i, row) => {
    const cells = [];
    $(row).find('td').each((j, cell) => {
      cells.push($(cell).text().trim());
    });

    const partNumber = cells[colIndex.partNumber];
    if (cells.length > 0 && partNumber) {
      parts.push({
        partNumber: partNumber,
        name: cells[colIndex.name] || '',
        manufacturer: cells[colIndex.manufacturer] || '',
        category: cells[colIndex.category] || '',
        existingCost: cells[colIndex.partCost] || '',
        existingMsrp: cells[colIndex.partMsrp] || '',
        existingRetail: cells[colIndex.partRetail] || '',
      });
    }
  });

  return parts;
}

function escapeCSV(str) {
  if (!str) return '';
  str = String(str);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function main() {
  const inputDir = process.argv[2] || 'C:/Users/adam/Downloads/adam';
  const outputPath = path.join(__dirname, '../data/input/mopar-parts.csv');

  console.log('\\n🔧 Preparing Mopar Parts for Scraping\\n');
  console.log(`Input directory: ${inputDir}`);
  console.log(`Output file: ${outputPath}\\n`);

  const allParts = [];

  for (const file of MOPAR_BRANDS) {
    const filePath = path.join(inputDir, file);
    try {
      const parts = parseXlsFile(filePath);
      allParts.push(...parts);
      console.log(`✓ ${file}: ${parts.length.toLocaleString()} parts`);
    } catch (err) {
      console.log(`✗ ${file}: ${err.message}`);
    }
  }

  console.log(`\\nTotal parts: ${allParts.length.toLocaleString()}`);

  // Write CSV
  const csvHeader = 'part_number,name,manufacturer,category,existing_cost,existing_msrp,existing_retail';
  const csvRows = allParts.map(p => [
    escapeCSV(p.partNumber),
    escapeCSV(p.name),
    escapeCSV(p.manufacturer),
    escapeCSV(p.category),
    escapeCSV(p.existingCost),
    escapeCSV(p.existingMsrp),
    escapeCSV(p.existingRetail)
  ].join(','));

  const csvContent = [csvHeader, ...csvRows].join('\n');
  writeFileSync(outputPath, csvContent);

  console.log(`\\n✅ Created ${outputPath}`);
  console.log(`\\nNext steps:`);
  console.log(`  1. Run: npm run scrape -- ./data/input/mopar-parts.csv`);
  console.log(`  2. Or for batches: npm run scrape -- ./data/input/mopar-parts.csv -d 5000`);
}

main().catch(console.error);
