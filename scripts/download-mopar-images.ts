import { db } from '../server/db';
import { products } from '../shared/schema';
import { eq, or, isNull, and, inArray } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const IMAGES_DIR = 'attached_assets/product_images';
const DELAY_MS = 500;
const PLACEHOLDER_SIZE = 11279;

async function fetchMoparImage(partNumber: string): Promise<string | null> {
  const cleanPart = partNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
  const upperPart = partNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  const searchUrls = [
    `https://www.moparpartsonsale.com/oem-parts/mopar-${cleanPart}`,
    `https://www.moparpartsonsale.com/search?search_str=${upperPart}`,
  ];
  
  for (const searchUrl of searchUrls) {
    try {
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        }
      });
      
      if (!response.ok) continue;
      
      const html = await response.text();
      
      const imageMatch = html.match(/https:\/\/cdn\.revolutionparts\.io\/images\/[a-f0-9]+\/[a-f0-9]+\.jpg/);
      if (imageMatch) {
        return imageMatch[0];
      }
    } catch (error) {
      console.log(`  Error fetching ${searchUrl}:`, error);
    }
  }
  
  return null;
}

async function downloadImage(url: string, filepath: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      }
    });
    
    if (!response.ok) return false;
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('image')) return false;
    
    const buffer = await response.arrayBuffer();
    
    if (buffer.byteLength < 5000 || buffer.byteLength === PLACEHOLDER_SIZE) {
      return false;
    }
    
    fs.writeFileSync(filepath, Buffer.from(buffer));
    return true;
  } catch (error) {
    return false;
  }
}

function isPlaceholder(imagePath: string): boolean {
  try {
    const stats = fs.statSync(imagePath);
    return stats.size === PLACEHOLDER_SIZE;
  } catch {
    return true;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '50');
  const dryRun = args.includes('--dry-run');
  const manufacturer = args.find(a => a.startsWith('--manufacturer='))?.split('=')[1];
  
  console.log('Mopar Image Downloader');
  console.log('======================');
  console.log(`Limit: ${limit}, Dry run: ${dryRun}`);
  if (manufacturer) console.log(`Manufacturer filter: ${manufacturer}`);
  
  const moparManufacturers = ['Mopar', 'Jeep', 'RAM', 'Dodge', 'Chrysler'];
  const targetManufacturers = manufacturer ? [manufacturer] : moparManufacturers;
  
  const productsToProcess = await db.select({
    id: products.id,
    partNumber: products.partNumber,
    partName: products.partName,
    manufacturer: products.manufacturer,
    imageUrl: products.imageUrl,
  })
  .from(products)
  .where(
    and(
      inArray(products.manufacturer, targetManufacturers),
      or(eq(products.isHidden, false), isNull(products.isHidden))
    )
  )
  .limit(limit * 2);
  
  const productsWithPlaceholders = productsToProcess.filter(p => {
    if (!p.imageUrl) return true;
    const imagePath = p.imageUrl.replace('/attached_assets/', 'attached_assets/');
    return isPlaceholder(imagePath);
  }).slice(0, limit);
  
  console.log(`\nFound ${productsWithPlaceholders.length} products with placeholder images`);
  
  if (dryRun) {
    console.log('\nDry run - would process these products:');
    productsWithPlaceholders.slice(0, 10).forEach(p => {
      console.log(`  ${p.partNumber}: ${p.partName?.substring(0, 50)}`);
    });
    return;
  }
  
  let downloaded = 0;
  let failed = 0;
  
  for (const product of productsWithPlaceholders) {
    console.log(`\nProcessing ${product.partNumber}...`);
    
    const imageUrl = await fetchMoparImage(product.partNumber);
    
    if (!imageUrl) {
      console.log(`  No image found`);
      failed++;
      continue;
    }
    
    console.log(`  Found: ${imageUrl.substring(0, 60)}...`);
    
    const filename = `tc-${product.partNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}.jpg`;
    const filepath = path.join(IMAGES_DIR, filename);
    
    const success = await downloadImage(imageUrl, filepath);
    
    if (success) {
      const dbPath = `/attached_assets/product_images/${filename}`;
      await db.update(products)
        .set({ 
          imageUrl: dbPath,
          imageSource: 'revolutionparts'
        })
        .where(eq(products.id, product.id));
      
      console.log(`  Downloaded successfully`);
      downloaded++;
    } else {
      console.log(`  Download failed`);
      failed++;
    }
    
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
  }
  
  console.log('\n======================');
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);
