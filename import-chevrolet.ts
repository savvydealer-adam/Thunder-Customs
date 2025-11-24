import fs from 'fs';
import { storage } from './server/storage';

function parseProductsFromHTML(content: string, filename?: string) {
  const products: any[] = [];
  
  let vehicleMake: string | undefined;
  
  const titleMatch = content.match(/Pricing Report for (.+?)(?:\s+All)?$/im);
  if (titleMatch) {
    vehicleMake = titleMatch[1].trim();
    console.log(`📋 Found vehicle make: ${vehicleMake}`);
  }

  const tableMatch = content.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    console.log("❌ No table found in XLS file");
    return products;
  }

  const rows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  if (!rows || rows.length < 2) {
    console.log("❌ No data rows found in table");
    return products;
  }

  const extractText = (cell: string): string => {
    return cell
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, '')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  };

  const parseDecimal = (value: string): string | null => {
    if (!value || value.trim() === '') return null;
    const cleaned = value.replace(/[$,]/g, '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed.toFixed(2);
  };

  console.log(`📊 Processing ${rows.length - 1} rows...`);

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!cells || cells.length < 6) continue;

    const partName = extractText(cells[0]);
    const manufacturer = extractText(cells[1]);
    const category = extractText(cells[2]);
    const supplier = extractText(cells[3]);
    const creator = extractText(cells[4]);
    const partNumber = extractText(cells[5]);
    
    // Extract new pricing fields (columns 7-22 in the new format)
    const laborHours = cells.length > 6 ? parseDecimal(extractText(cells[6])) : null;
    const partCost = cells.length > 7 ? parseDecimal(extractText(cells[7])) : null;
    const salesMarkup = cells.length > 8 ? parseDecimal(extractText(cells[8])) : null;
    const salesOperator = cells.length > 9 ? extractText(cells[9]) || null : null;
    const salesType = cells.length > 10 ? extractText(cells[10]) || null : null;
    const costToSales = cells.length > 11 ? parseDecimal(extractText(cells[11])) : null;
    const salesInstallation = cells.length > 12 ? parseDecimal(extractText(cells[12])) : null;
    const totalCostToSales = cells.length > 13 ? parseDecimal(extractText(cells[13])) : null;
    const partMSRP = cells.length > 14 ? parseDecimal(extractText(cells[14])) : null;
    const retailMarkup = cells.length > 15 ? parseDecimal(extractText(cells[15])) : null;
    const retailOperator = cells.length > 16 ? extractText(cells[16]) || null : null;
    const retailType = cells.length > 17 ? extractText(cells[17]) || null : null;
    const partRetail = cells.length > 18 ? parseDecimal(extractText(cells[18])) : null;
    const retailInstallation = cells.length > 19 ? parseDecimal(extractText(cells[19])) : null;
    const totalRetail = cells.length > 20 ? parseDecimal(extractText(cells[20])) : null;

    if (!partName || !manufacturer || !category || !partNumber) {
      continue;
    }

    const manufacturerText = manufacturer.substring(0, 20);
    const partText = partName.substring(0, 25);
    const displayText = `${manufacturerText}+%0A${partText}`;
    const placeholderImageUrl = `https://placehold.co/600x400/1E90FF/FFFFFF?text=${displayText}&font=raleway`;

    products.push({
      partNumber,
      partName,
      manufacturer,
      category,
      vehicleMake,
      supplier: supplier || undefined,
      creator: creator || undefined,
      dataSource: 'csv',
      isHidden: false,
      isPopular: false,
      description: undefined,
      
      // Legacy pricing fields
      price: partMSRP || undefined,
      cost: partCost || undefined,
      
      // New comprehensive pricing fields
      laborHours: laborHours || undefined,
      partCost: partCost || undefined,
      salesMarkup: salesMarkup || undefined,
      salesOperator: salesOperator || undefined,
      salesType: salesType || undefined,
      costToSales: costToSales || undefined,
      salesInstallation: salesInstallation || undefined,
      totalCostToSales: totalCostToSales || undefined,
      partMSRP: partMSRP || undefined,
      retailMarkup: retailMarkup || undefined,
      retailOperator: retailOperator || undefined,
      retailType: retailType || undefined,
      partRetail: partRetail || undefined,
      retailInstallation: retailInstallation || undefined,
      totalRetail: totalRetail || undefined,
      
      imageUrl: placeholderImageUrl,
      stockQuantity: 0,
    });

    // Progress indicator
    if (i % 1000 === 0) {
      console.log(`  Processed ${i}/${rows.length - 1} rows...`);
    }
  }

  return products;
}

async function importChevrolet() {
  try {
    const filePath = 'attached_assets/Chevrolet_1764014466750.xls';
    console.log(`📄 Reading file: ${filePath}\n`);
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const products = parseProductsFromHTML(content, 'Chevrolet_1764014466750.xls');
    
    console.log(`\n✅ Parsed ${products.length} Chevrolet products`);
    console.log(`💾 Importing to database (this may take a minute)...\n`);
    
    const imported = await storage.createProducts(products);
    
    console.log(`\n🎉 SUCCESS! Imported ${imported.length} Chevrolet products`);
    console.log(`\n📊 Sample product:`);
    if (imported.length > 0) {
      const sample = imported[0];
      console.log(`  Name: ${sample.partName}`);
      console.log(`  Part #: ${sample.partNumber}`);
      console.log(`  Labor Hours: ${sample.laborHours}`);
      console.log(`  Part Cost: $${sample.partCost}`);
      console.log(`  Part Retail: $${sample.partRetail}`);
      console.log(`  Retail Installation: $${sample.retailInstallation}`);
      console.log(`  Total Retail: $${sample.totalRetail}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

importChevrolet();
