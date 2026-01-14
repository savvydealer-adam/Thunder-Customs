/**
 * XLS Handler
 * Parse HTML-format Excel files commonly exported from dealership systems
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { load } from 'cheerio';
import path from 'path';

/**
 * Parse a single XLS file (HTML format)
 */
export function parseXlsFile(filePath) {
  const html = readFileSync(filePath, 'utf8');
  const $ = load(html);

  const rows = $('table tr');
  const parts = [];

  // Get headers from first row
  const headers = [];
  rows.first().find('th, td').each((i, el) => {
    headers.push($(el).text().trim());
  });

  // Find column indices
  const colIndex = {
    name: headers.findIndex(h => h.toLowerCase() === 'name'),
    manufacturer: headers.findIndex(h => h.toLowerCase() === 'manufacturer'),
    category: headers.findIndex(h => h.toLowerCase() === 'category'),
    partNumber: headers.findIndex(h => h.toLowerCase() === 'part #' || h.toLowerCase() === 'part#'),
    partCost: headers.findIndex(h => h.toLowerCase() === 'part cost'),
    partMsrp: headers.findIndex(h => h.toLowerCase() === 'part msrp'),
    partRetail: headers.findIndex(h => h.toLowerCase() === 'part retail'),
    laborHours: headers.findIndex(h => h.toLowerCase() === 'labor hours'),
  };

  // Parse data rows
  rows.slice(1).each((i, row) => {
    const cells = [];
    $(row).find('td').each((j, cell) => {
      cells.push($(cell).text().trim());
    });

    if (cells.length > 0 && cells[colIndex.partNumber]) {
      parts.push({
        name: cells[colIndex.name] || '',
        manufacturer: cells[colIndex.manufacturer] || '',
        category: cells[colIndex.category] || '',
        partNumber: cells[colIndex.partNumber] || '',
        partCost: parsePrice(cells[colIndex.partCost]),
        partMsrp: parsePrice(cells[colIndex.partMsrp]),
        partRetail: parsePrice(cells[colIndex.partRetail]),
        laborHours: parseFloat(cells[colIndex.laborHours]) || 0,
        sourceFile: path.basename(filePath)
      });
    }
  });

  return parts;
}

/**
 * Parse multiple XLS files from a directory
 */
export function parseXlsDirectory(dirPath, fileFilter = null) {
  const files = readdirSync(dirPath)
    .filter(f => f.endsWith('.xls'))
    .filter(f => !fileFilter || fileFilter.includes(f));

  const allParts = [];

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const parts = parseXlsFile(filePath);
    allParts.push(...parts);
    console.log(`Parsed ${file}: ${parts.length} parts`);
  }

  return allParts;
}

/**
 * Parse price string to number
 */
function parsePrice(priceStr) {
  if (!priceStr) return null;
  const cleaned = priceStr.replace(/[$,]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Export parts to CSV for the scraper
 */
export function exportPartsForScraper(parts, outputPath) {
  const csv = [
    'part_number,name,manufacturer,category,existing_cost,existing_msrp,existing_retail',
    ...parts.map(p => [
      p.partNumber,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      p.manufacturer,
      `"${(p.category || '').replace(/"/g, '""')}"`,
      p.partCost || '',
      p.partMsrp || '',
      p.partRetail || ''
    ].join(','))
  ].join('\n');

  writeFileSync(outputPath, csv);
  return parts.length;
}

export default {
  parseXlsFile,
  parseXlsDirectory,
  exportPartsForScraper
};

