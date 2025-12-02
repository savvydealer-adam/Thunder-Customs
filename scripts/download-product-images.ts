import { db } from '../server/db';
import { products } from '../shared/schema';
import { eq, ilike, isNull, or, sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const IMAGES_DIR = 'attached_assets/product_images';
const DELAY_MS = 100;

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
    fs.writeFileSync(filepath, Buffer.from(buffer));
    return true;
  } catch (error) {
    return false;
  }
}

function buildSummitRacingUrls(partNumber: string): string[] {
  const urls: string[] = [];
  const normalizedPart = partNumber.toLowerCase().replace(/\s+/g, '');
  
  urls.push(`https://static.summitracing.com/global/images/prod/xlarge/mna-${normalizedPart}_xl.jpg`);
  
  const basePartWithoutSuffix = normalizedPart
    .replace(/sk$/i, '')
    .replace(/im$/i, '')
    .replace(/-\d+$/, '');
  
  if (basePartWithoutSuffix !== normalizedPart) {
    urls.push(`https://static.summitracing.com/global/images/prod/xlarge/mna-${basePartWithoutSuffix}_xl.jpg`);
  }
  
  const numericMatch = normalizedPart.match(/^(\d+)/);
  if (numericMatch && numericMatch[1].length >= 5) {
    const baseNumeric = numericMatch[1];
    if (baseNumeric !== normalizedPart && baseNumeric !== basePartWithoutSuffix) {
      urls.push(`https://static.summitracing.com/global/images/prod/xlarge/mna-${baseNumeric}_xl.jpg`);
    }
  }
  
  return urls;
}

function sanitizeFilename(partNumber: string): string {
  return partNumber.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadProductImages(manufacturer?: string, limit?: number) {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }
  
  console.log('Fetching products from database...');
  
  const conditions = [];
  
  if (manufacturer) {
    conditions.push(ilike(products.manufacturer, `%${manufacturer}%`));
  }
  
  conditions.push(
    or(
      isNull(products.imageUrl),
      sql`${products.imageUrl} = ''`,
      sql`${products.imageUrl} LIKE '%placehold%'`
    )
  );
  
  let query = db.select({
    id: products.id,
    partNumber: products.partNumber,
    partName: products.partName,
    manufacturer: products.manufacturer,
    imageUrl: products.imageUrl
  }).from(products).where(sql`${sql.join(conditions, sql` AND `)}`);
  
  if (limit) {
    query = query.limit(limit) as typeof query;
  }
  
  const productList = await query;
  
  console.log(`Found ${productList.length} products to process`);
  
  let downloaded = 0;
  let failed = 0;
  let skipped = 0;
  
  for (let i = 0; i < productList.length; i++) {
    const product = productList[i];
    const filename = `${sanitizeFilename(product.partNumber)}.jpg`;
    const filepath = path.join(IMAGES_DIR, filename);
    
    if (fs.existsSync(filepath)) {
      skipped++;
      continue;
    }
    
    const urls = buildSummitRacingUrls(product.partNumber);
    
    console.log(`[${i + 1}/${productList.length}] Downloading: ${product.partNumber}`);
    
    let success = false;
    for (const url of urls) {
      success = await downloadImage(url, filepath);
      if (success) {
        console.log(`  ✓ Downloaded from: ${url.split('/').pop()}`);
        break;
      }
    }
    
    if (success) {
      downloaded++;
      
      const imageUrl = `/${IMAGES_DIR}/${filename}`;
      await db.update(products)
        .set({ imageUrl, updatedAt: new Date() })
        .where(eq(products.id, product.id));
    } else {
      failed++;
      console.log(`  ✗ Failed: ${product.partNumber} (tried ${urls.length} URLs)`);
    }
    
    await sleep(DELAY_MS);
    
    if ((i + 1) % 50 === 0) {
      console.log(`\nProgress: ${i + 1}/${productList.length} | Downloaded: ${downloaded} | Failed: ${failed} | Skipped: ${skipped}\n`);
    }
  }
  
  console.log('\n========================================');
  console.log('DOWNLOAD COMPLETE');
  console.log('========================================');
  console.log(`Total processed: ${productList.length}`);
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped (already exists): ${skipped}`);
}

const args = process.argv.slice(2);
const manufacturer = args.find(a => a.startsWith('--manufacturer='))?.split('=')[1];
const limit = args.find(a => a.startsWith('--limit='))?.split('=')[1];

downloadProductImages(manufacturer, limit ? parseInt(limit) : undefined)
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
