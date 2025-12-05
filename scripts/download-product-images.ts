import { db } from '../server/db';
import { products } from '../shared/schema';
import { eq, ilike, isNull, and, SQL } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const IMAGES_DIR = 'attached_assets/product_images';
const DELAY_MS = 150;

async function downloadImage(url: string, filepath: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://www.summitracing.com/'
      }
    });
    
    if (!response.ok) {
      return false;
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('image')) {
      return false;
    }
    
    const buffer = await response.arrayBuffer();
    
    // Verify it's a real image (not a placeholder)
    if (buffer.byteLength < 5000) {
      return false; // Too small, likely a placeholder
    }
    
    fs.writeFileSync(filepath, Buffer.from(buffer));
    return true;
  } catch (error) {
    return false;
  }
}

function buildImageUrls(partNumber: string, manufacturer: string): string[] {
  const urls: string[] = [];
  
  // Clean part number variations
  const normalizedPart = partNumber.toLowerCase().replace(/[\s-]+/g, '');
  const originalPart = partNumber.toLowerCase().replace(/\s+/g, '');
  const upperPart = partNumber.toUpperCase().replace(/\s+/g, '');
  
  // WeatherTech-specific CDN sources (highest priority for WeatherTech products)
  if (manufacturer.toLowerCase().includes('weathertech')) {
    // CARiD WeatherTech CDN - uses part number directly
    urls.push(`https://ic.carid.com/weathertech/products/${partNumber}_1.jpg`);
    urls.push(`https://ic.carid.com/weathertech/products/${upperPart}_1.jpg`);
    urls.push(`https://images.carid.com/weathertech/products/${partNumber}.jpg`);
    urls.push(`https://images.carid.com/weathertech/products/${upperPart}.jpg`);
    
    // WeatherTech floor mats specific patterns
    urls.push(`https://ic.carid.com/weathertech/floor-mats/${partNumber}_1.jpg`);
    urls.push(`https://ic.carid.com/weathertech/floor-mats/${upperPart}_1.jpg`);
    
    // Try oncar images with common vehicle patterns
    urls.push(`https://ic.carid.com/weathertech/products/oncar/${partNumber}_1.jpg`);
    urls.push(`https://images.carid.com/weathertech/products/oncar/${partNumber}.jpg`);
  }
  
  // Summit Racing CDN (works well for WeatherTech, N-Fab, K&N)
  urls.push(`https://static.summitracing.com/global/images/prod/xlarge/mna-${originalPart}_xl.jpg`);
  urls.push(`https://static.summitracing.com/global/images/prod/xlarge/mna-${normalizedPart}_xl.jpg`);
  urls.push(`https://static.summitracing.com/global/images/prod/xlarge/${originalPart}_xl.jpg`);
  
  // WeatherTech brand code patterns for Summit
  if (manufacturer.toLowerCase().includes('weathertech')) {
    urls.push(`https://static.summitracing.com/global/images/prod/xlarge/wet-${originalPart}_xl.jpg`);
    urls.push(`https://static.summitracing.com/global/images/prod/xlarge/wea-${originalPart}_xl.jpg`);
  }
  
  // N-Fab specific patterns
  if (manufacturer.toLowerCase().includes('n-fab') || manufacturer.toLowerCase().includes('nfab')) {
    urls.push(`https://static.summitracing.com/global/images/prod/xlarge/nfb-${originalPart}_xl.jpg`);
    urls.push(`https://static.summitracing.com/global/images/prod/xlarge/nfa-${originalPart}_xl.jpg`);
  }
  
  // K&N specific patterns
  if (manufacturer.toLowerCase().includes('k&n') || manufacturer.toLowerCase().includes('kn')) {
    urls.push(`https://static.summitracing.com/global/images/prod/xlarge/knn-${originalPart}_xl.jpg`);
    urls.push(`https://static.summitracing.com/global/images/prod/xlarge/k&n-${originalPart}_xl.jpg`);
  }
  
  // CARiD CDN patterns (works for many aftermarket parts)
  urls.push(`https://ic.carid.com/products/${upperPart}_1.jpg`);
  urls.push(`https://ic.carid.com/products/${upperPart}.jpg`);
  
  // AutoAnything CDN
  urls.push(`https://images.autoanything.com/hi-res/products/${upperPart}.jpg`);
  
  // RealTruck CDN (for truck accessories)
  urls.push(`https://cdn.realtruck.com/prod-images/${upperPart}.jpg`);
  
  // Try with different suffix variations for WeatherTech
  const basePartWithoutSuffix = originalPart
    .replace(/sk$/i, '')
    .replace(/im$/i, '')
    .replace(/-\d+$/, '');
  
  if (basePartWithoutSuffix !== originalPart) {
    urls.push(`https://static.summitracing.com/global/images/prod/xlarge/mna-${basePartWithoutSuffix}_xl.jpg`);
    // Also try CARiD with base part number
    if (manufacturer.toLowerCase().includes('weathertech')) {
      urls.push(`https://ic.carid.com/weathertech/products/${basePartWithoutSuffix}_1.jpg`);
    }
  }
  
  // Try numeric-only portion for WeatherTech products
  const numericMatch = originalPart.match(/^(\d+)/);
  if (numericMatch && numericMatch[1].length >= 5) {
    const baseNumeric = numericMatch[1];
    if (baseNumeric !== originalPart && baseNumeric !== basePartWithoutSuffix) {
      urls.push(`https://static.summitracing.com/global/images/prod/xlarge/mna-${baseNumeric}_xl.jpg`);
      // Also try CARiD with numeric part
      if (manufacturer.toLowerCase().includes('weathertech')) {
        urls.push(`https://ic.carid.com/weathertech/products/${baseNumeric}_1.jpg`);
      }
    }
  }
  
  return urls;
}

