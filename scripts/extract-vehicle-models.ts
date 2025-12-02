import { db } from '../server/db';
import { products } from '@shared/schema';
import { eq, and, or, isNull, sql } from 'drizzle-orm';

const VEHICLE_MODELS: Record<string, string[]> = {
  'Jeep': [
    'Wrangler Unlimited', 'Wrangler', 'Gladiator', 'Grand Cherokee L', 'Grand Cherokee', 
    'Cherokee', 'Compass', 'Renegade', 'Wagoneer', 'Grand Wagoneer', 'Commander'
  ],
  'Dodge': [
    'Durango', 'Challenger', 'Charger', 'Journey', 'Grand Caravan', 'Hornet'
  ],
  'Ram': [
    'Ram 1500 TRX', 'Ram 1500', 'Ram 2500', 'Ram 3500', 'ProMaster'
  ],
  'Chevrolet': [
    'Silverado 1500', 'Silverado 2500', 'Silverado 3500', 'Silverado', 
    'Colorado ZR2', 'Colorado', 'Tahoe', 'Suburban', 'Traverse', 
    'Equinox', 'Blazer', 'Trailblazer', 'Camaro', 'Corvette'
  ],
  'Ford': [
    'F-150 Raptor', 'F-150 Lightning', 'F-150', 'F-250', 'F-350', 
    'Bronco Sport', 'Bronco', 'Ranger', 'Explorer', 'Expedition', 
    'Edge', 'Escape', 'Maverick', 'Mustang Mach-E', 'Mustang'
  ],
  'GMC': [
    'Sierra 1500', 'Sierra 2500', 'Sierra 3500', 'Sierra', 
    'Canyon AT4X', 'Canyon', 'Yukon XL', 'Yukon', 'Acadia', 'Terrain', 'Hummer EV'
  ],
  'Toyota': [
    'Tundra', 'Tacoma', '4Runner', 'Sequoia', 'Land Cruiser', 
    'Highlander', 'RAV4', 'Corolla Cross', 'Venza', 'Sienna', 'GR86'
  ],
  'Nissan': [
    'Titan XD', 'Titan', 'Frontier', 'Armada', 'Pathfinder', 
    'Murano', 'Rogue', 'Kicks', 'Altima', 'Maxima', '370Z', 'Z'
  ],
  'Honda': [
    'Ridgeline', 'Pilot', 'Passport', 'CR-V', 'HR-V', 
    'Odyssey', 'Accord', 'Civic', 'Accord Hybrid'
  ],
  'Subaru': [
    'Outback', 'Forester', 'Crosstrek', 'Ascent', 'Impreza', 
    'Legacy', 'WRX', 'BRZ', 'Solterra'
  ],
  'Acura': [
    'MDX', 'RDX', 'Integra', 'TLX', 'ILX', 'NSX'
  ],
  'Lexus': [
    'LX', 'GX', 'RX', 'NX', 'TX', 'UX', 'ES', 'IS', 'LS', 'LC', 'RC'
  ],
  'Lincoln': [
    'Navigator', 'Aviator', 'Nautilus', 'Corsair'
  ],
  'Cadillac': [
    'Escalade ESV', 'Escalade', 'XT6', 'XT5', 'XT4', 'CT5', 'CT4', 'Lyriq'
  ],
  'Buick': [
    'Enclave', 'Envision', 'Encore GX', 'Encore'
  ],
  'Infiniti': [
    'QX80', 'QX60', 'QX55', 'QX50', 'Q60', 'Q50'
  ],
  'Volkswagen': [
    'Atlas Cross Sport', 'Atlas', 'Tiguan', 'Taos', 'ID.4', 'Jetta', 'Golf', 'Arteon'
  ],
  'Mazda': [
    'CX-90', 'CX-70', 'CX-50', 'CX-5', 'CX-30', 'Mazda3', 'MX-5 Miata'
  ],
  'Mitsubishi': [
    'Outlander', 'Outlander Sport', 'Eclipse Cross', 'Mirage'
  ],
  'Volvo': [
    'XC90', 'XC60', 'XC40', 'V90', 'V60', 'S90', 'S60', 'C40'
  ],
  'KIA': [
    'Telluride', 'Sorento', 'Sportage', 'Seltos', 'Soul', 
    'Carnival', 'K5', 'Forte', 'EV6', 'EV9', 'Stinger'
  ],
  'Chrysler': [
    'Pacifica', '300'
  ]
};

