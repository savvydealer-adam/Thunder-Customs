import fs from 'fs';
import { parsePDFCatalog } from './server/pdfParser';
import { storage } from './server/storage';
import { InsertProduct } from './shared/schema';

async function importPDFToDatabase() {
  try {
    const pdfPath = 'attached_assets/affiliated-accessories-4544 11242025_1764011419744.pdf';
    console.log(`📄 Reading PDF: ${pdfPath}\n`);
    
    const pdfBuffer = fs.readFileSync(pdfPath);
    const parsedProducts = await parsePDFCatalog(pdfBuffer);
    
    // Filter to only products with MSRP pricing (these are the real products)
    const productsWithPricing = parsedProducts.filter(p => p.price);
    console.log(`\n✅ Found ${productsWithPricing.length} products with MSRP pricing\n`);
    
    // Normalize and map to InsertProduct format with unique part numbers
    const timestamp = Date.now();
    const productsToImport: InsertProduct[] = productsWithPricing.map((p, index) => {
      // Normalize MSRP to canonical "XX.YY" format
      let normalizedPrice: string | null = null;
      if (p.price) {
        const priceMatch = p.price.match(/^\d+(\.\d{1,2})?$/);
        if (priceMatch) {
          normalizedPrice = parseFloat(p.price).toFixed(2);
        }
      }

      // Generate unique part number based on timestamp and index
      const uniquePartNumber = `AA-${timestamp}-${String(index).padStart(4, '0')}`;

      return {
        partNumber: uniquePartNumber,
        partName: p.name.substring(0, 100), // Limit to 100 chars
        description: p.description ? p.description.substring(0, 500) : null,
        manufacturer: p.manufacturer || 'Affiliated Accessories',
        category: 'Automotive Accessories',
        vehicleMake: p.vehicleMake || null,
        price: normalizedPrice,
        cost: null,
        stockQuantity: null,
        imageUrl: null,
        hidden: false,
      };
    });

    console.log(`💾 Importing ${productsToImport.length} products to database...\n`);
    
    // Import products (upsert based on part number)
    const createdProducts = await storage.createProducts(productsToImport);
    
    console.log(`\n✅ SUCCESS! Imported ${createdProducts.length} products from PDF catalog`);
    console.log(`\n📋 Sample imported products:`);
    createdProducts.slice(0, 5).forEach((p, idx) => {
      console.log(`\n${idx + 1}. ${p.partName}`);
      console.log(`   Part #: ${p.partNumber}`);
      console.log(`   MSRP: $${p.price}`);
      console.log(`   Manufacturer: ${p.manufacturer}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

importPDFToDatabase();
