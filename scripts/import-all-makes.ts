import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

const BATCH_SIZE = 10;
const API_URL = 'http://localhost:5000/api/admin/import-batch';

async function importAllMakes() {
  const assetsDir = path.join(process.cwd(), 'attached_assets');
  const files = fs.readdirSync(assetsDir)
    .filter(f => f.endsWith('.xls'))
    .map(f => path.join(assetsDir, f));

  console.log(`Found ${files.length} XLS files to import`);

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} files)...`);

    const formData = new FormData();
    
    for (const filePath of batch) {
      const fileName = path.basename(filePath);
      const fileBuffer = fs.readFileSync(filePath);
      formData.append('files', fileBuffer, { filename: fileName });
    }

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders(),
      });

      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: Imported ${result.totalImported} products from ${result.filesProcessed}/${result.totalFiles} files`);
      } else {
        console.error(`❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, result.error);
      }
    } catch (error) {
      console.error(`❌ Error processing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
    }

    if (i + BATCH_SIZE < files.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n✅ All files processed!');
}

importAllMakes().catch(console.error);
