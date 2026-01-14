/**
 * Google Custom Search API Scraper for Mopar Parts
 * Uses official Google API - no CAPTCHA issues!
 *
 * Free tier: 100 queries/day
 * Paid: $5 per 1000 queries
 */

import got from 'got';

/**
 * Safely parse error response body (may be string or object)
 */
function parseErrorBody(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;
  try {
    return JSON.parse(body);
  } catch {
    return { error: { message: body } };
  }
}

export class MoparApiScraper {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GOOGLE_API_KEY;
    this.searchEngineId = options.searchEngineId || process.env.GOOGLE_SEARCH_ENGINE_ID;

    if (!this.apiKey || !this.searchEngineId) {
      throw new Error(
        'Missing Google API credentials. Set GOOGLE_API_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables.\n' +
        'See README.md for setup instructions.'
      );
    }

    // Basic format validation for credentials
    if (this.apiKey.length < 30) {
      throw new Error('GOOGLE_API_KEY appears invalid (too short). Check your credentials.');
    }
    if (!this.searchEngineId.includes(':')) {
      console.warn('Warning: GOOGLE_SEARCH_ENGINE_ID format may be invalid (expected format: xxx:yyy)');
    }

    this.baseUrl = 'https://www.googleapis.com/customsearch/v1';
    this.options = {
      timeout: options.timeout ?? 10000,
      ...options
    };
  }

  async init() {
    // Verify API credentials work
    try {
      const testUrl = `${this.baseUrl}?key=${this.apiKey}&cx=${this.searchEngineId}&q=test&num=1`;
      await got(testUrl).json();
      console.log('Google Custom Search API connected successfully');
    } catch (error) {
      if (error.response) {
        const body = parseErrorBody(error.response.body);
        throw new Error(`API Error: ${body.error?.message || error.response.statusCode}`);
      }
      throw new Error(`Failed to connect to Google API: ${error.message}`);
    }

    return this;
  }

  async close() {
    // No cleanup needed for API-based scraper
  }

  /**
   * Search for a Mopar part number using Google Custom Search API
   */
  async searchPart(partNumber) {
    try {
      // Search for images
      const imageResults = await this.searchImages(partNumber);

      // Search for web results (pricing & description)
      const webResults = await this.searchWeb(partNumber);

      return {
        partNumber,
        ...this.mergeResults(imageResults, webResults),
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
   * Check if an image appears to be a vehicle photo rather than a product photo
   */
  isVehicleImage(title = '', snippet = '') {
    const text = `${title} ${snippet}`.toLowerCase();

    // Vehicle model names that indicate this is a vehicle photo, not a product
    const vehicleModels = [
      'pacifica', 'voyager', 'town & country', 'caravan', 'grand caravan',
      'charger', 'challenger', 'durango', '300', 'chrysler 300',
      'wrangler', 'gladiator', 'grand cherokee', 'cherokee', 'compass', 'renegade',
      'ram 1500', 'ram 2500', 'ram 3500', 'ram truck',
      'dart', 'journey', 'hornet', 'wagon'
    ];

    // Words that indicate this IS a product image (not a vehicle)
    const productWords = ['kit', 'box', 'package', 'part', 'filter', 'intake', 'oem', 'install'];

    // Check if title contains vehicle model without product words
    const hasVehicleModel = vehicleModels.some(model => text.includes(model));
    const hasProductWord = productWords.some(word => text.includes(word));

    // If it has a vehicle model name but no product words, it's likely a vehicle image
    return hasVehicleModel && !hasProductWord;
  }

  /**
   * Search Google Images via API - prioritizes official Mopar CDN images
   * Filters out vehicle photos to prefer actual product images
   */
  async searchImages(partNumber) {
    // Search for the part with "product" to bias toward actual part images
    const query = `${partNumber} mopar product`;
    const url = `${this.baseUrl}?key=${this.apiKey}&cx=${this.searchEngineId}&q=${encodeURIComponent(query)}&searchType=image&num=10&imgSize=large`;

    try {
      let productImages = [];      // cdn-product-images - highest quality product shots
      let officialImages = [];     // Other RevolutionParts CDN
      let moparDealerImages = [];  // Other Mopar dealer sites
      let otherImages = [];
      let vehicleImages = [];      // Vehicle photos (deprioritized)

      const data = await got(url, { timeout: { request: this.options.timeout } }).json();
      const allItems = data.items || [];

      // Categorize images by source and filter vehicle images
      for (const item of allItems) {
        const imageUrl = item.link || '';
        const displayUrl = item.displayLink || '';
        const title = item.title || '';
        const snippet = item.snippet || '';

        // Check if this looks like a vehicle image rather than a product
        const isVehicle = this.isVehicleImage(title, snippet);

        const imageData = {
          link: item.link,
          title: item.title,
          source: 'other',
          isVehicle
        };

        // Categorize by source
        if (imageUrl.includes('cdn-product-images.revolutionparts.io')) {
          imageData.source = 'store.mopar.com';
          if (isVehicle) {
            vehicleImages.push(imageData);
          } else {
            productImages.push(imageData);
          }
        } else if (imageUrl.includes('revolutionparts.io') || imageUrl.includes('revolutionparts.com')) {
          imageData.source = 'store.mopar.com';
          if (isVehicle) {
            vehicleImages.push(imageData);
          } else {
            officialImages.push(imageData);
          }
        } else if (
          displayUrl.includes('mopar') ||
          displayUrl.includes('factoryparts') ||
          imageUrl.includes('mopar')
        ) {
          imageData.source = 'mopar-dealer';
          if (isVehicle) {
            vehicleImages.push(imageData);
          } else {
            moparDealerImages.push(imageData);
          }
        } else {
          if (isVehicle) {
            vehicleImages.push(imageData);
          } else {
            otherImages.push(imageData);
          }
        }
      }

      // Combine: product images first, then official, then dealers, then others
      // Vehicle images go last as fallback
      const sortedImages = [
        ...productImages,
        ...officialImages,
        ...moparDealerImages,
        ...otherImages,
        ...vehicleImages  // Vehicle photos as last resort
      ];

      return {
        imageUrl: sortedImages[0]?.link || null,
        additionalImages: sortedImages.slice(1, 5).map(img => img.link),
        imageTitle: sortedImages[0]?.title || null,
        imageSource: sortedImages[0]?.source || null
      };
    } catch (error) {
      if (error.response) {
        const body = parseErrorBody(error.response.body);
        if (body.error?.code === 429) {
          throw new Error('API quota exceeded - daily limit reached');
        }
        throw new Error(`Image search failed: ${body.error?.message || error.response.statusCode}`);
      }
      throw error;
    }
  }

  /**
   * Search Google Web via API for pricing and description
   */
  async searchWeb(partNumber) {
    const query = `Mopar ${partNumber} price description`;
    const url = `${this.baseUrl}?key=${this.apiKey}&cx=${this.searchEngineId}&q=${encodeURIComponent(query)}&num=5`;

    let data;
    try {
      data = await got(url, { timeout: { request: this.options.timeout } }).json();
    } catch (error) {
      if (error.response) {
        const body = parseErrorBody(error.response.body);
        if (body.error?.code === 429) {
          throw new Error('API quota exceeded - daily limit reached');
        }
        throw new Error(`Web search failed: ${body.error?.message || error.response.statusCode}`);
      }
      throw error;
    }

    const items = data.items || [];

    // Extract prices from snippets - look for both MSRP and sale prices
    let msrp = null;
    let salePrice = null;
    let priceSource = null;
    let title = null;
    let description = null;
    let sourceUrl = null;

    for (const item of items) {
      const snippet = item.snippet || '';
      const itemTitle = item.title || '';

      // Look for price patterns
      if (!msrp || !salePrice) {
        // Find all prices in the snippet
        const allPrices = snippet.match(/\$[\d,]+\.?\d*/g) || [];
        const priceValues = allPrices.map(p => ({
          text: p,
          value: parseFloat(p.replace(/[$,]/g, ''))
        })).filter(p => !isNaN(p.value) && p.value > 0);

        // Check for explicit MSRP/List price labels
        const msrpMatch = snippet.match(/(?:MSRP|List|Regular|Retail)[:\s]*\$[\d,]+\.?\d*/i);
        const saleMatch = snippet.match(/(?:Sale|Now|Price|Our Price|Your Price)[:\s]*\$[\d,]+\.?\d*/i);

        if (msrpMatch && !msrp) {
          const msrpPrice = msrpMatch[0].match(/\$[\d,]+\.?\d*/);
          if (msrpPrice) msrp = msrpPrice[0];
        }

        if (saleMatch && !salePrice) {
          const salePriceMatch = saleMatch[0].match(/\$[\d,]+\.?\d*/);
          if (salePriceMatch) salePrice = salePriceMatch[0];
        }

        // If we found multiple prices but no explicit labels, assume higher is MSRP
        if (priceValues.length >= 2 && (!msrp || !salePrice)) {
          priceValues.sort((a, b) => b.value - a.value);
          if (!msrp) msrp = priceValues[0].text;
          if (!salePrice) salePrice = priceValues[1].text;
        } else if (priceValues.length === 1 && !salePrice) {
          // Single price - use as sale price
          salePrice = priceValues[0].text;
        }

        if ((msrp || salePrice) && !priceSource) {
          priceSource = new URL(item.link).hostname;
        }
      }

      // Get title from first relevant result
      if (!title && itemTitle.toLowerCase().includes('mopar')) {
        title = itemTitle;
        sourceUrl = item.link;
      }

      // Get description
      if (!description && snippet.length > 50) {
        description = snippet;
      }
    }

    // If no title found, use first result
    if (!title && items.length > 0) {
      title = items[0].title;
      sourceUrl = items[0].link;
    }

    if (!description && items.length > 0) {
      description = items[0].snippet;
    }

    return {
      title,
      description,
      msrp,
      salePrice,
      priceSource,
      sourceUrl
    };
  }

  /**
   * Merge results from image and web searches
   */
  mergeResults(imageResults, webResults) {
    return {
      title: webResults.title || '',
      description: webResults.description || '',
      msrp: webResults.msrp || '',
      salePrice: webResults.salePrice || '',
      priceSource: webResults.priceSource || '',
      imageUrl: imageResults.imageUrl || '',
      imageSource: imageResults.imageSource || '',
      additionalImages: imageResults.additionalImages || [],
      sourceUrl: webResults.sourceUrl || ''
    };
  }

  /**
   * Get remaining API quota (approximate)
   */
  async checkQuota() {
    // Google doesn't provide a direct quota check endpoint
    // This makes a minimal query to verify the API is working
    try {
      const url = `${this.baseUrl}?key=${this.apiKey}&cx=${this.searchEngineId}&q=test&num=1`;
      await got(url).json();
      return { status: 'ok', message: 'API is responding' };
    } catch (error) {
      if (error.response) {
        const body = parseErrorBody(error.response.body);
        if (body.error?.code === 429) {
          return { status: 'exceeded', message: 'Daily quota exceeded' };
        }
        return { status: 'error', message: body.error?.message };
      }
      return { status: 'error', message: error.message };
    }
  }
}

export default MoparApiScraper;
