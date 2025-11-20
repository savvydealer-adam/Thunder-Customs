import { db } from "../server/db";
import { products } from "../shared/schema";
import { sql } from "drizzle-orm";

async function regenerateImages() {
  console.log("Fetching all products...");
  const allProducts = await db.select().from(products);
  
  console.log(`Found ${allProducts.length} products. Regenerating placeholder images...`);
  
  let updated = 0;
  
  for (const product of allProducts) {
    const manufacturerText = product.manufacturer.substring(0, 20);
    const partText = product.partName.substring(0, 25);
    const displayText = `${manufacturerText}+%0A${partText}`;
    const imageUrl = `https://placehold.co/600x400/1E90FF/FFFFFF?text=${displayText}&font=raleway`;
    
    await db
      .update(products)
      .set({ imageUrl })
      .where(sql`${products.id} = ${product.id}`);
    
    updated++;
    
    if (updated % 100 === 0) {
      console.log(`Updated ${updated}/${allProducts.length} products...`);
    }
  }
  
  console.log(`✅ Successfully updated ${updated} product images!`);
  process.exit(0);
}

regenerateImages().catch((error) => {
  console.error("Error regenerating images:", error);
  process.exit(1);
});
