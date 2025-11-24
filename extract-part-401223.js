import fs from 'fs';

const filePath = './attached_assets/Chevrolet_1764014466750.xls';
const content = fs.readFileSync(filePath, 'utf-8');

// Find all rows in the HTML table
const rows = content.split('<tr>').slice(1); // Skip header

for (const row of rows) {
  if (row.includes('>401223<') && row.includes('Weathertech')) {
    // Extract all cell values
    const cells = row.match(/<td[^>]*>(.*?)<\/td>/g) || [];
    const values = cells.map(cell => {
      const match = cell.match(/<td[^>]*>(.*?)<\/td>/);
      return match ? match[1].trim() : '';
    });
    
    console.log('Found Part 401223 - Weathertech Floor Mats');
    console.log('=====================================');
    console.log('All values:', JSON.stringify(values, null, 2));
    console.log('\nParsed Data:');
    console.log('Part Number:', values[0]);
    console.log('Manufacturer:', values[1]);
    console.log('Category:', values[2]);
    console.log('Description:', values[3]);
    console.log('Supplier:', values[4]);
    console.log('Vehicle Make:', values[5]);
    console.log('Labor Hours:', values[6]);
    console.log('Part Cost:', values[7]);
    console.log('Sales Markup:', values[8]);
    console.log('Sales Operator:', values[9]);
    console.log('Sales Type:', values[10]);
    console.log('Cost to Sales:', values[11]);
    console.log('Sales Installation:', values[12]);
    console.log('Total Cost to Sales:', values[13]);
    console.log('Part MSRP:', values[14]);
    console.log('Retail Markup:', values[15]);
    console.log('Retail Operator:', values[16]);
    console.log('Retail Type:', values[17]);
    console.log('Part Retail:', values[18]);
    console.log('Retail Installation:', values[19]);
    console.log('Total Retail:', values[20]);
    console.log('Stock Quantity:', values[21]);
    break;
  }
}
