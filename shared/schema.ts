import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const products = pgTable("products", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  partNumber: varchar("part_number", { length: 255 }).notNull().unique(),
  partName: text("part_name").notNull(),
  manufacturer: varchar("manufacturer", { length: 255 }).notNull(),
  category: varchar("category", { length: 255 }).notNull(),
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  supplier: varchar("supplier", { length: 255 }),
  creator: varchar("creator", { length: 255 }),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  imageUrl: text("image_url"),
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

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;
export type InsertManufacturer = z.infer<typeof insertManufacturerSchema>;
export type Manufacturer = typeof manufacturers.$inferSelect;
export type InsertVehicleMake = z.infer<typeof insertVehicleMakeSchema>;
export type VehicleMake = typeof vehicleMakes.$inferSelect;
