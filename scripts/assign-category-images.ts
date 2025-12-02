import { db } from '../server/db';
import { products } from '@shared/schema';
import { eq, ilike, or, isNull, sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const categoryImageMapping: Record<string, string[]> = {
  'Floor Mats': [
    '/attached_assets/stock_images/car_floor_mat_rubber_9fcd89ce.jpg',
    '/attached_assets/stock_images/car_floor_mat_rubber_45713a87.jpg',
    '/attached_assets/stock_images/car_floor_mat_rubber_b8a0558b.jpg'
  ],
  'Automotive Accessories': [
    '/attached_assets/stock_images/ram_trx_pickup_truck_217aab27.jpg',
    '/attached_assets/stock_images/ram_trx_pickup_truck_32a43c45.jpg',
    '/attached_assets/stock_images/ram_trx_pickup_truck_72d9e5f2.jpg'
  ],
  'Step and Rocker Bars': [
    '/attached_assets/stock_images/truck_running_board__5247895d.jpg',
    '/attached_assets/stock_images/truck_running_board__14d96f13.jpg',
    '/attached_assets/stock_images/truck_running_board__84976aae.jpg'
  ],
  'Tires': [
    '/attached_assets/stock_images/automotive_tires_whe_57d588d5.jpg',
    '/attached_assets/stock_images/automotive_tires_whe_a439ebd9.jpg',
    '/attached_assets/stock_images/automotive_tires_whe_c80b88de.jpg'
  ],
  'Window Tint': [
    '/attached_assets/stock_images/car_window_tint_film_4d7a9179.jpg',
    '/attached_assets/stock_images/car_window_tint_film_9e0d684d.jpg'
  ],
  'Tonneau Covers and Bed Caps': [
    '/attached_assets/stock_images/truck_tonneau_cover__6d6cdcd2.jpg',
    '/attached_assets/stock_images/truck_tonneau_cover__b490e6b5.jpg',
    '/attached_assets/stock_images/truck_tonneau_cover__b957d5a3.jpg'
  ],
  'Wheel Accessories': [
    '/attached_assets/stock_images/automotive_wheel_rim_5907951b.jpg',
    '/attached_assets/stock_images/automotive_wheel_rim_eddaf288.jpg'
  ],
  'Suspension': [
    '/attached_assets/stock_images/truck_lift_kit_suspe_ad02b0c6.jpg',
    '/attached_assets/stock_images/truck_lift_kit_suspe_5ffd352e.jpg',
    '/attached_assets/stock_images/truck_lift_kit_suspe_5a55f1aa.jpg'
  ],
  'Deflectors': [
    '/attached_assets/stock_images/car_wind_deflector_w_2a28c057.jpg',
    '/attached_assets/stock_images/car_wind_deflector_w_3736cf04.jpg',
    '/attached_assets/stock_images/car_wind_deflector_w_f89de007.jpg'
  ],
  'Protection Products': [
    '/attached_assets/stock_images/car_paint_protection_db501234.jpg',
    '/attached_assets/stock_images/car_paint_protection_f9ffdb88.jpg'
  ],
  'Splash Guards': [
    '/attached_assets/stock_images/car_mud_flaps_splash_57e1281c.jpg',
    '/attached_assets/stock_images/car_mud_flaps_splash_1058ca68.jpg',
    '/attached_assets/stock_images/car_mud_flaps_splash_68687db2.jpg'
  ],
  'Upholstery': [
    '/attached_assets/stock_images/leather_car_seat_uph_29371109.jpg',
    '/attached_assets/stock_images/leather_car_seat_uph_c011c07b.jpg'
  ],
  'Bed Liners': [
    '/attached_assets/stock_images/truck_bed_liner_spra_3d51570c.jpg',
    '/attached_assets/stock_images/truck_bed_liner_spra_6ce34dc3.jpg',
    '/attached_assets/stock_images/truck_bed_liner_spra_c99f7cb5.jpg'
  ],
  'Covers': [
    '/attached_assets/stock_images/truck_tonneau_cover__6d6cdcd2.jpg',
    '/attached_assets/stock_images/truck_tonneau_cover__b490e6b5.jpg'
  ]
};

const defaultImages = [
  '/attached_assets/stock_images/ram_trx_pickup_truck_217aab27.jpg',
  '/attached_assets/stock_images/modern_2026_ram_1500_09365ca7.jpg',
  '/attached_assets/stock_images/lifted_jeep_wrangler_784916fe.jpg'
];

async function assignCategoryImages() {
  console.log('\n========================================');
  console.log('ASSIGNING CATEGORY IMAGES TO PRODUCTS');
  console.log('========================================\n');

  const productList = await db.select({
    id: products.id,
    partNumber: products.partNumber,
    partName: products.partName,
    category: products.category,
    imageUrl: products.imageUrl
  }).from(products).where(
    or(
      isNull(products.imageUrl),
      sql`${products.imageUrl} = ''`,
      sql`${products.imageUrl} LIKE '%placehold%'`,
      sql`${products.imageUrl} LIKE '%/attached_assets/stock_images/%'`
    )
  );

  console.log(`Found ${productList.length} products needing images\n`);

  const stats: Record<string, { total: number; assigned: number }> = {};
  let totalAssigned = 0;

  const productsByCategory: Record<string, typeof productList> = {};
  for (const product of productList) {
    const category = product.category || 'Unknown';
    if (!productsByCategory[category]) {
      productsByCategory[category] = [];
    }
    productsByCategory[category].push(product);
  }

  for (const [category, categoryProducts] of Object.entries(productsByCategory)) {
    const categoryImages = categoryImageMapping[category] || defaultImages;
    stats[category] = { total: categoryProducts.length, assigned: 0 };

    const batchSize = 100;
    for (let i = 0; i < categoryProducts.length; i += batchSize) {
      const batch = categoryProducts.slice(i, i + batchSize);
      
      for (let j = 0; j < batch.length; j++) {
        const product = batch[j];
        const selectedImage = categoryImages[(i + j) % categoryImages.length];
        
        try {
          await db.update(products)
            .set({ imageUrl: selectedImage })
            .where(eq(products.id, product.id));
          
          stats[category].assigned++;
          totalAssigned++;
        } catch (error) {
          console.error(`Error updating product ${product.id}: ${error}`);
        }
      }
      
      console.log(`${category}: ${Math.min(i + batchSize, categoryProducts.length)}/${categoryProducts.length}`);
    }
  }

  console.log('\n========================================');
  console.log('ASSIGNMENT COMPLETE');
  console.log('========================================\n');

  console.log('By Category:');
  for (const [category, data] of Object.entries(stats).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${category}: ${data.assigned}/${data.total}`);
  }

  console.log(`\nTotal assigned: ${totalAssigned}`);
  console.log('\nDone!');
}

assignCategoryImages().catch(console.error);
