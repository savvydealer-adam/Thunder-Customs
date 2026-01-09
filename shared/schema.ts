import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const products = pgTable("products", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  partNumber: varchar("part_number", { length: 255 }).notNull().unique(),
  partName: text("part_name").notNull(),
  manufacturer: varchar("manufacturer", { length: 255 }).notNull(),
  category: varchar("category", { length: 255 }).notNull(),
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  supplier: varchar("supplier", { length: 255 }),
  creator: varchar("creator", { length: 255 }),
  description: text("description"),
  
  // Legacy pricing fields (kept for backward compatibility)
  price: decimal("price", { precision: 10, scale: 2 }), // Part MSRP
  cost: decimal("cost", { precision: 10, scale: 2 }), // Part Cost
  
  // New comprehensive pricing fields
  laborHours: decimal("labor_hours", { precision: 10, scale: 2 }),
  partCost: decimal("part_cost", { precision: 10, scale: 2 }), // Replaces 'cost'
  salesMarkup: decimal("sales_markup", { precision: 10, scale: 2 }),
  salesOperator: varchar("sales_operator", { length: 10 }), // "$" or "%"
  salesType: varchar("sales_type", { length: 10 }), // "PC" (Part Cost) or "PM" (Part MSRP)
  costToSales: decimal("cost_to_sales", { precision: 10, scale: 2 }),
  salesInstallation: decimal("sales_installation", { precision: 10, scale: 2 }),
  totalCostToSales: decimal("total_cost_to_sales", { precision: 10, scale: 2 }),
  partMSRP: decimal("part_msrp", { precision: 10, scale: 2 }),
  retailMarkup: decimal("retail_markup", { precision: 10, scale: 2 }),
  retailOperator: varchar("retail_operator", { length: 10 }), // "$" or "%"
  retailType: varchar("retail_type", { length: 10 }), // "PC" or "PM"
  partRetail: decimal("part_retail", { precision: 10, scale: 2 }), // Customer-facing price
  retailInstallation: decimal("retail_installation", { precision: 10, scale: 2 }),
  totalRetail: decimal("total_retail", { precision: 10, scale: 2 }), // Customer-facing total
  
  imageUrl: text("image_url"),
  imageSource: varchar("image_source", { length: 100 }), // e.g., "summit_racing", "carid", "manual"
  imageAttemptedAt: timestamp("image_attempted_at"), // Track when download was last attempted
  dataSource: varchar("data_source", { length: 50 }).notNull().default('csv'),
  isHidden: boolean("is_hidden").notNull().default(false),
  isPopular: boolean("is_popular").notNull().default(false),
  stockQuantity: integer("stock_quantity").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const categories = pgTable("categories", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description"),
  imageUrl: text("image_url"),
  displayOrder: integer("display_order").default(0),
});

export const manufacturers = pgTable("manufacturers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description"),
  logoUrl: text("logo_url"),
});

export const vehicleMakes = pgTable("vehicle_makes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  displayOrder: integer("display_order").default(0),
});

// Session storage table for Replit Auth
// Reference: blueprint:javascript_log_in_with_replit
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Replit Auth with employee roles
// Reference: blueprint:javascript_log_in_with_replit
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role", { length: 50 }).notNull().default('staff'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Cart items for future authenticated shopping
export const cartItems = pgTable("cart_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id"), // nullable for anonymous carts
  productId: integer("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Leads table for ADF lead submissions
export const leads = pgTable("leads", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  comments: text("comments"),
  cartItems: jsonb("cart_items").notNull(), // Store cart snapshot
  cartTotal: decimal("cart_total", { precision: 10, scale: 2 }),
  adfXml: text("adf_xml"), // Store generated ADF XML
  status: varchar("status", { length: 50 }).notNull().default('new'), // new, contacted, quoted, sold, lost
  submittedBy: varchar("submitted_by"), // User ID if logged in
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
});

export const insertManufacturerSchema = createInsertSchema(manufacturers).omit({
  id: true,
});

export const insertVehicleMakeSchema = createInsertSchema(vehicleMakes).omit({
  id: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertCartItemSchema = createInsertSchema(cartItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;
export type InsertManufacturer = z.infer<typeof insertManufacturerSchema>;
export type Manufacturer = typeof manufacturers.$inferSelect;
export type InsertVehicleMake = z.infer<typeof insertVehicleMakeSchema>;
export type VehicleMake = typeof vehicleMakes.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export type CartItem = typeof cartItems.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;
