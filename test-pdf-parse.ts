import fs from 'fs';
import { parsePDFCatalog } from './server/pdfParser';

async function testPDFParse() {
  try {
    const pdfPath = 'attached_assets/affiliated-accessories-4544 11242025_1764011419744.pdf';
    console.log(`📄 Reading PDF: ${pdfPath}`);
    
    const pdfBuffer = fs.readFileSync(pdfPath);
    console.log(`📦 File size: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    
    console.log('\n🔍 Parsing PDF catalog...\n');
    const products = await parsePDFCatalog(pdfBuffer);
    
    console.log(`\n✅ Extracted ${products.length} products\n`);
    
    // Show first 10 products
    console.log('📋 Sample products (first 10):');
    products.slice(0, 10).forEach((p, idx) => {
      console.log(`\n${idx + 1}. ${p.name}`);
      console.log(`   Part #: ${p.partNumber || 'N/A'}`);
      console.log(`   MSRP: ${p.price ? '$' + p.price : 'N/A'}`);
      console.log(`   Manufacturer: ${p.manufacturer || 'N/A'}`);
      if (p.description) {
        console.log(`   Description: ${p.description.substring(0, 100)}${p.description.length > 100 ? '...' : ''}`);
      }
    });
    
    // Statistics
    const withPrice = products.filter(p => p.price).length;
    const withDescription = products.filter(p => p.description).length;
    const withManufacturer = products.filter(p => p.manufacturer).length;
    
    console.log(`\n📊 Statistics:`);
    console.log(`   Total products: ${products.length}`);
    console.log(`   With MSRP: ${withPrice} (${((withPrice / products.length) * 100).toFixed(1)}%)`);
    console.log(`   With description: ${withDescription} (${((withDescription / products.length) * 100).toFixed(1)}%)`);
    console.log(`   With manufacturer: ${withManufacturer} (${((withManufacturer / products.length) * 100).toFixed(1)}%)`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testPDFParse();
