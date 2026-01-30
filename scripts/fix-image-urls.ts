import { db } from "../server/db";
import { products } from "../shared/schema";
import { sql, isNull, not } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

async function fixImageUrls() {
  const imageDir = path.join(process.cwd(), "attached_assets/product_images");
  const files = fs.readdirSync(imageDir).filter(f => f.startsWith("tc-"));
  
  const validPartNumbers = new Set<string>();
  for (const file of files) {
    const match = file.match(/^tc-(.+)\.(jpg|jpeg|png|webp)$/i);
    if (match) {
      validPartNumbers.add(match[1].toLowerCase());
    }
  }
  
  console.log(`Found ${validPartNumbers.size} image files`);
  
  const allProducts = await db.select({
    id: products.id,
    partNumber: products.partNumber,
    imageUrl: products.imageUrl
  }).from(products).where(not(isNull(products.imageUrl)));
  
  console.log(`Found ${allProducts.length} products with imageUrl set`);
  
  let cleared = 0;
  const batchSize = 500;
  const toClear: number[] = [];
  
  for (const product of allProducts) {
    if (!product.partNumber) {
      toClear.push(product.id);
      continue;
    }
    
    const lowerPartNumber = product.partNumber.toLowerCase();
    if (!validPartNumbers.has(lowerPartNumber)) {
      toClear.push(product.id);
    }
  }
  
  console.log(`Will clear ${toClear.length} products without matching image files`);
  
  for (let i = 0; i < toClear.length; i += batchSize) {
    const batch = toClear.slice(i, i + batchSize);
    const idList = batch.join(',');
    await db.execute(sql.raw(`UPDATE products SET image_url = NULL WHERE id IN (${idList})`));
    cleared += batch.length;
    if (cleared % 1000 === 0) {
      console.log(`Cleared ${cleared} / ${toClear.length}`);
    }
  }
  
  console.log(`Done. Cleared ${cleared} products, ${allProducts.length - cleared} products have valid images`);
}

fixImageUrls().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
