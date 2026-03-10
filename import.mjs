import pg from "pg";
import fs from "fs";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const pool = new pg.Pool({ connectionString: DATABASE_URL });

function parseCSVFull(text) {
  const rows = [];
  let row = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) { row.push(current); current = ""; }
    else if (ch === "\n" && !inQuotes) {
      row.push(current); current = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else if (ch === "\r" && !inQuotes) { /* skip */ }
    else current += ch;
  }
  if (current) row.push(current);
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) rows.push(row);
  return rows;
}

function convertTimestamp(val) {
  if (!val || val === "") return null;
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch {}
  return val;
}

const TIMESTAMP_COLS = new Set([
  "created_at", "updated_at", "contacted_at", "completed_at",
  "image_attempted_at", "expire"
]);

const IDENTITY_TABLES = new Set([
  "products", "categories", "manufacturers", "vehicle_makes", "leads", "orders"
]);

async function importTable(tableName, csvFile) {
  const csvPath = `C:/Users/adam/Downloads/db_backup/db_backup/${csvFile}`;
  const text = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCSVFull(text);
  if (rows.length < 2) { console.log(`  ${tableName}: no data, skipping`); return; }

  const allHeaders = rows[0];
  const dataRows = rows.slice(1);

  const skipId = IDENTITY_TABLES.has(tableName);
  const headerIdxs = [];
  const headers = [];
  for (let i = 0; i < allHeaders.length; i++) {
    if (skipId && allHeaders[i] === "id") continue;
    headerIdxs.push(i);
    headers.push(allHeaders[i]);
  }

  console.log(`  ${tableName}: ${dataRows.length} rows`);

  const batchSize = 200;
  let imported = 0;

  for (let b = 0; b < dataRows.length; b += batchSize) {
    const batch = dataRows.slice(b, b + batchSize);
    const values = [];
    const placeholders = [];
    let paramIdx = 1;

    for (const row of batch) {
      const rowPH = [];
      for (const ci of headerIdxs) {
        let val = row[ci] ?? "";
        if (val === "") val = null;
        else if (val === "true") val = true;
        else if (val === "false") val = false;
        else if (TIMESTAMP_COLS.has(allHeaders[ci])) val = convertTimestamp(val);
        values.push(val);
        rowPH.push(`$${paramIdx++}`);
      }
      placeholders.push(`(${rowPH.join(",")})`);
    }

    const cols = headers.map(h => `"${h}"`).join(",");
    const sql = `INSERT INTO "${tableName}" (${cols}) VALUES ${placeholders.join(",")} ON CONFLICT DO NOTHING`;

    try {
      await pool.query(sql, values);
      imported += batch.length;
    } catch (err) {
      for (const row of batch) {
        const sv = [];
        const sp = [];
        let si = 1;
        for (const ci of headerIdxs) {
          let val = row[ci] ?? "";
          if (val === "") val = null;
          else if (val === "true") val = true;
          else if (val === "false") val = false;
          else if (TIMESTAMP_COLS.has(allHeaders[ci])) val = convertTimestamp(val);
          sv.push(val);
          sp.push(`$${si++}`);
        }
        try {
          await pool.query(`INSERT INTO "${tableName}" (${cols}) VALUES (${sp.join(",")}) ON CONFLICT DO NOTHING`, sv);
          imported++;
        } catch {}
      }
    }

    if ((b + batchSize) % 10000 < batchSize || b + batchSize >= dataRows.length) {
      console.log(`    ${Math.min(b + batchSize, dataRows.length)}/${dataRows.length}`);
    }
  }
  console.log(`  ${tableName}: ${imported} imported`);
}

async function main() {
  console.log("Starting import...");
  await importTable("users", "users.csv");
  await importTable("categories", "categories.csv");
  await importTable("manufacturers", "manufacturers.csv");
  await importTable("vehicle_makes", "vehicle_makes.csv");
  await importTable("products", "products.csv");
  await importTable("leads", "leads.csv");
  await importTable("orders", "orders.csv");
  console.log("Import complete!");
  await pool.end();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
