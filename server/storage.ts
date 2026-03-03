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

export interface PaginatedLeads {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginatedOrders {
  orders: Order[];
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
  getLeads(filters?: { status?: string; search?: string; page?: number; pageSize?: number }): Promise<PaginatedLeads>;
  getLead(id: number): Promise<Lead | undefined>;
  updateLead(id: number, data: { status?: string; assignedTo?: string | null; comments?: string | null; adfXml?: string }): Promise<Lead | undefined>;
  deleteLead(id: number): Promise<boolean>;
  getLeadStats(): Promise<{ status: string; count: number }[]>;
  
  // Order operations
  createOrder(order: InsertOrder): Promise<Order>;
  getOrders(filters?: { status?: string; search?: string; createdBy?: string; page?: number; pageSize?: number }): Promise<PaginatedOrders>;
  getOrder(id: number): Promise<Order | undefined>;
  updateOrder(id: number, data: { status?: string; assignedTo?: string | null; notes?: string | null; taxRate?: string; taxAmount?: string; cartItems?: any[]; cartTotal?: string; itemCount?: number }): Promise<Order | undefined>;
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
      const escapeLike = (s: string) => s.replace(/%/g, '\\%').replace(/_/g, '\\_');
      const searchTerm = `%${escapeLike(filters.search)}%`;
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
          
          imageUrl: sql`CASE WHEN products.manually_edited THEN products.image_url WHEN excluded.image_url IS NOT NULL AND excluded.image_url != '' THEN excluded.image_url ELSE products.image_url END`,
          description: sql`CASE WHEN products.manually_edited THEN products.description ELSE excluded.description END`,
          isHidden: sql`CASE WHEN products.manually_edited THEN products.is_hidden ELSE excluded.is_hidden END`,
          isPopular: sql`CASE WHEN products.manually_edited THEN products.is_popular ELSE excluded.is_popular END`,
          stockQuantity: sql`excluded.stock_quantity`,
          dataSource: sql`excluded.data_source`,
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
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          firstName: sql`excluded.first_name`,
          lastName: sql`excluded.last_name`,
          profileImageUrl: sql`excluded.profile_image_url`,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
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
    
    if (data.firstName !== undefined) updateData.firstName = data.firstName?.trim() || null;
    if (data.lastName !== undefined) updateData.lastName = data.lastName?.trim() || null;
    if (data.phone !== undefined) updateData.phone = data.phone?.trim() || null;
    if (data.email !== undefined) updateData.email = data.email?.trim() || null;
    
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

  async getLeads(filters?: { status?: string; search?: string; page?: number; pageSize?: number }): Promise<PaginatedLeads> {
    const page = filters?.page || 1;
    const pageSize = Math.min(filters?.pageSize || 50, 100);
    const offset = (page - 1) * pageSize;
    const conditions = [];
    
    if (filters?.status && filters.status !== 'all') {
      conditions.push(eq(leads.status, filters.status));
    }
    
    if (filters?.search) {
      const escapeLike = (s: string) => s.replace(/%/g, '\\%').replace(/_/g, '\\_');
      const searchTerm = `%${escapeLike(filters.search)}%`;
      conditions.push(
        or(
          ilike(leads.firstName, searchTerm),
          ilike(leads.lastName, searchTerm),
          ilike(leads.email, searchTerm),
          ilike(leads.phone, searchTerm)
        )
      );
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(whereClause);
    
    const total = countResult?.count || 0;

    const result = await db
      .select()
      .from(leads)
      .where(whereClause)
      .orderBy(desc(leads.createdAt))
      .limit(pageSize)
      .offset(offset);

    return {
      leads: result,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getLead(id: number): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id));
    return lead;
  }

  async updateLead(id: number, data: { status?: string; assignedTo?: string | null; comments?: string | null; adfXml?: string }): Promise<Lead | undefined> {
    const updateData: any = { updatedAt: new Date() };
    
    if (data.status !== undefined) {
      updateData.status = data.status;
    }
    if (data.assignedTo !== undefined) {
      updateData.assignedTo = data.assignedTo;
    }
    if (data.comments !== undefined) {
      updateData.comments = data.comments;
    }
    if (data.adfXml !== undefined) {
      updateData.adfXml = data.adfXml;
    }
    
    if (data.status === 'contacted') {
      updateData.contactedAt = sql`COALESCE(contacted_at, NOW())`;
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

  async getOrders(filters?: { status?: string; search?: string; createdBy?: string; page?: number; pageSize?: number }): Promise<PaginatedOrders> {
    const page = filters?.page || 1;
    const pageSize = Math.min(filters?.pageSize || 50, 100);
    const offset = (page - 1) * pageSize;
    const conditions = [];
    
    if (filters?.status && filters.status !== 'all') {
      conditions.push(eq(orders.status, filters.status));
    }
    
    if (filters?.createdBy) {
      conditions.push(eq(orders.createdBy, filters.createdBy));
    }
    
    if (filters?.search) {
      const escapeLike = (s: string) => s.replace(/%/g, '\\%').replace(/_/g, '\\_');
      const searchTerm = `%${escapeLike(filters.search)}%`;
      conditions.push(
        or(
          ilike(orders.customerName, searchTerm),
          ilike(orders.customerEmail, searchTerm),
          ilike(orders.customerPhone, searchTerm)
        )
      );
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(whereClause);
    
    const total = countResult?.count || 0;

    const result = await db
      .select()
      .from(orders)
      .where(whereClause)
      .orderBy(desc(orders.createdAt))
      .limit(pageSize)
      .offset(offset);

    return {
      orders: result,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
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
    taxRate?: string;
    taxAmount?: string;
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
    if (data.taxRate !== undefined) {
      updateData.taxRate = data.taxRate;
    }
    if (data.taxAmount !== undefined) {
      updateData.taxAmount = data.taxAmount;
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
