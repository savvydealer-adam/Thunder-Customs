/**
 * Google Scraper for Mopar Parts
 * Uses Puppeteer with stealth plugin to avoid detection
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Add stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

export class MoparScraper {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    this.options = {
      headless: options.headless ?? true,
      slowMo: options.slowMo ?? 50, // Slow down actions to appear more human
      timeout: options.timeout ?? 30000,
      userAgent: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...options
    };
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: this.options.headless ? 'new' : false,
      slowMo: this.options.slowMo,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1920,1080',
        '--start-maximized'
      ]
    });

    this.page = await this.browser.newPage();

    // Set viewport and user agent
    await this.page.setViewport({ width: 1920, height: 1080 });
    await this.page.setUserAgent(this.options.userAgent);

    // Set extra headers to appear more legitimate
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });

    return this;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * Search Google for a Mopar part number
   */
  async searchPart(partNumber) {
    const searchQuery = `Mopar ${partNumber} part`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&tbm=isch&tbs=isz:l`;

    try {
      // First search Google Images for product images
      const imageResults = await this.searchGoogleImages(partNumber);

      // Then search Google Shopping for pricing
      const shoppingResults = await this.searchGoogleShopping(partNumber);

      // Then search regular Google for description
      const webResults = await this.searchGoogleWeb(partNumber);

      return {
        partNumber,
        ...this.mergeResults(imageResults, shoppingResults, webResults),
        status: 'success',
        scrapedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Error scraping ${partNumber}:`, error.message);
      return {
        partNumber,
        status: 'error',
        error: error.message,
        scrapedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Search Google Images for product photos
   */
  async searchGoogleImages(partNumber) {
    const searchQuery = `Mopar ${partNumber}`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&tbm=isch`;

    await this.page.goto(url, { waitUntil: 'networkidle2', timeout: this.options.timeout });
    await this.randomDelay(1000, 2000);

    // Check for CAPTCHA
    if (await this.detectCaptcha()) {
      throw new Error('CAPTCHA detected - please solve manually or wait');
    }

    // Extract image URLs
    const images = await this.page.evaluate(() => {
      const results = [];
      const imgElements = document.querySelectorAll('img[data-src], img[src]');

      for (const img of imgElements) {
        const src = img.getAttribute('data-src') || img.getAttribute('src');
        // Filter for actual product images (not icons/thumbnails)
        if (src && src.startsWith('http') && !src.includes('gstatic') && !src.includes('google')) {
          results.push(src);
          if (results.length >= 5) break; // Get top 5 images
        }
      }

      return results;
    });

    // Try to get larger image by clicking on first result
    let largeImage = null;
    try {
      const firstImage = await this.page.$('div[data-ri="0"] img');
      if (firstImage) {
        await firstImage.click();
        await this.randomDelay(1000, 1500);

        largeImage = await this.page.evaluate(() => {
          const sidePanel = document.querySelector('img[data-noaft="1"]');
          return sidePanel ? sidePanel.src : null;
        });
      }
    } catch (e) {
      // Ignore click errors
    }

    return {
      imageUrl: largeImage || images[0] || null,
      additionalImages: images.slice(1, 5)
    };
  }

  /**
   * Search Google Shopping for pricing info
   */
  async searchGoogleShopping(partNumber) {
    const searchQuery = `Mopar ${partNumber}`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&tbm=shop`;

    await this.page.goto(url, { waitUntil: 'networkidle2', timeout: this.options.timeout });
    await this.randomDelay(1000, 2000);

    if (await this.detectCaptcha()) {
      throw new Error('CAPTCHA detected');
    }

    // Extract price from shopping results
    const shoppingData = await this.page.evaluate(() => {
      // Try to find shopping results
      const priceElements = document.querySelectorAll('[data-sh-or] .a8Pemb, .HRLxBb, .T14wmb');
      const titleElements = document.querySelectorAll('[data-sh-or] h3, .tAxDx');

      let price = null;
      let title = null;
      let source = null;

      if (priceElements.length > 0) {
        const priceText = priceElements[0].textContent;
        // Extract price (handle formats like "$123.45" or "From $99.00")
        const priceMatch = priceText.match(/\$[\d,]+\.?\d*/);
        if (priceMatch) {
          price = priceMatch[0];
        }
      }

      if (titleElements.length > 0) {
        title = titleElements[0].textContent.trim();
      }

      // Try to get seller/source
      const sourceEl = document.querySelector('[data-sh-or] .aULzUe, .IuHnof');
      if (sourceEl) {
        source = sourceEl.textContent.trim();
      }

      return { price, title, priceSource: source };
    });

    return shoppingData;
  }

  /**
   * Search regular Google for product description
   */
  async searchGoogleWeb(partNumber) {
    const searchQuery = `Mopar ${partNumber} description specifications`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;

    await this.page.goto(url, { waitUntil: 'networkidle2', timeout: this.options.timeout });
    await this.randomDelay(1000, 2000);

    if (await this.detectCaptcha()) {
      throw new Error('CAPTCHA detected');
    }

    // Extract description from search results
    const webData = await this.page.evaluate(() => {
      // Try featured snippet first
      const snippet = document.querySelector('.hgKElc, .ILfuVd, [data-attrid="description"]');
      if (snippet) {
        return {
          description: snippet.textContent.trim(),
          sourceUrl: document.querySelector('.yuRUbf a')?.href
        };
      }

      // Try first search result description
      const firstResult = document.querySelector('.VwiC3b, .IsZvec');
      const firstLink = document.querySelector('.yuRUbf a');

      return {
        description: firstResult ? firstResult.textContent.trim() : null,
        sourceUrl: firstLink ? firstLink.href : null
      };
    });

    return webData;
  }

  /**
   * Merge results from different search types
   */
  mergeResults(imageResults, shoppingResults, webResults) {
    return {
      title: shoppingResults.title || '',
      description: webResults.description || '',
      price: shoppingResults.price || '',
      priceSource: shoppingResults.priceSource || '',
      imageUrl: imageResults.imageUrl || '',
      additionalImages: imageResults.additionalImages || [],
      sourceUrl: webResults.sourceUrl || ''
    };
  }

  /**
   * Detect if we've hit a CAPTCHA
   */
  async detectCaptcha() {
    const captchaIndicators = await this.page.evaluate(() => {
      const pageText = document.body.innerText.toLowerCase();
      const hasRecaptcha = document.querySelector('#recaptcha, .g-recaptcha, iframe[src*="recaptcha"]');
      const hasUnusualTraffic = pageText.includes('unusual traffic') || pageText.includes('not a robot');

      return hasRecaptcha || hasUnusualTraffic;
    });

    return captchaIndicators;
  }

  /**
   * Random delay to appear more human
   */
  async randomDelay(min = 500, max = 2000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Handle rate limiting by waiting
   */
  async handleRateLimit(waitTime = 60000) {
    console.log(`Rate limited. Waiting ${waitTime / 1000} seconds...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
}

export default MoparScraper;
