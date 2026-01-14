const fs = require('fs');
const cheerio = require('cheerio');
const path = require('path');

const moparBrands = ['Chrysler.xls', 'Dodge.xls', 'Jeep.xls', 'Ram.xls', 'Fiat.xls'];
const inputDir = 'C:/Users/adam/Downloads/adam';

let totalParts = 0;
const brandCounts = {};

for (const file of moparBrands) {
  const filePath = path.join(inputDir, file);
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${file}`);
    continue;
  }

  const html = fs.readFileSync(filePath, 'utf8');
  const $ = cheerio.load(html);
  const rows = $('table tr');
  const count = rows.length - 1; // Subtract header row

  brandCounts[file.replace('.xls', '')] = count;
  totalParts += count;
}

console.log('\nPart counts by brand:');
for (const [brand, count] of Object.entries(brandCounts)) {
  console.log(`  ${brand}: ${count.toLocaleString()}`);
}
console.log(`\nTotal Mopar parts: ${totalParts.toLocaleString()}`);
