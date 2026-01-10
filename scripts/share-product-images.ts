/**
 * Share product images across similar products (different sizes/configurations of same item)
 * 
 * This script finds products with real images and copies them to similar products
 * that only have placeholders. Products are grouped by:
 * - Manufacturer
 * - Product type (extracted from name, removing bed length)
 * - Finish (Gloss Black vs Textured Black)
 * 
 * Usage: npx tsx scripts/share-product-images.ts [--dry-run] [--manufacturer=X]
 */

import { db } from "../server/db";
import { products } from "../shared/schema";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

const PLACEHOLDER_SIZE = 11279; // bytes

interface ProductImage {
  id: number;
  partNumber: string;
  partName: string;
  manufacturer: string;
  imageUrl: string | null;
  hasRealImage: boolean;
  productFamily: string;
}

function extractProductFamily(partName: string): string {
  // Remove bed length (e.g., "5.9 Feet Bed", "6.4 Feet Bed")
  // Keep the rest: product type + finish
  return partName
    .replace(/^\d+\.?\d*\s*Feet?\s*Bed\s*/i, '')
    .trim();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const manufacturerArg = args.find(a => a.startsWith('--manufacturer='));
  const filterManufacturer = manufacturerArg?.split('=')[1];

  console.log('Share Product Images Script');
  console.log('===========================');
  if (dryRun) console.log('DRY RUN - No changes will be made\n');
  if (filterManufacturer) console.log(`Filtering by manufacturer: ${filterManufacturer}\n`);

  // Get all products
  let allProducts = await db.select({
    id: products.id,
    partNumber: products.partNumber,
    partName: products.partName,
    manufacturer: products.manufacturer,
    imageUrl: products.imageUrl,
  }).from(products);

  if (filterManufacturer) {
    allProducts = allProducts.filter(p => 
      p.manufacturer.toLowerCase() === filterManufacturer.toLowerCase()
    );
  }

  // Check which products have real images
  const productsWithImageInfo: ProductImage[] = allProducts.map(p => {
    let hasRealImage = false;
    
    if (p.imageUrl) {
      const imagePath = path.join(process.cwd(), p.imageUrl.replace(/^\//, ''));
      try {
        const stats = fs.statSync(imagePath);
        hasRealImage = stats.size > PLACEHOLDER_SIZE;
      } catch {
        hasRealImage = false;
      }
    }

    return {
      id: p.id,
      partNumber: p.partNumber,
      partName: p.partName,
      manufacturer: p.manufacturer,
      imageUrl: p.imageUrl,
      hasRealImage,
      productFamily: extractProductFamily(p.partName),
    };
  });

  // Group by manufacturer + product family
  const families = new Map<string, ProductImage[]>();
  
  for (const product of productsWithImageInfo) {
    const key = `${product.manufacturer}|${product.productFamily}`;
    if (!families.has(key)) {
      families.set(key, []);
    }
    families.get(key)!.push(product);
  }

  // Find families that have both real and placeholder images
  let updateCount = 0;
  const updates: { id: number; partNumber: string; sourcePartNumber: string; imageUrl: string }[] = [];

  for (const [familyKey, familyProducts] of families) {
    const withRealImages = familyProducts.filter(p => p.hasRealImage);
    const withPlaceholders = familyProducts.filter(p => !p.hasRealImage);

    if (withRealImages.length > 0 && withPlaceholders.length > 0) {
      // Use the first product with a real image as the source
      const source = withRealImages[0];
      
      console.log(`\nFamily: ${familyKey}`);
      console.log(`  Source: ${source.partNumber} (${source.imageUrl})`);
      console.log(`  Products to update: ${withPlaceholders.length}`);
      
      for (const target of withPlaceholders) {
        // Copy the image file
        const sourceImagePath = path.join(process.cwd(), source.imageUrl!.replace(/^\//, ''));
        const targetImagePath = path.join(
          process.cwd(), 
          'attached_assets/product_images',
          `tc-${target.partNumber.toLowerCase()}.jpg`
        );

        updates.push({
          id: target.id,
          partNumber: target.partNumber,
          sourcePartNumber: source.partNumber,
          imageUrl: `/attached_assets/product_images/tc-${target.partNumber.toLowerCase()}.jpg`,
        });

        if (!dryRun) {
          try {
            fs.copyFileSync(sourceImagePath, targetImagePath);
            console.log(`    Copied image to ${target.partNumber}`);
          } catch (err) {
            console.error(`    ERROR copying to ${target.partNumber}:`, err);
          }
        } else {
          console.log(`    Would copy to ${target.partNumber}`);
        }
        
        updateCount++;
      }
    }
  }

  console.log(`\n===========================`);
  console.log(`Total products that can share images: ${updateCount}`);
  
  if (!dryRun && updates.length > 0) {
    // Update imageSource in database to track that image was shared
    console.log('\nUpdating database with image source info...');
    for (const update of updates) {
      await db.update(products)
        .set({ 
          imageSource: `shared:${update.sourcePartNumber}` 
        })
        .where(sql`${products.id} = ${update.id}`);
    }
    console.log('Database updated.');
  }
}

main().catch(console.error);
