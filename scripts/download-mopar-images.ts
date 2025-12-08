import { db } from '../server/db';
import { products } from '../shared/schema';
import { eq, or, isNull, and, inArray } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const IMAGES_DIR = 'attached_assets/product_images';
const DELAY_MS = 800;
const PLACEHOLDER_SIZE = 11279;

const CDN_BASE = 'https://d2dkltr9lfc7et.cloudfront.net';

async function fetchMoparOnlinePartsImage(partNumber: string): Promise<string | null> {
  const cleanPart = partNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
  const url = `https://www.moparonlineparts.com/sku/${cleanPart}.html`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    
    const imageMatch = html.match(/d2dkltr9lfc7et\.cloudfront\.net\/production\/catalog\/product\/[^"'\s]+\.(jpg|png)/gi);
    if (imageMatch && imageMatch.length > 0) {
      const imageUrl = imageMatch.find(url => !url.includes('cache') && !url.includes('thumbnail'));
      if (imageUrl) {
        return 'https://' + imageUrl;
      }
      return 'https://' + imageMatch[0];
    }
  } catch (error) {
    console.log(`  Error fetching MoparOnlineParts:`, error);
  }
  
  return null;
}

async function fetchMoparPartsGiantImage(partNumber: string): Promise<string | null> {
  const cleanPart = partNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
  const url = `https://www.moparpartsgiant.com/parts/mopar-*~${cleanPart}.html`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow'
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    
    const imageMatch = html.match(/https?:\/\/[^"'\s]+moparpartsgiant[^"'\s]+\.(jpg|png)/gi);
    if (imageMatch && imageMatch.length > 0) {
      return imageMatch[0];
    }
  } catch (error) {
    console.log(`  Error fetching MoparPartsGiant:`, error);
  }
  
  return null;
}

async function tryDirectCDN(partNumber: string): Promise<string | null> {
  const cleanPart = partNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
  const char1 = cleanPart.charAt(0);
  const char2 = cleanPart.charAt(1);
  
  const variations = [
    `${CDN_BASE}/production/catalog/product/${char1}/${char2}/${cleanPart}.jpg`,
    `${CDN_BASE}/production/catalog/product/${char1}/${char2}/${cleanPart}-1.jpg`,
    `${CDN_BASE}/production/catalog/product/${char1}/${char2}/${cleanPart}-19.jpg`,
    `${CDN_BASE}/production/catalog/product/${char1}/${char2}/${cleanPart.toUpperCase()}.jpg`,
    `${CDN_BASE}/production/catalog/product/${char1}/${char2}/${cleanPart.toUpperCase()}-1.jpg`,
  ];
  
  for (const url of variations) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        return url;
      }
    } catch {}
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
    const fullPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
    const stats = fs.statSync(fullPath);
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
  
  console.log('Mopar Image Downloader v2');
  console.log('=========================');
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
  .limit(limit * 3);
  
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
    console.log(`\n[${downloaded + failed + 1}/${productsWithPlaceholders.length}] ${product.partNumber}...`);
    
    let imageUrl = await fetchMoparOnlinePartsImage(product.partNumber);
    let source = 'moparonlineparts';
    
    if (!imageUrl) {
      imageUrl = await tryDirectCDN(product.partNumber);
      source = 'cloudfront-direct';
    }
    
    if (!imageUrl) {
      console.log(`  No image found`);
      failed++;
      await new Promise(resolve => setTimeout(resolve, 300));
      continue;
    }
    
    console.log(`  Found: ${imageUrl.substring(0, 70)}...`);
    
    const filename = `tc-${product.partNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}.jpg`;
    const filepath = path.join(IMAGES_DIR, filename);
    
    const success = await downloadImage(imageUrl, filepath);
    
    if (success) {
      const dbPath = `/attached_assets/product_images/${filename}`;
      await db.update(products)
        .set({ 
          imageUrl: dbPath,
          imageSource: source
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
  
  console.log('\n=========================');
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success rate: ${((downloaded / (downloaded + failed)) * 100).toFixed(1)}%`);
}

main().catch(console.error);
