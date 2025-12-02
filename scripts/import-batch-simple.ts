import { db } from "../server/db";
import { products } from "../shared/schema";
import * as fs from "fs";
import * as path from "path";

const extractText = (cell: string): string => {
  return cell
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
};

const parseDecimal = (value: string): string | null => {
  if (!value || value.trim() === '') return null;
  const cleaned = value.replace(/[$,]/g, '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed.toFixed(2);
};

async function importFile(filePath: string, filename: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  let vehicleMake: string | undefined;
  const titleMatch = content.match(/(?:Parts Catalog|Pricing Report) for (.+?)(?:\s+All)?$/im);
  if (titleMatch) {
    vehicleMake = titleMatch[1].trim();
  } else {
    const filenameMatch = filename.match(/^([A-Za-z\s-]+?)(?:\.xls)/i);
    if (filenameMatch) vehicleMake = filenameMatch[1].trim();
  }

  const tableMatch = content.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return { parsed: 0, imported: 0 };

  const rows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  if (!rows || rows.length < 2) return { parsed: 0, imported: 0 };

  let imported = 0;
  const parsed = rows.length - 1;

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!cells || cells.length < 6) continue;

    const partName = extractText(cells[0]);
    const manufacturer = extractText(cells[1]);
    const category = extractText(cells[2]);
    const supplier = extractText(cells[3]);
    const creator = extractText(cells[4]);
    const partNumber = extractText(cells[5]);
    
    if (!partName || !manufacturer || !category || !partNumber) continue;

    const laborHours = cells.length > 6 ? parseDecimal(extractText(cells[6])) : null;
    const partCost = cells.length > 7 ? parseDecimal(extractText(cells[7])) : null;
    const salesMarkup = cells.length > 8 ? parseDecimal(extractText(cells[8])) : null;
    const salesOperator = cells.length > 9 ? extractText(cells[9]) || null : null;
    const salesType = cells.length > 10 ? extractText(cells[10]) || null : null;
    const costToSales = cells.length > 11 ? parseDecimal(extractText(cells[11])) : null;
    const salesInstallation = cells.length > 12 ? parseDecimal(extractText(cells[12])) : null;
    const totalCostToSales = cells.length > 13 ? parseDecimal(extractText(cells[13])) : null;
    const partMSRP = cells.length > 14 ? parseDecimal(extractText(cells[14])) : null;
    const retailMarkup = cells.length > 15 ? parseDecimal(extractText(cells[15])) : null;
    const retailOperator = cells.length > 16 ? extractText(cells[16]) || null : null;
    const retailType = cells.length > 17 ? extractText(cells[17]) || null : null;
    const partRetail = cells.length > 18 ? parseDecimal(extractText(cells[18])) : null;
    const retailInstallation = cells.length > 19 ? parseDecimal(extractText(cells[19])) : null;
    const totalRetail = cells.length > 20 ? parseDecimal(extractText(cells[20])) : null;

    try {
      await db.insert(products).values({
        partNumber, partName, manufacturer, category, vehicleMake,
        supplier: supplier || undefined, creator: creator || undefined,
        dataSource: 'csv', isHidden: false, isPopular: false,
        price: partMSRP || undefined, cost: partCost || undefined,
        laborHours, partCost, salesMarkup, salesOperator, salesType,
        costToSales, salesInstallation, totalCostToSales, partMSRP,
        retailMarkup, retailOperator, retailType, partRetail,
        retailInstallation, totalRetail, imageUrl: null, stockQuantity: 0,
      }).onConflictDoUpdate({
        target: products.partNumber,
        set: {
          partName, manufacturer, category, vehicleMake,
          supplier, creator, price: partMSRP, cost: partCost,
          laborHours, partCost, salesMarkup, salesOperator, salesType,
          costToSales, salesInstallation, totalCostToSales, partMSRP,
          retailMarkup, retailOperator, retailType, partRetail,
          retailInstallation, totalRetail, updatedAt: new Date(),
        },
      });
      imported++;
    } catch (e) {}
  }

  console.log(`${filename}: ${imported}/${parsed} products (${vehicleMake})`);
  return { parsed, imported };
}

async function main() {
  const startFile = process.argv[2];
  const importDir = "attached_assets/adam_import";
  let files = fs.readdirSync(importDir).filter(f => f.endsWith('.xls')).sort();
  
  if (startFile) {
    const startIndex = files.findIndex(f => f.toLowerCase().startsWith(startFile.toLowerCase()));
    if (startIndex >= 0) files = files.slice(startIndex);
  }

  console.log(`Importing ${files.length} files...`);
  let total = 0;

  for (const file of files) {
    const result = await importFile(path.join(importDir, file), file);
    total += result.imported;
  }

  console.log(`\nTotal imported: ${total}`);
}

main().catch(console.error);