function extractVehicleModel(partName: string, description: string | null, make: string): string | null {
  if (!make || !VEHICLE_MODELS[make]) return null;
  
  const searchText = `${partName || ''} ${description || ''}`.toUpperCase();
  const models = VEHICLE_MODELS[make];
  
  // Sort by length descending to match longer models first (e.g., "Wrangler Unlimited" before "Wrangler")
  const sortedModels = [...models].sort((a, b) => b.length - a.length);
  
  for (const model of sortedModels) {
    const upperModel = model.toUpperCase();
    if (searchText.includes(upperModel)) {
      return model;
    }
  }
  
  // Special patterns for Jeep JL/JK codes
  if (make === 'Jeep') {
    if (searchText.includes('(JL)') || searchText.includes(' JL ') || searchText.includes('JL/') || searchText.includes('/JL')) {
      if (searchText.includes('UNLIMITED') || searchText.includes('4-DOOR') || searchText.includes('4 DOOR')) {
        return 'Wrangler Unlimited';
      }
      return 'Wrangler';
    }
    if (searchText.includes('(JK)') || searchText.includes(' JK ') || searchText.includes('JK/') || searchText.includes('/JK')) {
      if (searchText.includes('UNLIMITED')) {
        return 'Wrangler Unlimited';
      }
      return 'Wrangler';
    }
    if (searchText.includes('(JT)') || searchText.includes(' JT ')) {
      return 'Gladiator';
    }
  }
  
  return null;
}

async function extractVehicleModels() {
  console.log('\n========================================');
  console.log('EXTRACTING VEHICLE MODELS FROM PRODUCTS');
  console.log('========================================\n');

  // Get products with vehicle make but no model
  const productsToUpdate = await db.select({
    id: products.id,
    partName: products.partName,
    description: products.description,
    vehicleMake: products.vehicleMake
  }).from(products).where(
    and(
      sql`${products.vehicleMake} IS NOT NULL AND ${products.vehicleMake} != ''`,
      or(
        isNull(products.vehicleModel),
        eq(products.vehicleModel, '')
      )
    )
  );

  console.log(`Found ${productsToUpdate.length} products with make but no model\n`);

  let updated = 0;
  let notFound = 0;
  const modelCounts: Record<string, Record<string, number>> = {};

  for (const product of productsToUpdate) {
    const extractedModel = extractVehicleModel(
      product.partName, 
      product.description, 
      product.vehicleMake!
    );
    
    if (extractedModel) {
      await db.update(products)
        .set({ vehicleModel: extractedModel })
        .where(eq(products.id, product.id));
      
      // Track counts
      const make = product.vehicleMake!;
      if (!modelCounts[make]) modelCounts[make] = {};
      modelCounts[make][extractedModel] = (modelCounts[make][extractedModel] || 0) + 1;
      
      updated++;
      
      if (updated % 200 === 0) {
        console.log(`Progress: ${updated} products updated...`);
      }
    } else {
      notFound++;
    }
  }

  console.log('\n========================================');
  console.log('EXTRACTION COMPLETE');
  console.log('========================================');
  console.log(`Products updated with model: ${updated}`);
  console.log(`Products without identifiable model: ${notFound}`);
  
  // Show model distribution for top makes
  console.log('\nModel distribution by make:');
  const sortedMakes = Object.entries(modelCounts)
    .sort((a, b) => Object.values(b[1]).reduce((s, n) => s + n, 0) - Object.values(a[1]).reduce((s, n) => s + n, 0))
    .slice(0, 10);
  
  for (const [make, models] of sortedMakes) {
    console.log(`\n  ${make}:`);
    const sortedModels = Object.entries(models).sort((a, b) => b[1] - a[1]);
    for (const [model, count] of sortedModels) {
      console.log(`    ${model}: ${count}`);
    }
  }

  // Final count check
  const finalCount = await db.select({
    count: sql<number>`count(*)`
  }).from(products).where(
    sql`${products.vehicleModel} IS NOT NULL AND ${products.vehicleModel} != ''`
  );

  console.log(`\nTotal products with vehicle model: ${finalCount[0].count}`);
  console.log('\nDone!');
}

extractVehicleModels().catch(console.error);
