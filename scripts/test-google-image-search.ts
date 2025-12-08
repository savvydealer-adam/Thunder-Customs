import { db } from '../server/db';
import { products } from '../shared/schema';
import { eq, or, isNull, not, ilike } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;
const IMAGES_DIR = 'attached_assets/product_images';
const PLACEHOLDER_SIZE = 11279;
const DELAY_MS = 1000;

interface GoogleImageResult {
  title: string;
  link: string;
  displayLink: string;
  mime: string;
  image: {
    contextLink: string;
    height: number;
    width: number;
    byteSize: number;
    thumbnailLink: string;
  };
}

interface GoogleSearchResponse {
  items?: GoogleImageResult[];
  error?: {
    code: number;
    message: string;
  };
}

async function searchGoogleImages(query: string): Promise<GoogleImageResult[]> {
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('q', query);
  url.searchParams.set('cx', GOOGLE_CSE_ID!);
  url.searchParams.set('key', GOOGLE_API_KEY!);
  url.searchParams.set('searchType', 'image');
  url.searchParams.set('num', '5');
  url.searchParams.set('imgType', 'photo');
  url.searchParams.set('safe', 'active');
  
  const response = await fetch(url.toString());
  const data: GoogleSearchResponse = await response.json();
  
  if (data.error) {
    console.error(`  API Error: ${data.error.message}`);
    return [];
  }
  
  return data.items || [];
}

async function downloadImage(url: string, filepath: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    
    if (!response.ok) return false;
    
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('image')) return false;
    
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 5000) return false;
    
    fs.writeFileSync(filepath, Buffer.from(buffer));
    return true;
  } catch (err) {
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
  if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) {
    console.error('Missing GOOGLE_API_KEY or GOOGLE_CSE_ID environment variables');
    console.log('\nTo use this script:');
    console.log('1. Create a Google Cloud project at https://console.cloud.google.com');
    console.log('2. Enable Custom Search API');
    console.log('3. Create an API key');
    console.log('4. Create a Custom Search Engine at https://cse.google.com/cse/all');
    console.log('5. Enable "Image search" and "Search the entire web"');
    console.log('6. Set GOOGLE_API_KEY and GOOGLE_CSE_ID in Secrets');
    process.exit(1);
  }

  const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '10');
  const dryRun = process.argv.includes('--dry-run');
  
  console.log(`Testing Google Image Search for ${limit} products...`);
  if (dryRun) console.log('(DRY RUN - no images will be downloaded)\n');

  const productsWithPlaceholders = await db.select({
    id: products.id,
    partNumber: products.partNumber,
    partName: products.partName,
    manufacturer: products.manufacturer,
    imageUrl: products.imageUrl,
  })
  .from(products)
  .where(or(eq(products.isHidden, false), isNull(products.isHidden)))
  .limit(500);

  const toProcess = productsWithPlaceholders
    .filter(p => {
      if (!p.imageUrl) return true;
      const imagePath = p.imageUrl.replace('/attached_assets/', 'attached_assets/');
      return isPlaceholder(imagePath);
    })
    .slice(0, limit);

  console.log(`Found ${toProcess.length} products with placeholder images\n`);

  let success = 0;
  let failed = 0;
  const results: Array<{product: string, query: string, found: boolean, source?: string}> = [];

  for (const product of toProcess) {
    const searchQuery = `${product.manufacturer} ${product.partNumber} ${product.partName}`.trim();
    console.log(`[${product.partNumber}] Searching: "${searchQuery}"`);
    
    const images = await searchGoogleImages(searchQuery);
    
    if (images.length === 0) {
      console.log(`  No results found`);
      failed++;
      results.push({ product: product.partNumber, query: searchQuery, found: false });
    } else {
      console.log(`  Found ${images.length} results:`);
      
      let downloaded = false;
      for (let i = 0; i < Math.min(3, images.length); i++) {
        const img = images[i];
        console.log(`    ${i + 1}. ${img.displayLink} - ${img.title.substring(0, 50)}...`);
        
        if (!dryRun && !downloaded) {
          const ext = img.mime.includes('png') ? 'png' : 'jpg';
          const filename = `tc-${product.partNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}.${ext}`;
          const filepath = path.join(IMAGES_DIR, filename);
          
          if (await downloadImage(img.link, filepath)) {
            const stats = fs.statSync(filepath);
            if (stats.size > 5000 && stats.size !== PLACEHOLDER_SIZE) {
              console.log(`    ✓ Downloaded from ${img.displayLink} (${Math.round(stats.size / 1024)}KB)`);
              
              const dbPath = `/attached_assets/product_images/${filename}`;
              await db.update(products)
                .set({ imageUrl: dbPath, imageSource: 'google' })
                .where(eq(products.id, product.id));
              
              downloaded = true;
              success++;
              results.push({ product: product.partNumber, query: searchQuery, found: true, source: img.displayLink });
            }
          }
        }
      }
      
      if (dryRun) {
        success++;
        results.push({ product: product.partNumber, query: searchQuery, found: true, source: images[0].displayLink });
      } else if (!downloaded) {
        console.log(`    ✗ Could not download any images`);
        failed++;
        results.push({ product: product.partNumber, query: searchQuery, found: false });
      }
    }
    
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log('\n========== RESULTS ==========');
  console.log(`Total tested: ${toProcess.length}`);
  console.log(`Success: ${success} (${((success / toProcess.length) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${failed}`);
  
  console.log('\n========== DETAILS ==========');
  results.forEach(r => {
    const status = r.found ? '✓' : '✗';
    const source = r.source ? ` -> ${r.source}` : '';
    console.log(`${status} ${r.product}${source}`);
  });
}

main().catch(console.error);