function sanitizeFilename(partNumber: string): string {
  return 'tc-' + partNumber.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadProductImages(manufacturer?: string, limit?: number, dryRun: boolean = false, retryAttempted: boolean = false) {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }
  
  console.log('Fetching products from database...');
  console.log(`Manufacturer filter: ${manufacturer || 'ALL'}`);
  console.log(`Limit: ${limit || 'NONE'}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Retry failed: ${retryAttempted}`);
  
  // Only get products without images AND not previously attempted (unless --retry flag)
  const conditions: SQL[] = [isNull(products.imageUrl)];
  
  if (!retryAttempted) {
    conditions.push(isNull(products.imageAttemptedAt));
  }
  
  if (manufacturer) {
    conditions.push(ilike(products.manufacturer, `%${manufacturer}%`));
  }
  
  let query = db.select({
    id: products.id,
    partNumber: products.partNumber,
    partName: products.partName,
    manufacturer: products.manufacturer,
    imageUrl: products.imageUrl
  }).from(products).where(and(...conditions));
  
  if (limit) {
    query = query.limit(limit) as typeof query;
  }
  
  const productList = await query;
  
  console.log(`Found ${productList.length} products to process\n`);
  
  if (dryRun) {
    console.log('DRY RUN - showing first 10 products:');
    for (let i = 0; i < Math.min(10, productList.length); i++) {
      const p = productList[i];
      console.log(`  ${p.partNumber} | ${p.manufacturer} | ${p.partName}`);
    }
    return;
  }
  
  let downloaded = 0;
  let failed = 0;
  let skipped = 0;
  
  for (let i = 0; i < productList.length; i++) {
    const product = productList[i];
    const filename = `${sanitizeFilename(product.partNumber)}.jpg`;
    const filepath = path.join(IMAGES_DIR, filename);
    
    // Skip if file already exists locally
    if (fs.existsSync(filepath)) {
      const imageUrl = `/${IMAGES_DIR}/${filename}`;
      await db.update(products)
        .set({ imageUrl, updatedAt: new Date() })
        .where(eq(products.id, product.id));
      skipped++;
      continue;
    }
    
    const urls = buildImageUrls(product.partNumber, product.manufacturer || '');
    
    if ((i + 1) % 50 === 0 || i === 0) {
      console.log(`[${i + 1}/${productList.length}] Processing: ${product.partNumber}`);
    }
    
    let success = false;
    let imageSource = '';
    for (const url of urls) {
      success = await downloadImage(url, filepath);
      if (success) {
        // Determine source from URL
        if (url.includes('summitracing')) imageSource = 'summit_racing';
        else if (url.includes('ic.carid.com')) imageSource = 'carid_cdn';
        else if (url.includes('images.carid.com')) imageSource = 'carid_hires';
        else if (url.includes('autoanything')) imageSource = 'autoanything';
        else if (url.includes('realtruck')) imageSource = 'realtruck';
        else imageSource = 'other';
        
        console.log(`  ✓ Downloaded: ${product.partNumber}`);
        break;
      }
    }
    
    if (success) {
      downloaded++;
      
      const imageUrl = `/${IMAGES_DIR}/${filename}`;
      await db.update(products)
        .set({ 
          imageUrl, 
          imageSource,
          imageAttemptedAt: new Date(),
          updatedAt: new Date() 
        })
        .where(eq(products.id, product.id));
    } else {
      failed++;
      // Mark as attempted even if failed
      await db.update(products)
        .set({ 
          imageAttemptedAt: new Date(),
          updatedAt: new Date() 
        })
        .where(eq(products.id, product.id));
    }
    
    await sleep(DELAY_MS);
    
    if ((i + 1) % 100 === 0) {
      console.log(`\nProgress: ${i + 1}/${productList.length} | Downloaded: ${downloaded} | Failed: ${failed} | Skipped: ${skipped}\n`);
    }
  }
  
  console.log('\n========================================');
  console.log('DOWNLOAD COMPLETE');
  console.log('========================================');
  console.log(`Total processed: ${productList.length}`);
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Failed (no image found): ${failed}`);
  console.log(`Skipped (already exists): ${skipped}`);
}

const args = process.argv.slice(2);
const manufacturer = args.find(a => a.startsWith('--manufacturer='))?.split('=')[1];
const limit = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const dryRun = args.includes('--dry-run');
const retryFailed = args.includes('--retry');

downloadProductImages(manufacturer, limit ? parseInt(limit) : undefined, dryRun, retryFailed)
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
