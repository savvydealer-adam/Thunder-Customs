import { db } from '../server/db';
import { products } from '@shared/schema';
import { eq, or, isNull, sql } from 'drizzle-orm';

const KNOWN_MAKES = [
  'Acura', 'Buick', 'Cadillac', 'Chevrolet', 'Chrysler', 'Dodge', 'Ford', 
  'GMC', 'Honda', 'Infiniti', 'Jeep', 'KIA', 'Lexus', 'Lincoln', 'Mazda', 
  'Mitsubishi', 'Nissan', 'Ram', 'Subaru', 'Toyota', 'Volkswagen', 'Volvo'
];

function extractVehicleMake(partName: string): string | null {
  if (!partName) return null;
  
  const upperName = partName.toUpperCase();
  
  for (const make of KNOWN_MAKES) {
    const upperMake = make.toUpperCase();
    if (upperName.includes(upperMake)) {
      return make;
    }
  }
  
  // Jeep model codes and names (very common in Mopar/Affiliated Accessories)
  if (upperName.includes('WRANGLER') || upperName.includes('GLADIATOR') || upperName.includes('CHEROKEE') ||
      upperName.includes(' JL ') || upperName.includes(' JL/') || upperName.includes('/JL ') ||
      upperName.includes(' JK ') || upperName.includes(' JK/') || upperName.includes('/JK ') ||
      upperName.includes(' JT ') || upperName.includes('(JL)') || upperName.includes('(JK)') ||
      upperName.includes('FOR JL') || upperName.includes('FOR JK') || upperName.includes('JL/GL')) {
    return 'Jeep';
  }
  
  // Dodge models
  if (upperName.includes('DURANGO') || upperName.includes('CHALLENGER') || upperName.includes('CHARGER')) {
    return 'Dodge';
  }
  
  // Ram (separate from Dodge since 2010)
  if (upperName.includes('RAM 1500') || upperName.includes('RAM 2500') || upperName.includes('RAM 3500') ||
      upperName.includes('RAM REBEL') || upperName.includes('RAM TRX')) {
    return 'Ram';
  }
  
  // Chevrolet models
  if (upperName.includes('SILVERADO') || upperName.includes('COLORADO') || upperName.includes('TAHOE') || 
      upperName.includes('SUBURBAN') || upperName.includes('BLAZER') || upperName.includes('EQUINOX') ||
      upperName.includes('TRAVERSE') || upperName.includes('TRAILBLAZER')) {
    return 'Chevrolet';
  }
  
  // Ford models
  if (upperName.includes('F-150') || upperName.includes('F150') || upperName.includes('F-250') ||
      upperName.includes('F-350') || upperName.includes('BRONCO') || upperName.includes('RANGER') || 
      upperName.includes('MUSTANG') || upperName.includes('EXPLORER') || upperName.includes('EXPEDITION') ||
      upperName.includes('MAVERICK')) {
    return 'Ford';
  }
  
  // GMC models  
  if (upperName.includes('SIERRA') || upperName.includes('CANYON') || upperName.includes('YUKON') ||
      upperName.includes('ACADIA') || upperName.includes('TERRAIN')) {
    return 'GMC';
  }
  
  // Toyota models
  if (upperName.includes('TUNDRA') || upperName.includes('TACOMA') || upperName.includes('4RUNNER') || 
      upperName.includes('RAV4') || upperName.includes('HIGHLANDER') || upperName.includes('SEQUOIA') ||
      upperName.includes('LAND CRUISER')) {
    return 'Toyota';
  }
  
  // Nissan models
  if (upperName.includes('FRONTIER') || upperName.includes('TITAN') || upperName.includes('PATHFINDER') ||
      upperName.includes('ARMADA') || upperName.includes('XTERRA') || upperName.includes('ROGUE')) {
    return 'Nissan';
  }
  
  // Honda models
  if (upperName.includes('PILOT') || upperName.includes('CR-V') || upperName.includes('RIDGELINE') || 
      upperName.includes('PASSPORT') || upperName.includes('HR-V')) {
    return 'Honda';
  }
  
  // Subaru models
  if (upperName.includes('OUTBACK') || upperName.includes('FORESTER') || upperName.includes('CROSSTREK') ||
      upperName.includes('ASCENT') || upperName.includes('IMPREZA')) {
    return 'Subaru';
  }
  
  return null;
}

async function extractVehicleMakes() {
  console.log('\n========================================');
  console.log('EXTRACTING VEHICLE MAKES FROM PART NAMES');
  console.log('========================================\n');

  // Get products without vehicle make
  const productsWithoutMake = await db.select({
    id: products.id,
    partNumber: products.partNumber,
    partName: products.partName,
    category: products.category
  }).from(products).where(
    or(
      isNull(products.vehicleMake),
      eq(products.vehicleMake, '')
    )
  );

  console.log(`Found ${productsWithoutMake.length} products without vehicle make\n`);

  let updated = 0;
  let notFound = 0;
  const notFoundProducts: { partNumber: string; partName: string }[] = [];

  for (const product of productsWithoutMake) {
    const extractedMake = extractVehicleMake(product.partName || '');
    
    if (extractedMake) {
      await db.update(products)
        .set({ vehicleMake: extractedMake })
        .where(eq(products.id, product.id));
      
      updated++;
      
      if (updated % 50 === 0) {
        console.log(`Progress: ${updated} products updated...`);
      }
    } else {
      notFound++;
      if (notFoundProducts.length < 20) {
        notFoundProducts.push({
          partNumber: product.partNumber,
          partName: product.partName || ''
        });
      }
    }
  }

  console.log('\n========================================');
  console.log('EXTRACTION COMPLETE');
  console.log('========================================');
  console.log(`Products updated: ${updated}`);
  console.log(`Products without identifiable make: ${notFound}`);
  
  if (notFoundProducts.length > 0) {
    console.log('\nSample products that could not be matched:');
    notFoundProducts.forEach(p => {
      console.log(`  ${p.partNumber}: ${p.partName.substring(0, 80)}...`);
    });
  }

  // Show final count
  const remainingWithoutMake = await db.select({
    count: sql<number>`count(*)`
  }).from(products).where(
    or(
      isNull(products.vehicleMake),
      eq(products.vehicleMake, '')
    )
  );

  console.log(`\nRemaining products without vehicle make: ${remainingWithoutMake[0].count}`);
  console.log('\nDone!');
}

extractVehicleMakes().catch(console.error);
