import { db } from '../server/db';
import { products } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const XLS_DIR = 'attached_assets/adam_new';

interface ProductData {
  name: string;
  manufacturer: string;
  category: string;
  partNumber: string;
  partCost: number;
  costToSales: number;
  partMsrp: number;
  partRetail: number;
  laborHours: number;
}

function parseHtmlTable(html: string): ProductData[] {
  const products: ProductData[] = [];
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    const values = cells.map(cell => 
      cell.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()
    );
    
    if (values.length >= 19 && values[5]) {
      const partNumber = values[5].trim();
      if (!partNumber) continue;
      
      products.push({
        name: values[0] || '',
        manufacturer: values[1] || '',
        category: values[2] || '',
        partNumber: partNumber,
        partCost: parseFloat(values[7]) || 0,
        costToSales: parseFloat(values[11]) || 0,
        partMsrp: parseFloat(values[14]) || 0,
        partRetail: parseFloat(values[18]) || 0,
        laborHours: parseFloat(values[6]) || 0,
      });
    }
  }
  
  return products;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const verbose = process.argv.includes('--verbose');
  
  console.log('Updating products from XLS files...');
  if (dryRun) console.log('(DRY RUN - no changes will be made)\n');
  
  const files = fs.readdirSync(XLS_DIR).filter(f => f.endsWith('.xls'));
  console.log(`Found ${files.length} XLS files\n`);
  
  const allProducts: Map<string, ProductData> = new Map();
  
  for (const file of files) {
    const filePath = path.join(XLS_DIR, file);
    const html = fs.readFileSync(filePath, 'utf-8');
    const fileProducts = parseHtmlTable(html);
    
    for (const p of fileProducts) {
      allProducts.set(p.partNumber, p);
    }
    
    console.log(`  ${file}: ${fileProducts.length} products`);
  }
  
  console.log(`\nTotal unique products in XLS files: ${allProducts.size}`);
  
  const dbProducts = await db.select({
    id: products.id,
    partNumber: products.partNumber,
    partName: products.partName,
    price: products.price,
    cost: products.cost,
  }).from(products);
  
  console.log(`Total products in database: ${dbProducts.length}\n`);
  
  let updated = 0;
  let nameFixed = 0;
  let priceFixed = 0;
  let notFound = 0;
  const missingInXls: string[] = [];
  
  for (const dbProd of dbProducts) {
    const xlsData = allProducts.get(dbProd.partNumber);
    
    if (!xlsData) {
      missingInXls.push(dbProd.partNumber);
      continue;
    }
    
    const updates: Record<string, any> = {};
    
    const currentName = dbProd.partName || '';
    const newName = xlsData.name;
    
    const nameIsCorrupted = 
      currentName.startsWith('(') ||
      currentName.includes('sturdy steel frame') ||
      currentName.includes('add ice if needed') ||
      currentName.includes('APPLICATION:') ||
      currentName.length < 5 ||
      !currentName.match(/^[A-Za-z0-9]/);
    
    if (nameIsCorrupted && newName && newName.length > 3) {
      updates.partName = newName;
      nameFixed++;
      if (verbose) {
        console.log(`[${dbProd.partNumber}] Name: "${currentName.substring(0, 40)}..." -> "${newName}"`);
      }
    }
    
    const dbPrice = Number(dbProd.price) || 0;
    const dbCost = Number(dbProd.cost) || 0;
    const xlsPrice = xlsData.partRetail || xlsData.partMsrp;
    const xlsCost = xlsData.partCost;
    
    if (xlsPrice > 0 && Math.abs(dbPrice - xlsPrice) > 0.01) {
      updates.price = xlsPrice.toString();
      priceFixed++;
      if (verbose) {
        console.log(`[${dbProd.partNumber}] Price: $${dbPrice} -> $${xlsPrice}`);
      }
    }
    
    if (xlsCost > 0 && Math.abs(dbCost - xlsCost) > 0.01) {
      updates.cost = xlsCost.toString();
      if (verbose) {
        console.log(`[${dbProd.partNumber}] Cost: $${dbCost} -> $${xlsCost}`);
      }
    }
    
    if (Object.keys(updates).length > 0) {
      if (!dryRun) {
        await db.update(products)
          .set(updates)
          .where(eq(products.id, dbProd.id));
      }
      updated++;
    }
  }
  
  console.log('========== RESULTS ==========');
  console.log(`Products updated: ${updated}`);
  console.log(`  - Names fixed: ${nameFixed}`);
  console.log(`  - Prices adjusted: ${priceFixed}`);
  console.log(`Products not in XLS: ${missingInXls.length}`);
  
  if (missingInXls.length > 0 && missingInXls.length <= 20) {
    console.log('\nProducts not found in XLS files:');
    missingInXls.forEach(pn => console.log(`  - ${pn}`));
  }
}

main().catch(console.error);
