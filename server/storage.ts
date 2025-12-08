// Reference: blueprint:javascript_log_in_with_replit
import { products, categories, manufacturers, vehicleMakes, users, type Product, type InsertProduct, type Category, type InsertCategory, type Manufacturer, type InsertManufacturer, type VehicleMake, type InsertVehicleMake, type User, type UpsertUser } from "@shared/schema";
import { db } from "./db";
import { eq, ilike, and, or, inArray, sql, isNull } from "drizzle-orm";

export interface PaginatedProducts {
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ProductFilters {
  category?: string;
  manufacturer?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface IStorage {
  getProducts(filters?: ProductFilters): Promise<PaginatedProducts>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  createProducts(products: InsertProduct[]): Promise<Product[]>;
  updateProduct(id: number, updates: Partial<InsertProduct>): Promise<Product | undefined>;
  getProductsWithoutImages(): Promise<Product[]>;
  updateProductImage(id: number, imageUrl: string): Promise<boolean>;
  getCategories(): Promise<Category[]>;
  getManufacturers(): Promise<Manufacturer[]>;
  getVehicleMakes(): Promise<VehicleMake[]>;
  
  // User operations for Replit Auth
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUserRole(id: string, role: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getProducts(filters?: ProductFilters): Promise<PaginatedProducts> {
    const page = filters?.page || 1;
    const pageSize = Math.min(filters?.pageSize || 50, 100); // Cap at 100
    const offset = (page - 1) * pageSize;
    
    const conditions = [];
    
    // Exclude hidden products (but include NULL values which are not explicitly hidden)
    conditions.push(or(eq(products.isHidden, false), isNull(products.isHidden)));
    
    if (filters?.category) {
      conditions.push(eq(products.category, filters.category));
    }
    if (filters?.manufacturer) {
      conditions.push(eq(products.manufacturer, filters.manufacturer));
    }
    if (filters?.vehicleMake) {
      conditions.push(eq(products.vehicleMake, filters.vehicleMake));
    }
    if (filters?.vehicleModel) {
      conditions.push(eq(products.vehicleModel, filters.vehicleModel));
    }
    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(products.partName, searchTerm),
          ilike(products.partNumber, searchTerm),
          ilike(products.manufacturer, searchTerm)
        )
      );
    }

    const whereClause = and(...conditions);

    // Get total count first (optimized query)
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(whereClause);
    
    const total = countResult?.count || 0;

    // Get paginated products with only essential fields for list view
    const productList = await db
      .select({
        id: products.id,
        partNumber: products.partNumber,
        partName: products.partName,
        manufacturer: products.manufacturer,
        category: products.category,
        vehicleMake: products.vehicleMake,
        vehicleModel: products.vehicleModel,
        price: products.price,
        partMSRP: products.partMSRP,
        totalRetail: products.totalRetail,
        imageUrl: products.imageUrl,
        isPopular: products.isPopular,
        isHidden: products.isHidden,
        stockQuantity: products.stockQuantity,
      })
      .from(products)
      .where(whereClause)
      .orderBy(products.partName)
      .limit(pageSize)
      .offset(offset);

    return {
      products: productList as Product[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product || undefined;
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const [product] = await db
      .insert(products)
      .values(insertProduct)
      .returning();
    return product;
  }

  async createProducts(insertProducts: InsertProduct[]): Promise<Product[]> {
    if (insertProducts.length === 0) return [];
    
    const createdProducts = await db
      .insert(products)
      .values(insertProducts)
      .onConflictDoUpdate({
        target: products.partNumber,
        set: {
          partName: sql`excluded.part_name`,
          manufacturer: sql`excluded.manufacturer`,
          category: sql`excluded.category`,
          vehicleMake: sql`excluded.vehicle_make`,
          supplier: sql`excluded.supplier`,
          creator: sql`excluded.creator`,
          description: sql`excluded.description`,
          price: sql`excluded.price`,
          cost: sql`excluded.cost`,
          
          // New comprehensive pricing fields
          laborHours: sql`excluded.labor_hours`,
          partCost: sql`excluded.part_cost`,
          salesMarkup: sql`excluded.sales_markup`,
          salesOperator: sql`excluded.sales_operator`,
          salesType: sql`excluded.sales_type`,
          costToSales: sql`excluded.cost_to_sales`,
          salesInstallation: sql`excluded.sales_installation`,
          totalCostToSales: sql`excluded.total_cost_to_sales`,
          partMSRP: sql`excluded.part_msrp`,
          retailMarkup: sql`excluded.retail_markup`,
          retailOperator: sql`excluded.retail_operator`,
          retailType: sql`excluded.retail_type`,
          partRetail: sql`excluded.part_retail`,
          retailInstallation: sql`excluded.retail_installation`,
          totalRetail: sql`excluded.total_retail`,
          
          imageUrl: sql`excluded.image_url`,
          stockQuantity: sql`excluded.stock_quantity`,
          dataSource: sql`excluded.data_source`,
          isHidden: sql`excluded.is_hidden`,
          isPopular: sql`excluded.is_popular`,
          updatedAt: new Date(),
        }
      })
      .returning();
    
    return createdProducts;
  }

  async getCategories(): Promise<Category[]> {
    return await db.select().from(categories);
  }

  async getManufacturers(): Promise<Manufacturer[]> {
    return await db.select().from(manufacturers);
  }

  async getVehicleMakes(): Promise<VehicleMake[]> {
    return await db.select().from(vehicleMakes);
  }

  async getProductsWithoutImages(): Promise<Product[]> {
    return await db
      .select()
      .from(products)
      .where(
        or(
          isNull(products.imageUrl),
          eq(products.imageUrl, '')
        )
      )
      .limit(100);
  }

  async updateProduct(id: number, updates: Partial<InsertProduct>): Promise<Product | undefined> {
    const [product] = await db
      .update(products)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return product;
  }

  async updateProductImage(id: number, imageUrl: string): Promise<boolean> {
    const [product] = await db
      .update(products)
      .set({ imageUrl, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return !!product;
  }

  // User operations for Replit Auth
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // First, check if a user with this email already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, userData.email));

    if (existingUser) {
      // Update the existing user with new data (including potentially new ID from OIDC)
      const [updatedUser] = await db
        .update(users)
        .set({
          id: userData.id,
          firstName: userData.firstName,
          lastName: userData.lastName,
          updatedAt: new Date(),
        })
        .where(eq(users.email, userData.email))
        .returning();
      return updatedUser;
    } else {
      // Insert new user
      const [newUser] = await db
        .insert(users)
        .values(userData)
        .returning();
      return newUser;
    }
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(users.email);
  }

  async updateUserRole(id: string, role: string): Promise<void> {
    await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id));
  }
}

export const storage = new DatabaseStorage();
