import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function testScrape() {
  console.log('[Puppeteer] Starting test with stealth plugin...\n');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--disable-blink-features=AutomationControlled',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ]
  });

  try {
    const page = await browser.newPage();
    
    await page.setViewport({ width: 1920, height: 1080 });
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    const testUrl = 'https://www.moparsupply.com/oem-parts/mopar-liquid-gasket-1000a923';
    console.log(`[Puppeteer] Navigating to: ${testUrl}\n`);
    
    const response = await page.goto(testUrl, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    
    console.log(`[Puppeteer] Response status: ${response?.status()}`);
    
    const title = await page.title();
    console.log(`[Puppeteer] Page title: ${title}`);
    
    const pageContent = await page.content();
    const isCloudflare = pageContent.includes('Cloudflare') || 
                         pageContent.includes('cf-browser-verification') ||
                         pageContent.includes('Just a moment') ||
                         pageContent.includes('challenge-platform');
    
    console.log(`[Puppeteer] Cloudflare detected: ${isCloudflare}`);
    
    if (isCloudflare) {
      console.log('\n[Puppeteer] Waiting 10 seconds for Cloudflare challenge...');
      await new Promise(r => setTimeout(r, 10000));
      
      const newContent = await page.content();
      const stillCloudflare = newContent.includes('Just a moment') || 
                              newContent.includes('challenge-platform');
      console.log(`[Puppeteer] Still blocked after wait: ${stillCloudflare}`);
      
      if (stillCloudflare) {
        console.log('\n[Puppeteer] ❌ Cloudflare is blocking us');
        await page.screenshot({ path: 'data/puppeteer-blocked.png' });
        console.log('[Puppeteer] Screenshot saved to data/puppeteer-blocked.png');
        return;
      }
    }

    console.log('\n[Puppeteer] ✅ Page loaded! Extracting data...\n');
    
    const productData = await page.evaluate(() => {
      const getMetaContent = (name: string) => {
        const meta = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
        return meta?.getAttribute('content') || null;
      };

      const priceEl = document.querySelector('[data-price], .product-price, .price, [class*="price"]');
      let price = priceEl?.textContent?.match(/\$[\d,.]+/)?.[0] || null;
      
      if (!price) {
        const priceMatch = document.body.innerHTML.match(/\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
        price = priceMatch?.[0] || null;
      }

      const imgEl = document.querySelector('.product-image img, [class*="product"] img, .gallery img') as HTMLImageElement;
      const image = imgEl?.src || getMetaContent('og:image');

      const descEl = document.querySelector('.product-description, [class*="description"], .description');
      const description = descEl?.textContent?.trim() || getMetaContent('og:description');

      const titleEl = document.querySelector('h1, .product-title, [class*="product-name"]');
      const title = titleEl?.textContent?.trim() || getMetaContent('og:title');

      return { title, price, image, description };
    });

    console.log('Extracted data:');
    console.log(JSON.stringify(productData, null, 2));
    
    await page.screenshot({ path: 'data/puppeteer-success.png', fullPage: true });
    console.log('\n[Puppeteer] Screenshot saved to data/puppeteer-success.png');

  } catch (error: any) {
    console.error('[Puppeteer] Error:', error.message);
  } finally {
    await browser.close();
  }
}

testScrape().catch(console.error);
