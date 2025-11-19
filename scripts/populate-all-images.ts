import { db } from '../server/db';
import { products } from '../shared/schema';
import { isNull, or, eq } from 'drizzle-orm';

async function populateAllImages() {
  console.log('Fetching products without images...');
  
  const productsWithoutImages = await db
    .select()
    .from(products)
    .where(
      or(
        isNull(products.imageUrl),
        eq(products.imageUrl, '')
      )
    );

  console.log(`Found ${productsWithoutImages.length} products without images`);

  let updated = 0;
  const batchSize = 100;

  for (let i = 0; i < productsWithoutImages.length; i += batchSize) {
    const batch = productsWithoutImages.slice(i, i + batchSize);
    
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} products)...`);

    const updatePromises = batch.map(product => {
      const manufacturerText = product.manufacturer.substring(0, 20);
      const partText = product.partName.substring(0, 25);
      const displayText = `${manufacturerText}+%0A${partText}`;
      const imageUrl = `https://placehold.co/600x400/1E90FF/FFFFFF?text=${displayText}&font=raleway`;

      return db
        .update(products)
        .set({ imageUrl, updatedAt: new Date() })
        .where(eq(products.id, product.id));
    });

    await Promise.all(updatePromises);
    updated += batch.length;
    console.log(`✅ Updated ${updated} products so far...`);
  }

  console.log(`\n✅ All done! Updated ${updated} product images with branded placeholders.`);
}

populateAllImages()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error populating images:', error);
    process.exit(1);
  });
