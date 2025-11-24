export interface ParsedProduct {
  partNumber?: string;
  name: string;
  description?: string;
  price?: string; // MSRP as string (will be normalized later)
  manufacturer?: string;
  category?: string;
  vehicleMake?: string;
}

/**
 * Parse PDF catalog to extract product information
 * This is a smart parser that attempts to detect:
 * - Part numbers (alphanumeric codes like "ABC-123")
 * - Product names
 * - Descriptions (including multi-line)
 * - MSRP pricing (formats like "$299.99" or "$1,234.56")
 */
export async function parsePDFCatalog(buffer: Buffer): Promise<ParsedProduct[]> {
  const products: ParsedProduct[] = [];
  
  try {
    // Dynamic import to avoid ESM/CommonJS compatibility issues
    const { default: pdfParse } = await import('pdf-parse');
    
    // Extract text content from PDF
    const data = await pdfParse(buffer);
    const text = data.text;
    
    // Split into lines and clean up
    const lines = text.split('\n').map((line: string) => line.trim()).filter((line: string) => line.length > 0);
    
    let currentProduct: Partial<ParsedProduct> = {};
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Pattern 1: Detect part numbers at start of line
      // Matches: "ABC-123 Product Name", "12345-A Description"
      const partNumberMatch = line.match(/^([A-Z0-9\-_]{4,20})[\s:]+(.+)/i);
      if (partNumberMatch) {
        // Save previous product if it has a name
        if (currentProduct.name) {
          products.push(currentProduct as ParsedProduct);
        }
        
        currentProduct = {
          partNumber: partNumberMatch[1],
          name: partNumberMatch[2].trim()
        };
        continue;
      }
      
      // Pattern 2: Detect standalone MSRP prices
      // Matches: "$299.99", "$1,234.56", "MSRP: $499"
      const priceMatch = line.match(/(?:MSRP|Price|Retail)?[\s:]*\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i);
      if (priceMatch && currentProduct.name && !currentProduct.price) {
        // Remove commas from price
        currentProduct.price = priceMatch[1].replace(/,/g, '');
        continue;
      }
      
      // Pattern 3: If we have a product but no description, treat longer lines as descriptions
      if (currentProduct.name && !currentProduct.description && line.length > 15 && !line.includes('$')) {
        // Skip common headers/footers
        if (!line.toLowerCase().match(/^(page|catalog|model|year|make)/)) {
          currentProduct.description = line;
        }
      }
      
      // Pattern 4: Detect manufacturer names (common brands)
      const manufacturerMatch = line.match(/^(Weathertech|WeatherTech|Universal|Mopar|OEM|Genuine)/i);
      if (manufacturerMatch && currentProduct.name && !currentProduct.manufacturer) {
        currentProduct.manufacturer = manufacturerMatch[1];
      }
    }
    
    // Save the last product
    if (currentProduct.name) {
      products.push(currentProduct as ParsedProduct);
    }
    
    console.log(`✅ PDF Parser: Extracted ${products.length} products from catalog`);
    return products;
    
  } catch (error) {
    console.error('❌ PDF Parser Error:', error);
    throw new Error(`Failed to parse PDF catalog: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
