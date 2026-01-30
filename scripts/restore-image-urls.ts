import { db } from "../server/db";
import { products } from "../shared/schema";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

async function restoreImageUrls() {
  const imageDir = path.join(process.cwd(), "attached_assets/product_images");
  const files = fs.readdirSync(imageDir).filter(f => f.startsWith("tc-"));
  
  const imageMap = new Map<string, string>();
  for (const file of files) {
    const match = file.match(/^tc-(.+)\.(jpg|jpeg|png|webp)$/i);
    if (match) {
      const partNumber = match[1].toLowerCase();
      imageMap.set(partNumber, file);
    }
  }
  
  console.log(`Found ${imageMap.size} image files`);
  
  const allProducts = await db.select({
    id: products.id,
    partNumber: products.partNumber
  }).from(products);
  
  console.log(`Found ${allProducts.length} products`);
  
  let updated = 0;
  let notFound = 0;
  
  for (const product of allProducts) {
    if (!product.partNumber) continue;
    
    const lowerPartNumber = product.partNumber.toLowerCase();
    const imageFile = imageMap.get(lowerPartNumber);
    
    if (imageFile) {
      const imageUrl = `/attached_assets/product_images/${imageFile}`;
      await db.execute(
        sql`UPDATE products SET image_url = ${imageUrl} WHERE id = ${product.id}`
      );
      updated++;
    } else {
      notFound++;
    }
  }
  
  console.log(`Updated ${updated} products with image URLs`);
  console.log(`${notFound} products have no matching image file`);
}

restoreImageUrls().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
