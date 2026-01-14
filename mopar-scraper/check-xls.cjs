const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('C:/Users/adam/Downloads/adam/Jeep.xls', 'utf8');
const $ = cheerio.load(html);

// Find the table
const rows = $('table tr');
console.log('Total rows in table:', rows.length);

// Get headers from first row
const headers = [];
rows.first().find('th, td').each((i, el) => {
  headers.push($(el).text().trim());
});
console.log('Headers:', headers);

// Get a few sample data rows
for (let i = 1; i <= 3; i++) {
  const row = [];
  rows.eq(i).find('td').each((j, el) => {
    row.push($(el).text().trim());
  });
  console.log(`Row ${i}:`, row);
}
