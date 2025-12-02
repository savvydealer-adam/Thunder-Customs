import { db } from '../server/db';
import { products } from '@shared/schema';
import { eq, ilike, or, isNull, sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const categoryImageMapping: Record<string, string[]> = {
  'Floor Mats': [
    '/attached_assets/stock_images/car_floor_mats_autom_c96417db.jpg',
    '/attached_assets/stock_images/car_floor_mats_autom_e94789f1.jpg',
    '/attached_assets/stock_images/car_floor_mats_autom_f7f18f83.jpg'
  ],
  'Automotive Accessories': [
    '/attached_assets/stock_images/ram_trx_pickup_truck_217aab27.jpg',
    '/attached_assets/stock_images/ram_trx_pickup_truck_32a43c45.jpg',
    '/attached_assets/stock_images/ram_trx_pickup_truck_72d9e5f2.jpg'
  ],
  'Step and Rocker Bars': [
    '/attached_assets/stock_images/truck_running_boards_0536c715.jpg',
    '/attached_assets/stock_images/truck_running_boards_b02d727b.jpg',
    '/attached_assets/stock_images/truck_running_boards_c6646bc1.jpg'
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
    '/attached_assets/stock_images/truck_bed_tonneau_co_1bfc5fec.jpg',
    '/attached_assets/stock_images/truck_bed_tonneau_co_3dae5dd5.jpg',
    '/attached_assets/stock_images/truck_bed_tonneau_co_58405128.jpg'
  ],
  'Wheel Accessories': [
    '/attached_assets/stock_images/automotive_wheel_rim_5907951b.jpg',
    '/attached_assets/stock_images/automotive_wheel_rim_eddaf288.jpg'
  ],
  'Suspension': [
    '/attached_assets/stock_images/truck_suspension_lif_5162dd0b.jpg',
    '/attached_assets/stock_images/truck_suspension_lif_d328a7e8.jpg'
  ],
  'Deflectors': [
    '/attached_assets/stock_images/wind_deflector_rain__28445704.jpg',
    '/attached_assets/stock_images/wind_deflector_rain__8ae30744.jpg'
  ],
  'Protection Products': [
    '/attached_assets/stock_images/car_paint_protection_db501234.jpg',
    '/attached_assets/stock_images/car_paint_protection_f9ffdb88.jpg'
  ],
  'Splash Guards': [
    '/attached_assets/stock_images/car_mud_flaps_splash_610621eb.jpg',
    '/attached_assets/stock_images/car_mud_flaps_splash_a131552b.jpg'
  ],
  'Upholstery': [
    '/attached_assets/stock_images/leather_car_seat_uph_29371109.jpg',
    '/attached_assets/stock_images/leather_car_seat_uph_c011c07b.jpg'
  ],
  'Bed Liners': [
    '/attached_assets/stock_images/truck_bed_liner_spra_0184f609.jpg',
    '/attached_assets/stock_images/truck_bed_liner_spra_f422b823.jpg'
  ],
  'Covers': [
    '/attached_assets/stock_images/truck_bed_tonneau_co_1bfc5fec.jpg',
    '/attached_assets/stock_images/truck_bed_tonneau_co_3dae5dd5.jpg'
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
      sql`${products.imageUrl} LIKE '%placehold%'`
    )
  );

  console.log(`Found ${productList.length} products needing images\n`);

  const stats: Record<string, { total: number; assigned: number }> = {};
  let totalAssigned = 0;

  for (let i = 0; i < productList.length; i++) {
    const product = productList[i];
    const category = product.category || 'Unknown';
    
    if (!stats[category]) {
      stats[category] = { total: 0, assigned: 0 };
    }
    stats[category].total++;

    const categoryImages = categoryImageMapping[category] || defaultImages;
    const selectedImage = categoryImages[i % categoryImages.length];

    try {
      await db.update(products)
        .set({ imageUrl: selectedImage })
        .where(eq(products.id, product.id));
      
      stats[category].assigned++;
      totalAssigned++;
    } catch (error) {
      console.error(`Error updating product ${product.id}: ${error}`);
    }

    if ((i + 1) % 500 === 0) {
      console.log(`Progress: ${i + 1}/${productList.length} (${totalAssigned} assigned)`);
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
