// Reference: blueprint:javascript_log_in_with_replit
import { products, categories, manufacturers, vehicleMakes, users, leads, orders, type Product, type InsertProduct, type Category, type InsertCategory, type Manufacturer, type InsertManufacturer, type VehicleMake, type InsertVehicleMake, type User, type UpsertUser, type Lead, type InsertLead, type Order, type InsertOrder } from "@shared/schema";
import { db } from "./db";
import { eq, ilike, and, or, inArray, sql, isNull, desc } from "drizzle-orm";

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
  getProductsByIds(ids: number[]): Promise<Product[]>;
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
  updateUserProfile(id: string, data: { firstName?: string; lastName?: string; phone?: string; email?: string }): Promise<User | undefined>;
  
  // Lead operations
  createLead(lead: InsertLead): Promise<Lead>;
  getLeads(filters?: { status?: string; search?: string }): Promise<Lead[]>;
  getLead(id: number): Promise<Lead | undefined>;
  updateLead(id: number, data: { status?: string; assignedTo?: string | null; comments?: string | null }): Promise<Lead | undefined>;
  deleteLead(id: number): Promise<boolean>;
  getLeadStats(): Promise<{ status: string; count: number }[]>;
  
  // Order operations
  createOrder(order: InsertOrder): Promise<Order>;
  getOrders(filters?: { status?: string; search?: string; createdBy?: string }): Promise<Order[]>;
  getOrder(id: number): Promise<Order | undefined>;
  updateOrder(id: number, data: { status?: string; assignedTo?: string | null; notes?: string | null }): Promise<Order | undefined>;
  deleteOrder(id: number): Promise<boolean>;
  getOrderStats(): Promise<{ status: string; count: number }[]>;
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
      const categories = filters.category.split(',');
      if (categories.length === 1) {
        conditions.push(eq(products.category, categories[0]));
      } else {
        conditions.push(inArray(products.category, categories));
      }
    }
    if (filters?.manufacturer) {
      const manufacturers = filters.manufacturer.split(',');
      if (manufacturers.length === 1) {
        conditions.push(eq(products.manufacturer, manufacturers[0]));
      } else {
        conditions.push(inArray(products.manufacturer, manufacturers));
      }
    }
    if (filters?.vehicleMake) {
      const vehicleMakes = filters.vehicleMake.split(',');
      if (vehicleMakes.length === 1) {
        conditions.push(eq(products.vehicleMake, vehicleMakes[0]));
      } else {
        conditions.push(inArray(products.vehicleMake, vehicleMakes));
      }
    }
    if (filters?.vehicleModel) {
      const vehicleModels = filters.vehicleModel.split(',');
      if (vehicleModels.length === 1) {
        conditions.push(eq(products.vehicleModel, vehicleModels[0]));
      } else {
        conditions.push(inArray(products.vehicleModel, vehicleModels));
      }
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

    const productList = await db
      .select()
      .from(products)
      .where(whereClause)
      .orderBy(products.partName)
      .limit(pageSize)
      .offset(offset);

    return {
      products: productList,
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

  async getProductsByIds(ids: number[]): Promise<Product[]> {
    if (ids.length === 0) return [];
    return await db.select().from(products).where(inArray(products.id, ids));
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

  async updateUserProfile(id: string, data: { firstName?: string; lastName?: string; phone?: string; email?: string }): Promise<User | undefined> {
    const updateData: Record<string, any> = { updatedAt: new Date() };
    
    // Only update fields with non-empty values to prevent overwriting with empty strings
    if (data.firstName && data.firstName.trim()) updateData.firstName = data.firstName.trim();
    if (data.lastName && data.lastName.trim()) updateData.lastName = data.lastName.trim();
    if (data.phone && data.phone.trim()) updateData.phone = data.phone.trim();
    if (data.email && data.email.trim()) updateData.email = data.email.trim();
    
    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  // Lead operations
  async createLead(lead: InsertLead): Promise<Lead> {
    const [newLead] = await db.insert(leads).values(lead).returning();
    return newLead;
  }

  async getLeads(filters?: { status?: string; search?: string }): Promise<Lead[]> {
    const conditions = [];
    
    if (filters?.status && filters.status !== 'all') {
      conditions.push(eq(leads.status, filters.status));
    }
    
    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(leads.firstName, searchTerm),
          ilike(leads.lastName, searchTerm),
          ilike(leads.email, searchTerm),
          ilike(leads.phone, searchTerm)
        )
      );
    }
    
    if (conditions.length > 0) {
      return await db.select().from(leads).where(and(...conditions)).orderBy(desc(leads.createdAt));
    }
    return await db.select().from(leads).orderBy(desc(leads.createdAt));
  }

  async getLead(id: number): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id));
    return lead;
  }

  async updateLead(id: number, data: { status?: string; assignedTo?: string | null; comments?: string | null }): Promise<Lead | undefined> {
    const updateData: any = { updatedAt: new Date() };
    
    // Only allow specific fields to be updated (whitelist approach)
    if (data.status !== undefined) {
      updateData.status = data.status;
    }
    if (data.assignedTo !== undefined) {
      updateData.assignedTo = data.assignedTo;
    }
    if (data.comments !== undefined) {
      updateData.comments = data.comments;
    }
    
    // If status is being changed to 'contacted' and contactedAt is not set, set it
    if (data.status === 'contacted') {
      const existingLead = await this.getLead(id);
      if (existingLead && !existingLead.contactedAt) {
        updateData.contactedAt = new Date();
      }
    }
    
    const [lead] = await db
      .update(leads)
      .set(updateData)
      .where(eq(leads.id, id))
      .returning();
    return lead;
  }

  async deleteLead(id: number): Promise<boolean> {
    const result = await db.delete(leads).where(eq(leads.id, id)).returning();
    return result.length > 0;
  }

  async getLeadStats(): Promise<{ status: string; count: number }[]> {
    const stats = await db
      .select({
        status: leads.status,
        count: sql<number>`count(*)::int`,
      })
      .from(leads)
      .groupBy(leads.status);
    return stats;
  }

  // Order operations
  async createOrder(order: InsertOrder): Promise<Order> {
    const [newOrder] = await db.insert(orders).values(order).returning();
    return newOrder;
  }

  async getOrders(filters?: { status?: string; search?: string; createdBy?: string }): Promise<Order[]> {
    const conditions = [];
    
    if (filters?.status && filters.status !== 'all') {
      conditions.push(eq(orders.status, filters.status));
    }
    
    if (filters?.createdBy) {
      conditions.push(eq(orders.createdBy, filters.createdBy));
    }
    
    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(orders.customerName, searchTerm),
          ilike(orders.customerEmail, searchTerm),
          ilike(orders.customerPhone, searchTerm)
        )
      );
    }
    
    if (conditions.length > 0) {
      return await db.select().from(orders).where(and(...conditions)).orderBy(desc(orders.createdAt));
    }
    return await db.select().from(orders).orderBy(desc(orders.createdAt));
  }

  async getOrder(id: number): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async updateOrder(id: number, data: { 
    status?: string; 
    assignedTo?: string | null; 
    notes?: string | null;
    cartItems?: any[];
    cartTotal?: string;
    itemCount?: number;
  }): Promise<Order | undefined> {
    const updateData: any = { updatedAt: new Date() };
    
    if (data.status !== undefined) {
      updateData.status = data.status;
    }
    if (data.assignedTo !== undefined) {
      updateData.assignedTo = data.assignedTo;
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }
    if (data.cartItems !== undefined) {
      updateData.cartItems = data.cartItems;
    }
    if (data.cartTotal !== undefined) {
      updateData.cartTotal = data.cartTotal;
    }
    if (data.itemCount !== undefined) {
      updateData.itemCount = data.itemCount;
    }
    
    // If status is being changed to 'completed', set completedAt
    if (data.status === 'completed') {
      const existingOrder = await this.getOrder(id);
      if (existingOrder && !existingOrder.completedAt) {
        updateData.completedAt = new Date();
      }
    }
    
    const [order] = await db
      .update(orders)
      .set(updateData)
      .where(eq(orders.id, id))
      .returning();
    return order;
  }

  async deleteOrder(id: number): Promise<boolean> {
    const result = await db.delete(orders).where(eq(orders.id, id)).returning();
    return result.length > 0;
  }

  async getOrderStats(): Promise<{ status: string; count: number }[]> {
    const stats = await db
      .select({
        status: orders.status,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .groupBy(orders.status);
    return stats;
  }
}

export const storage = new DatabaseStorage();
