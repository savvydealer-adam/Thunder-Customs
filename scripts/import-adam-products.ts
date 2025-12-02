import { db } from "../server/db";
import { products, type InsertProduct } from "../shared/schema";
import { sql, eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

function parseProductsFromHTML(content: string, filename?: string): InsertProduct[] {
  const productsList: InsertProduct[] = [];
  
  let vehicleMake: string | undefined;
  
  const titleMatch = content.match(/(?:Parts Catalog|Pricing Report) for (.+?)(?:\s+All)?$/im);
  if (titleMatch) {
    vehicleMake = titleMatch[1].trim();
  } else if (filename) {
    const filenameMatch = filename.match(/^([A-Za-z\s-]+?)(?:\.xls|\.xlsx|\sR&R|\s)/i);
    if (filenameMatch) {
      vehicleMake = filenameMatch[1].trim();
    }
  }

  const tableMatch = content.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    console.log(`No table found in ${filename}`);
    return productsList;
  }

  const rows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  if (!rows || rows.length < 2) {
    console.log(`No data rows found in ${filename}`);
    return productsList;
  }

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

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!cells || cells.length < 6) continue;

    const partName = extractText(cells[0]);
    const manufacturer = extractText(cells[1]);
    const category = extractText(cells[2]);
    const supplier = extractText(cells[3]);
    const creator = extractText(cells[4]);
    const partNumber = extractText(cells[5]);
    
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

    if (!partName || !manufacturer || !category || !partNumber) {
      continue;
    }

    productsList.push({
      partNumber,
      partName,
      manufacturer,
      category,
      vehicleMake,
      supplier: supplier || undefined,
      creator: creator || undefined,
      dataSource: 'csv',
      isHidden: false,
      isPopular: false,
      description: undefined,
      price: partMSRP || undefined,
      cost: partCost || undefined,
      laborHours: laborHours || undefined,
      partCost: partCost || undefined,
      salesMarkup: salesMarkup || undefined,
      salesOperator: salesOperator || undefined,
      salesType: salesType || undefined,
      costToSales: costToSales || undefined,
      salesInstallation: salesInstallation || undefined,
      totalCostToSales: totalCostToSales || undefined,
      partMSRP: partMSRP || undefined,
      retailMarkup: retailMarkup || undefined,
      retailOperator: retailOperator || undefined,
      retailType: retailType || undefined,
      partRetail: partRetail || undefined,
      retailInstallation: retailInstallation || undefined,
      totalRetail: totalRetail || undefined,
      imageUrl: null,
      stockQuantity: 0,
    });
  }

  console.log(`Parsed ${productsList.length} products from ${filename} for ${vehicleMake || 'Unknown'}`);
  return productsList;
}

async function importProducts(productsList: InsertProduct[]): Promise<number> {
  let imported = 0;
  
  for (const product of productsList) {
    try {
      await db
        .insert(products)
        .values(product)
        .onConflictDoUpdate({
          target: products.partNumber,
          set: {
            partName: product.partName,
            manufacturer: product.manufacturer,
            category: product.category,
            vehicleMake: product.vehicleMake,
            supplier: product.supplier,
            creator: product.creator,
            price: product.price,
            cost: product.cost,
            laborHours: product.laborHours,
            partCost: product.partCost,
            salesMarkup: product.salesMarkup,
            salesOperator: product.salesOperator,
            salesType: product.salesType,
            costToSales: product.costToSales,
            salesInstallation: product.salesInstallation,
            totalCostToSales: product.totalCostToSales,
            partMSRP: product.partMSRP,
            retailMarkup: product.retailMarkup,
            retailOperator: product.retailOperator,
            retailType: product.retailType,
            partRetail: product.partRetail,
            retailInstallation: product.retailInstallation,
            totalRetail: product.totalRetail,
            updatedAt: new Date(),
          },
        });
      imported++;
    } catch (error) {
      console.error(`Error importing product ${product.partNumber}:`, error);
    }
  }
  
  return imported;
}

async function main() {
  const importDir = "attached_assets/adam_import";
  
  const files = fs.readdirSync(importDir).filter(f => f.endsWith('.xls'));
  
  console.log(`Found ${files.length} XLS files to import`);
  
  let totalImported = 0;
  let totalParsed = 0;
  
  for (const file of files) {
    const filePath = path.join(importDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    const productsList = parseProductsFromHTML(content, file);
    totalParsed += productsList.length;
    
    if (productsList.length > 0) {
      const imported = await importProducts(productsList);
      totalImported += imported;
      console.log(`  -> Imported ${imported}/${productsList.length} products from ${file}`);
    }
  }
  
  console.log(`\n=== IMPORT COMPLETE ===`);
  console.log(`Total files processed: ${files.length}`);
  console.log(`Total products parsed: ${totalParsed}`);
  console.log(`Total products imported: ${totalImported}`);
}

main().catch(console.error);
