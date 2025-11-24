import { createRequire } from 'module';
const require = createRequire(import.meta.url);

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
    // Use pdf-parse v2 API with PDFParse class
    const { PDFParse } = require('pdf-parse');
    
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = result.text;
    
    // Clean up parser
    await parser.destroy();
    
    console.log(`📄 PDF Parser: Extracted ${text.length} characters of text`);
    
    // Split into lines and clean up
    const lines = text.split('\n').map((line: string) => line.trim()).filter((line: string) => line.length > 0);
    
    let currentProduct: Partial<ParsedProduct> = {};
    let collectingDescription = false;
    const descriptionLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip table of contents entries (lines with "..." or ending with page numbers)
      if (line.includes('....') || line.match(/\.{3,}\s*\d+$/)) {
        continue;
      }
      
      // Skip headers and common non-product lines
      if (line.toLowerCase().match(/^(page|catalog|index|table of contents|accessories|continued)/)) {
        continue;
      }
      
      // Pattern 1: Detect part numbers (flexible - can be anywhere in line)
      // Matches: "ABC-123", "12345-A", "Part: ABC-123", etc.
      // But NOT common words like "Add-A-Tap", "Bed-mount", "four-door"
      const partNumberMatch = line.match(/\b([A-Z0-9]{3,}[-_][A-Z0-9]{2,}[A-Z0-9\-_]*)\b/i);
      
      // Pattern 2: Detect MSRP prices anywhere in line
      // Matches: "$299.99", "$1,234.56", "MSRP: $499", "List Price $499.00"
      const priceMatch = line.match(/(?:MSRP|Price|Retail|List)?[\s:]*\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/i);
      
      // Check if this line starts a new product
      // A real product line should:
      // 1. Have a part number AND a price OR
      // 2. Have a part number and look like a product title (min 10 chars total)
      const hasValidPartNumber = partNumberMatch && partNumberMatch[1].length >= 5;
      const isNewProduct = hasValidPartNumber && (
        priceMatch || // Has price on same line
        line.length >= 15 // Or is a substantial product title
      );
      
      if (isNewProduct && partNumberMatch) {
        // Save previous product if it has a name
        if (currentProduct.name) {
          // Join multi-line description
          if (descriptionLines.length > 0) {
            currentProduct.description = descriptionLines.join(' ').trim();
          }
          products.push(currentProduct as ParsedProduct);
          descriptionLines.length = 0;
        }
        
        // Extract product name (everything after part number)
        const productName = line.replace(partNumberMatch[0], '').trim();
        
        currentProduct = {
          partNumber: partNumberMatch[1],
          name: productName || 'Unknown Product'
        };
        collectingDescription = true;
        
        // Check if price is on the same line
        if (priceMatch) {
          currentProduct.price = priceMatch[1].replace(/,/g, '');
        }
        continue;
      }
      
      // If we have a current product, try to extract more info
      if (currentProduct.name) {
        // Check for price if we don't have one yet
        if (priceMatch && !currentProduct.price) {
          currentProduct.price = priceMatch[1].replace(/,/g, '');
          collectingDescription = false; // Stop collecting description after price
          continue;
        }
        
        // Collect description lines (multi-line support)
        if (collectingDescription && !priceMatch && line.length > 10) {
          // Skip obvious headers/footers
          if (!line.toLowerCase().match(/^(page|catalog|model|year|make|price|msrp|item|qty|quantity)/)) {
            descriptionLines.push(line);
          }
        }
        
        // Detect manufacturer names (expanded list)
        const manufacturerMatch = line.match(/\b(Weathertech|WeatherTech|Universal|Mopar|OEM|Genuine|AutoVentshade|AVS|Husky|Dee Zee|Bushwacker|Bestop|Smittybilt|Rough Country|K&N|AEM|Borla|Magnaflow|Flowmaster|MSD|Holley|Edelbrock|Summit|Jegs)\b/i);
        if (manufacturerMatch && !currentProduct.manufacturer) {
          currentProduct.manufacturer = manufacturerMatch[1];
        }
      }
    }
    
    // Save the last product
    if (currentProduct.name) {
      if (descriptionLines.length > 0) {
        currentProduct.description = descriptionLines.join(' ').trim();
      }
      products.push(currentProduct as ParsedProduct);
    }
    
    console.log(`✅ PDF Parser: Extracted ${products.length} products from catalog`);
    return products;
    
  } catch (error) {
    console.error('❌ PDF Parser Error:', error);
    throw new Error(`Failed to parse PDF catalog: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
