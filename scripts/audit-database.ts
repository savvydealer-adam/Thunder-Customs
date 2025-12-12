import { db } from '../server/db';
import { products } from '../shared/schema';
import { inArray } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const XLS_DIR = 'attached_assets/adam_new';

function parseHtmlTable(html: string): Set<string> {
  const partNumbers = new Set<string>();
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    const values = cells.map(cell => 
      cell.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()
    );
    
    if (values.length >= 6 && values[5]) {
      const partNumber = values[5].trim();
      if (partNumber) {
        partNumbers.add(partNumber);
      }
    }
  }
  
  return partNumbers;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log('=== Database Audit Against XLS Files ===\n');
  if (dryRun) console.log('(DRY RUN - no changes will be made)\n');
  
  const files = fs.readdirSync(XLS_DIR).filter(f => f.endsWith('.xls'));
  console.log(`Found ${files.length} XLS files\n`);
  
  const allXlsPartNumbers = new Set<string>();
  
  for (const file of files) {
    const filePath = path.join(XLS_DIR, file);
    const html = fs.readFileSync(filePath, 'utf-8');
    const filePartNumbers = parseHtmlTable(html);
    
    for (const pn of filePartNumbers) {
      allXlsPartNumbers.add(pn);
    }
    
    console.log(`  ${file}: ${filePartNumbers.size} part numbers`);
  }
  
  console.log(`\nTotal unique part numbers in XLS files: ${allXlsPartNumbers.size}`);
  
  const dbProducts = await db.select({
    id: products.id,
    partNumber: products.partNumber,
    partName: products.partName,
    manufacturer: products.manufacturer,
    price: products.price,
  }).from(products);
  
  console.log(`Total products in database: ${dbProducts.length}\n`);
  
  const toRemove: { id: number; partNumber: string; partName: string; manufacturer: string; price: string }[] = [];
  
  for (const dbProd of dbProducts) {
    if (!allXlsPartNumbers.has(dbProd.partNumber)) {
      toRemove.push({
        id: dbProd.id,
        partNumber: dbProd.partNumber,
        partName: dbProd.partName || '',
        manufacturer: dbProd.manufacturer || '',
        price: dbProd.price || '0',
      });
    }
  }
  
  console.log(`\n=== Products NOT found in XLS files: ${toRemove.length} ===\n`);
  
  if (toRemove.length > 0) {
    console.log('Products to be removed:');
    for (const p of toRemove) {
      console.log(`  [${p.partNumber}] ${p.partName.substring(0, 50)} | ${p.manufacturer} | $${p.price}`);
    }
    
    if (!dryRun) {
      console.log('\nDeleting unverified products...');
      const idsToDelete = toRemove.map(p => p.id);
      
      const batchSize = 100;
      let deleted = 0;
      
      for (let i = 0; i < idsToDelete.length; i += batchSize) {
        const batch = idsToDelete.slice(i, i + batchSize);
        await db.delete(products).where(inArray(products.id, batch));
        deleted += batch.length;
        console.log(`  Deleted ${deleted}/${idsToDelete.length}...`);
      }
      
      console.log(`\nSuccessfully removed ${toRemove.length} unverified products.`);
    } else {
      console.log('\n(Dry run - no products were deleted)');
    }
  } else {
    console.log('All database products are verified in XLS files!');
  }
  
  const finalCount = dryRun ? dbProducts.length : dbProducts.length - toRemove.length;
  console.log(`\nFinal product count: ${finalCount}`);
}

main().catch(console.error).finally(() => process.exit(0));
