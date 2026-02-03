import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

const stealth = StealthPlugin();
stealth.enabledEvasions.delete('iframe.contentWindow');
stealth.enabledEvasions.delete('navigator.plugins');
puppeteer.use(stealth);

async function testScrape() {
  console.log('[Puppeteer v2] Advanced stealth test...\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--allow-running-insecure-content',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080',
      '--start-maximized'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });

  try {
    const page = await browser.newPage();
    
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      (window as any).chrome = { runtime: {} };
      
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: 'denied' } as PermissionStatus)
          : originalQuery(parameters);
    });

    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0'
    });

    console.log('[Puppeteer v2] First, visiting homepage to establish session...');
    await page.goto('https://www.moparsupply.com/', { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    
    console.log('[Puppeteer v2] Homepage loaded, waiting 5 seconds...');
    await new Promise(r => setTimeout(r, 5000));

    const testUrl = 'https://www.moparsupply.com/oem-parts/mopar-liquid-gasket-1000a923';
    console.log(`\n[Puppeteer v2] Now navigating to product: ${testUrl}\n`);
    
    const response = await page.goto(testUrl, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    
    console.log(`[Puppeteer v2] Response status: ${response?.status()}`);
    
    const title = await page.title();
    console.log(`[Puppeteer v2] Page title: ${title}`);
    
    const pageContent = await page.content();
    const isCloudflare = pageContent.includes('Just a moment') ||
                         pageContent.includes('challenge-platform') ||
                         pageContent.includes('Checking your browser');
    
    console.log(`[Puppeteer v2] Cloudflare challenge: ${isCloudflare}`);
    
    if (isCloudflare) {
      console.log('\n[Puppeteer v2] Waiting 15 seconds for JS challenge to solve...');
      await new Promise(r => setTimeout(r, 15000));
      
      const newTitle = await page.title();
      console.log(`[Puppeteer v2] Title after wait: ${newTitle}`);
      
      const newContent = await page.content();
      const stillBlocked = newContent.includes('Just a moment') || 
                           newContent.includes('challenge-platform');
      
      if (stillBlocked) {
        console.log('\n[Puppeteer v2] ❌ Still blocked by Cloudflare');
        await page.screenshot({ path: 'data/puppeteer-v2-blocked.png' });
        return;
      }
    }

    console.log('\n[Puppeteer v2] ✅ Success! Extracting product data...\n');
    
    const productData = await page.evaluate(() => {
      // Get price
      let price = null;
      const priceSelectors = [
        '[data-testid="pdp-price"]',
        '.product-info__price',
        '.price-box .price',
        '.product-price',
        '[class*="Price"]',
        '[class*="price"]'
      ];
      for (let i = 0; i < priceSelectors.length; i++) {
        const el = document.querySelector(priceSelectors[i]);
        if (el && el.textContent) {
          const match = el.textContent.match(/\$[\d,.]+/);
          if (match) {
            price = match[0];
            break;
          }
        }
      }
      if (!price) {
        const bodyMatch = document.body.innerHTML.match(/"price":\s*"?\$?([\d,.]+)/);
        if (bodyMatch) price = '$' + bodyMatch[1];
      }

      // Get image
      let image = null;
      const imgSelectors = [
        '.product-gallery img',
        '.product-image img',
        '[class*="product"] img[src*="cdn"]',
        'img[src*="revolutionparts"]',
        'img[src*="rfrk.com"]'
      ];
      for (let i = 0; i < imgSelectors.length; i++) {
        const el = document.querySelector(imgSelectors[i]);
        if (el && (el as HTMLImageElement).src && !(el as HTMLImageElement).src.includes('placeholder')) {
          image = (el as HTMLImageElement).src;
          break;
        }
      }
      if (!image) {
        const meta = document.querySelector('meta[property="og:image"]');
        if (meta) image = meta.getAttribute('content');
      }

      // Get title and description
      const h1 = document.querySelector('h1');
      const title = h1 ? h1.textContent?.trim() : null;
      
      const descEl = document.querySelector('.product-description, [class*="description"]');
      const description = descEl ? descEl.textContent?.trim()?.substring(0, 200) : null;

      return {
        title: title,
        price: price,
        image: image,
        description: description,
        url: window.location.href
      };
    });

    console.log('Product data:');
    console.log(JSON.stringify(productData, null, 2));
    
    await page.screenshot({ path: 'data/puppeteer-v2-success.png', fullPage: true });
    console.log('\n[Puppeteer v2] Screenshot saved');

  } catch (error: any) {
    console.error('[Puppeteer v2] Error:', error.message);
  } finally {
    await browser.close();
  }
}

testScrape().catch(console.error);
