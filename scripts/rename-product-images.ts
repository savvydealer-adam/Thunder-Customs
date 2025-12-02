import { db } from '../server/db';
import { products } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const PRODUCT_IMAGES_DIR = path.resolve(import.meta.dirname, '..', 'attached_assets', 'product_images');

async function renameProductImages() {
  console.log('\n========================================');
  console.log('RENAMING PRODUCT IMAGES TO TC- PREFIX');
  console.log('========================================\n');

  const files = fs.readdirSync(PRODUCT_IMAGES_DIR);
  console.log(`Found ${files.length} files in product_images directory\n`);

  let renamed = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    if (file.startsWith('tc-')) {
      skipped++;
      continue;
    }

    const oldPath = path.join(PRODUCT_IMAGES_DIR, file);
    const newFileName = `tc-${file}`;
    const newPath = path.join(PRODUCT_IMAGES_DIR, newFileName);

    try {
      fs.renameSync(oldPath, newPath);
      renamed++;
      
      if (renamed % 100 === 0) {
        console.log(`Progress: ${renamed} files renamed...`);
      }
    } catch (error) {
      console.error(`Error renaming ${file}: ${error}`);
      errors++;
    }
  }

  console.log(`\nFile renaming complete:`);
  console.log(`  Renamed: ${renamed}`);
  console.log(`  Skipped (already has tc- prefix): ${skipped}`);
  console.log(`  Errors: ${errors}`);

  console.log('\n----------------------------------------');
  console.log('UPDATING DATABASE IMAGE URLS');
  console.log('----------------------------------------\n');

  const productsWithLocalImages = await db.select({
    id: products.id,
    imageUrl: products.imageUrl
  }).from(products).where(
    sql`${products.imageUrl} LIKE '/attached_assets/product_images/%' AND ${products.imageUrl} NOT LIKE '/attached_assets/product_images/tc-%'`
  );

  console.log(`Found ${productsWithLocalImages.length} products to update\n`);

  let dbUpdated = 0;
  let dbErrors = 0;

  for (const product of productsWithLocalImages) {
    if (!product.imageUrl) continue;

    const oldUrl = product.imageUrl;
    const fileName = path.basename(oldUrl);
    const newUrl = `/attached_assets/product_images/tc-${fileName}`;

    try {
      await db.update(products)
        .set({ imageUrl: newUrl })
        .where(eq(products.id, product.id));
      
      dbUpdated++;
      
      if (dbUpdated % 100 === 0) {
        console.log(`Progress: ${dbUpdated} database records updated...`);
      }
    } catch (error) {
      console.error(`Error updating product ${product.id}: ${error}`);
      dbErrors++;
    }
  }

  console.log('\n========================================');
  console.log('RENAME COMPLETE');
  console.log('========================================');
  console.log(`Files renamed: ${renamed}`);
  console.log(`Database records updated: ${dbUpdated}`);
  console.log(`Errors: ${errors + dbErrors}`);
  console.log('\nDone!');
}

renameProductImages().catch(console.error);
