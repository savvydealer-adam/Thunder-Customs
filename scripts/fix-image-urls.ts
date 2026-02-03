import { db } from "../server/db";
import { products } from "../shared/schema";
import { sql, isNull, eq, and } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

async function fixImageUrls() {
  const imageDir = path.join(process.cwd(), "attached_assets/product_images");
  const allFiles = fs.readdirSync(imageDir);
  
  // Build map of part number -> actual file path
  const partNumberToFile = new Map<string, string>();
  
  for (const file of allFiles) {
    // Handle tc-prefixed files: tc-{partNumber}.jpg
    let match = file.match(/^tc-(.+)\.(jpg|jpeg|png|webp)$/i);
    if (match) {
      partNumberToFile.set(match[1].toLowerCase(), `/attached_assets/product_images/${file}`);
      continue;
    }
    
    // Handle non-prefixed files: {partNumber}.jpg or {partNumber}.webp
    match = file.match(/^([^.]+)\.(jpg|jpeg|png|webp)$/i);
    if (match) {
      const partNum = match[1].toLowerCase();
      // Don't overwrite tc- prefixed files (they're the preferred format)
      if (!partNumberToFile.has(partNum)) {
        partNumberToFile.set(partNum, `/attached_assets/product_images/${file}`);
      }
    }
  }
  
  console.log(`Found ${partNumberToFile.size} unique part numbers with image files`);
  
  // Get all CSV products (not Rough Country - they use CDN)
  const csvProducts = await db.select({
    id: products.id,
    partNumber: products.partNumber,
    imageUrl: products.imageUrl
  }).from(products).where(eq(products.dataSource, 'csv'));
  
  console.log(`Found ${csvProducts.length} CSV products to check`);
  
  let updated = 0;
  let cleared = 0;
  const batchSize = 100;
  
  for (let i = 0; i < csvProducts.length; i += batchSize) {
    const batch = csvProducts.slice(i, i + batchSize);
    
    for (const product of batch) {
      if (!product.partNumber) continue;
      
      const lowerPartNumber = product.partNumber.toLowerCase();
      const imagePath = partNumberToFile.get(lowerPartNumber);
      
      if (imagePath) {
        // Has matching file - set the URL
        if (product.imageUrl !== imagePath) {
          await db.update(products)
            .set({ imageUrl: imagePath })
            .where(eq(products.id, product.id));
          updated++;
        }
      } else {
        // No matching file - clear URL if set
        if (product.imageUrl) {
          await db.update(products)
            .set({ imageUrl: null })
            .where(eq(products.id, product.id));
          cleared++;
        }
      }
    }
    
    if ((i + batchSize) % 1000 === 0 || i + batchSize >= csvProducts.length) {
      console.log(`Processed ${Math.min(i + batchSize, csvProducts.length)} / ${csvProducts.length}`);
    }
  }
  
  console.log(`Done. Updated ${updated} products, cleared ${cleared} products`);
  
  // Count final stats
  const withImages = await db.select({ 
    count: sql<number>`count(*)` 
  }).from(products).where(sql`image_url IS NOT NULL`);
  
  console.log(`Total products with images: ${withImages[0].count}`);
}

fixImageUrls().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
