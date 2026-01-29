import { db } from "../server/db";
import { products } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

async function check() {
  const count = await db
    .select({ count: sql`count(*)` })
    .from(products)
    .where(eq(products.dataSource, "rough_country"));

  console.log("Rough Country products:", count[0].count);

  const sample = await db
    .select()
    .from(products)
    .where(eq(products.dataSource, "rough_country"))
    .limit(1);

  if (sample[0]) {
    console.log("\nSample product:");
    console.log("  Part Number:", sample[0].partNumber);
    console.log("  Part Name:", sample[0].partName);
    console.log("  Manufacturer:", sample[0].manufacturer);
    console.log("  Category:", sample[0].category);
    console.log("  isHidden:", sample[0].isHidden);
    console.log("  Price:", sample[0].price);
    console.log("  Image URL:", sample[0].imageUrl?.substring(0, 60) + "...");
  }

  process.exit(0);
}

check().catch(console.error);
