// Reference: blueprint:javascript_log_in_with_replit
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import multer from "multer";
import { InsertProduct } from "@shared/schema";
import { setupAuth, isAuthenticated, requireAdmin, requireStrictAdmin, requireStaff } from "./replitAuth";
import { parsePDFCatalog } from "./pdfParser";
import { generateAdfXml } from "./adfGenerator";
import { sendLeadNotification } from "./emailService";
import { importRoughCountryFeed, type ImportStats } from "../scripts/import-rough-country";
import rateLimit from "express-rate-limit";
import { doubleCsrf } from "csrf-csrf";

const uploadImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const uploadFile = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function parseIdParam(raw: string): number | null {
  const id = parseInt(raw, 10);
  if (isNaN(id) || id < 0) return null;
  return id;
}

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET || "csrf-fallback-secret",
  cookieName: "__csrf",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
  getSessionIdentifier: () => "app",
  getCsrfTokenFromRequest: (req: any) => req.headers["x-csrf-token"] as string,
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication middleware
  await setupAuth(app);

  // CSRF token endpoint - provides token for frontend to include in mutating requests
  app.get('/api/csrf-token', (req: any, res) => {
    const token = generateCsrfToken(req, res);
    res.json({ csrfToken: token });
  });

  // Apply CSRF protection to all POST/PATCH/DELETE API routes
  app.use('/api', (req: any, res: any, next: any) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }
    // Skip CSRF for auth callback (OIDC redirect)
    if (req.path === '/callback' || req.path === '/login' || req.path === '/logout') {
      return next();
    }
    doubleCsrfProtection(req, res, next);
  });

  // Auth routes - returns envelope with user (null for unauthenticated)
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      // If not authenticated, return null user in envelope
      if (!req.isAuthenticated() || !req.user?.claims?.sub) {
        return res.json({ user: null });
      }
      
      const userId = req.user.claims.sub;
      const user = req.user as any;
      
      let cachedUser = null;
      const cacheAge = Date.now() - (user.cachedUserAt || 0);
      if (user.cachedUser && cacheAge <= 300_000) {
        cachedUser = user.cachedUser;
      } else {
        cachedUser = await storage.getUser(userId);
        user.cachedUser = cachedUser;
        user.cachedUserAt = Date.now();
      }
      
      res.json({ user: cachedUser });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Public product routes with pagination
  app.get("/api/products", async (req, res) => {
    try {
      const { category, manufacturer, vehicleMake, vehicleModel, search, page, pageSize } = req.query;
      const result = await storage.getProducts({
        category: category as string | undefined,
        manufacturer: manufacturer as string | undefined,
        vehicleMake: vehicleMake as string | undefined,
        vehicleModel: vehicleModel as string | undefined,
        search: search as string | undefined,
        page: page ? parseInt(page as string) : 1,
        pageSize: pageSize ? parseInt(pageSize as string) : 50,
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  // Get filter options derived from actual products
  app.get("/api/filters", async (_req, res) => {
    try {
      const { db } = await import("./db");
      const { products } = await import("@shared/schema");
      const { sql, or, eq, isNull } = await import("drizzle-orm");
      
      const visibilityCondition = or(eq(products.isHidden, false), isNull(products.isHidden));
      
      const [categoriesResult, manufacturersResult, vehicleMakesResult] = await Promise.all([
        db.select({ name: products.category, count: sql<number>`count(*)::int` })
          .from(products)
          .where(visibilityCondition)
          .groupBy(products.category)
          .orderBy(products.category),
        db.select({ name: products.manufacturer, count: sql<number>`count(*)::int` })
          .from(products)
          .where(visibilityCondition)
          .groupBy(products.manufacturer)
          .orderBy(products.manufacturer),
        db.select({ name: products.vehicleMake, count: sql<number>`count(*)::int` })
          .from(products)
          .where(visibilityCondition)
          .groupBy(products.vehicleMake)
          .orderBy(products.vehicleMake),
      ]);
      
      res.json({
        categories: categoriesResult
          .filter(c => c.name)
          .map(c => ({ value: c.name, label: c.name, count: c.count })),
        manufacturers: manufacturersResult
          .filter(m => m.name)
          .map(m => ({ value: m.name, label: m.name, count: m.count })),
        vehicleMakes: vehicleMakesResult
          .filter(v => v.name)
          .map(v => ({ value: v.name!, label: v.name!, count: v.count })),
      });
    } catch (error) {
      console.error("Error fetching filters:", error);
      res.status(500).json({ error: "Failed to fetch filters" });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "Invalid ID parameter" });
      const product = await storage.getProduct(id);
      
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ error: "Failed to fetch product" });
    }
  });

  app.post("/api/products/batch", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids must be a non-empty array" });
      }
      if (ids.length > 100) {
        return res.status(400).json({ error: "Maximum 100 product IDs per request" });
      }
      const numericIds = ids.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));
      const result = await storage.getProductsByIds(numericIds);
      res.json(result);
    } catch (error) {
      console.error("Error fetching products batch:", error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.get("/api/categories", async (req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  // Lead submission - public endpoint (anyone can submit a lead request)
  const leadRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many submissions. Please try again in 15 minutes." },
  });

  app.post("/api/leads", leadRateLimiter, async (req: any, res) => {
    try {
      if (req.body.website) {
        return res.status(200).json({ success: true, message: "Request submitted" });
      }

      const leadSchema = z.object({
        firstName: z.string().min(1, "First name is required"),
        lastName: z.string().min(1, "Last name is required"),
        email: z.string().email("Valid email is required"),
        phone: z.string().min(1, "Phone number is required"),
        preferredContact: z.enum(['phone', 'email', 'text']).optional().default('phone'),
        vehicleInfo: z.string().optional(),
        comments: z.string().optional(),
        cartItems: z.array(z.object({
          product: z.object({
            id: z.number(),
            partNumber: z.string(),
            partName: z.string(),
            manufacturer: z.string(),
            category: z.string(),
            price: z.string().nullable().optional(),
          }),
          quantity: z.number().min(1),
        })).min(1, "Cart must have at least one item"),
        cartTotal: z.string().optional(),
      });

      const validationResult = leadSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: validationResult.error.errors,
        });
      }

      const data = validationResult.data;
      
      const userId = req.isAuthenticated?.() ? req.user?.claims?.sub : null;
      
      const itemCount = data.cartItems.reduce((sum, item) => sum + item.quantity, 0);
      
      const lead = await storage.createLead({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        preferredContact: data.preferredContact,
        vehicleInfo: data.vehicleInfo || null,
        comments: data.comments || null,
        cartItems: data.cartItems,
        cartTotal: data.cartTotal || null,
        itemCount,
        adfXml: '',
        status: 'new',
        submittedBy: userId,
      });

      const adfXml = generateAdfXml({ ...data, leadId: lead.id });
      await storage.updateLead(lead.id, { adfXml });

      // Send email notification (don't block response on email)
      sendLeadNotification({
        leadId: lead.id,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        preferredContact: data.preferredContact,
        vehicleInfo: data.vehicleInfo,
        comments: data.comments,
        itemCount,
        cartItems: data.cartItems,
      }).catch(err => console.error('Email notification failed:', err));

      res.json({
        success: true,
        leadId: lead.id,
        message: "Your request has been submitted. We'll contact you within 24 hours!",
      });
    } catch (error) {
      console.error("Error creating lead:", error);
      res.status(500).json({ error: "Failed to submit lead request" });
    }
  });

  // Get leads - authenticated staff can view leads
  app.get("/api/leads", isAuthenticated, requireStaff, async (req: any, res) => {
    try {
      const { status, search, page, pageSize } = req.query;
      const leads = await storage.getLeads({
        status: status as string,
        search: search as string,
        page: page ? parseInt(page as string) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string) : undefined,
      });
      res.json(leads);
    } catch (error) {
      console.error("Error fetching leads:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  // Get lead stats - authenticated staff can view
  app.get("/api/leads/stats", isAuthenticated, requireStaff, async (req: any, res) => {
    try {
      const stats = await storage.getLeadStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching lead stats:", error);
      res.status(500).json({ error: "Failed to fetch lead stats" });
    }
  });

  // Get single lead with ADF download
  app.get("/api/leads/:id", isAuthenticated, requireStaff, async (req: any, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "Invalid ID parameter" });
      const lead = await storage.getLead(id);
      
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      res.json(lead);
    } catch (error) {
      console.error("Error fetching lead:", error);
      res.status(500).json({ error: "Failed to fetch lead" });
    }
  });

  // Download ADF XML for a lead
  app.get("/api/leads/:id/adf", isAuthenticated, requireStaff, async (req: any, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "Invalid ID parameter" });
      const lead = await storage.getLead(id);
      
      if (!lead || !lead.adfXml) {
        return res.status(404).json({ error: "Lead or ADF not found" });
      }
      
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename="lead-${id}.adf"`);
      res.send(lead.adfXml);
    } catch (error) {
      console.error("Error downloading ADF:", error);
      res.status(500).json({ error: "Failed to download ADF" });
    }
  });

  // Update lead - authenticated staff can update
  app.patch("/api/leads/:id", isAuthenticated, requireStaff, async (req: any, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "Invalid ID parameter" });
      const { status, assignedTo, comments } = req.body;
      
      const updateData: any = {};
      
      if (status) {
        const validStatuses = ['new', 'contacted', 'quoted', 'sold', 'closed'];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ error: "Invalid status" });
        }
        updateData.status = status;
      }
      
      if (assignedTo !== undefined) {
        updateData.assignedTo = assignedTo;
      }
      
      if (comments !== undefined) {
        updateData.comments = comments;
      }
      
      const lead = await storage.updateLead(id, updateData);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      res.json(lead);
    } catch (error) {
      console.error("Error updating lead:", error);
      res.status(500).json({ error: "Failed to update lead" });
    }
  });

  // Delete lead - admin only
  app.delete("/api/leads/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "Invalid ID parameter" });
      const success = await storage.deleteLead(id);
      
      if (!success) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      res.json({ success: true, message: "Lead deleted" });
    } catch (error) {
      console.error("Error deleting lead:", error);
      res.status(500).json({ error: "Failed to delete lead" });
    }
  });

  // Protected admin routes - require authentication and admin role
  
  // Database export - download products as JSON
  app.get("/api/admin/database/export", isAuthenticated, requireStrictAdmin, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { products, leads, orders } = await import("@shared/schema");
      
      const [allProducts, allLeads, allOrders] = await Promise.all([
        db.select().from(products),
        db.select().from(leads),
        db.select().from(orders),
      ]);
      
      const exportData = {
        exportDate: new Date().toISOString(),
        products: allProducts,
        leads: allLeads,
        orders: allOrders,
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="thunder-customs-backup-${Date.now()}.json"`);
      res.send(JSON.stringify(exportData, null, 2));
    } catch (error) {
      console.error("Error exporting database:", error);
      res.status(500).json({ error: "Failed to export database" });
    }
  });

  // Database import - restore products from JSON (wrapped in transaction for safety)
  app.post("/api/admin/database/import", isAuthenticated, requireStrictAdmin, uploadFile.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const { db } = await import("./db");
      const { products, leads, orders } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");
      
      const fileContent = req.file.buffer.toString('utf-8');
      const importData = JSON.parse(fileContent);
      
      if (!importData.products || !Array.isArray(importData.products)) {
        return res.status(400).json({ error: "Invalid backup file format" });
      }
      
      const batchSize = 100;
      
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`TRUNCATE TABLE products RESTART IDENTITY CASCADE`);
        
        let importedProducts = 0;
        for (let i = 0; i < importData.products.length; i += batchSize) {
          const batch = importData.products.slice(i, i + batchSize);
          const productsToInsert = batch.map((p: any) => {
            const { id, ...productData } = p;
            return productData;
          });
          
          if (productsToInsert.length > 0) {
            await tx.insert(products).values(productsToInsert);
            importedProducts += productsToInsert.length;
          }
        }
        
        let importedLeads = 0;
        if (importData.leads && Array.isArray(importData.leads)) {
          await tx.execute(sql`TRUNCATE TABLE leads RESTART IDENTITY CASCADE`);
          
          for (let i = 0; i < importData.leads.length; i += batchSize) {
            const batch = importData.leads.slice(i, i + batchSize);
            const leadsToInsert = batch.map((l: any) => {
              const { id, ...leadData } = l;
              return leadData;
            });
            
            if (leadsToInsert.length > 0) {
              await tx.insert(leads).values(leadsToInsert);
              importedLeads += leadsToInsert.length;
            }
          }
        }
        
        let importedOrders = 0;
        if (importData.orders && Array.isArray(importData.orders)) {
          await tx.execute(sql`TRUNCATE TABLE orders RESTART IDENTITY CASCADE`);
          
          for (let i = 0; i < importData.orders.length; i += batchSize) {
            const batch = importData.orders.slice(i, i + batchSize);
            const ordersToInsert = batch.map((o: any) => {
              const { id, ...orderData } = o;
              return orderData;
            });
            
            if (ordersToInsert.length > 0) {
              await tx.insert(orders).values(ordersToInsert);
              importedOrders += ordersToInsert.length;
            }
          }
        }
        
        return { importedProducts, importedLeads, importedOrders };
      });
      
      res.json({
        success: true,
        message: `Imported ${result.importedProducts} products, ${result.importedLeads} leads, and ${result.importedOrders} orders`,
        ...result,
      });
    } catch (error) {
      console.error("Error importing database:", error);
      res.status(500).json({ error: "Failed to import database. Ensure the file is a valid backup." });
    }
  });

  // Update individual product (MSRP, cost, description)
  app.patch("/api/admin/products/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Helper to validate and normalize decimal fields
      const decimalField = z.union([z.string(), z.null()]).optional()
        .refine((val) => val === null || !val || /^\d+(\.\d{1,2})?$/.test(val.trim()), {
          message: "Must be a valid decimal number (e.g., 99.99)",
        })
        .transform((val) => {
          if (val === null) return null;
          const trimmed = val?.trim();
          return trimmed || undefined;
        });
      
      // Helper to validate and normalize string fields
      const stringField = z.union([z.string(), z.null()]).optional()
        .transform((val) => {
          if (val === null) return null;
          const trimmed = val?.trim();
          return trimmed || undefined;
        });
      
      // Validate input with Zod schema - enforce proper decimal format and trim values
      // Transform to distinguish between omitted (undefined) and cleared (empty string)
      const updateSchema = z.object({
        // Legacy fields
        price: decimalField,
        cost: decimalField,
        description: stringField,
        
        // New comprehensive pricing fields
        laborHours: decimalField,
        partCost: decimalField,
        salesMarkup: decimalField,
        salesOperator: stringField,
        salesType: stringField,
        costToSales: decimalField,
        salesInstallation: decimalField,
        totalCostToSales: decimalField,
        partMSRP: decimalField,
        retailMarkup: decimalField,
        retailOperator: stringField,
        retailType: stringField,
        partRetail: decimalField,
        retailInstallation: decimalField,
        totalRetail: decimalField,
      });
      
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: validationResult.error.errors 
        });
      }
      
      const data = validationResult.data;
      
      // Helper to normalize decimal fields
      const normalizeDecimal = (val: string | null | undefined) => {
        return val ? Number(val).toFixed(2) : null;
      };
      
      // Normalize all fields to canonical format, allow null for clears
      const updates: any = {};
      if (data.price !== undefined) updates.price = normalizeDecimal(data.price);
      if (data.cost !== undefined) updates.cost = normalizeDecimal(data.cost);
      if (data.description !== undefined) updates.description = data.description || null;
      
      // New comprehensive pricing fields
      if (data.laborHours !== undefined) updates.laborHours = normalizeDecimal(data.laborHours);
      if (data.partCost !== undefined) updates.partCost = normalizeDecimal(data.partCost);
      if (data.salesMarkup !== undefined) updates.salesMarkup = normalizeDecimal(data.salesMarkup);
      if (data.salesOperator !== undefined) updates.salesOperator = data.salesOperator || null;
      if (data.salesType !== undefined) updates.salesType = data.salesType || null;
      if (data.costToSales !== undefined) updates.costToSales = normalizeDecimal(data.costToSales);
      if (data.salesInstallation !== undefined) updates.salesInstallation = normalizeDecimal(data.salesInstallation);
      if (data.totalCostToSales !== undefined) updates.totalCostToSales = normalizeDecimal(data.totalCostToSales);
      if (data.partMSRP !== undefined) updates.partMSRP = normalizeDecimal(data.partMSRP);
      if (data.retailMarkup !== undefined) updates.retailMarkup = normalizeDecimal(data.retailMarkup);
      if (data.retailOperator !== undefined) updates.retailOperator = data.retailOperator || null;
      if (data.retailType !== undefined) updates.retailType = data.retailType || null;
      if (data.partRetail !== undefined) updates.partRetail = normalizeDecimal(data.partRetail);
      if (data.retailInstallation !== undefined) updates.retailInstallation = normalizeDecimal(data.retailInstallation);
      if (data.totalRetail !== undefined) updates.totalRetail = normalizeDecimal(data.totalRetail);
      
      const updatedProduct = await storage.updateProduct(parseInt(id), updates);
      
      if (!updatedProduct) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      res.json({ success: true, product: updatedProduct });
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  // Upload product image (saved to disk, URL stored in database)
  app.post("/api/admin/products/:id/image", isAuthenticated, requireAdmin, uploadImage.single('image'), async (req: any, res) => {
    try {
      const { id } = req.params;
      
      if (!req.file) {
        return res.status(400).json({ error: "No image file uploaded" });
      }

      const path = await import("path");
      const fs = await import("fs");
      
      const uploadsDir = path.resolve(import.meta.dirname, '..', 'uploads', 'product-images');
      fs.mkdirSync(uploadsDir, { recursive: true });
      
      const ext = path.extname(req.file.originalname) || '.jpg';
      const filename = `product-${id}-${Date.now()}${ext}`;
      const filePath = path.join(uploadsDir, filename);
      
      fs.writeFileSync(filePath, req.file.buffer);
      
      const imageUrl = `/uploads/product-images/${filename}`;
      const success = await storage.updateProductImage(parseInt(id), imageUrl);
      
      if (!success) {
        fs.unlinkSync(filePath);
        return res.status(404).json({ error: "Product not found" });
      }
      
      const updatedProduct = await storage.getProduct(parseInt(id));
      res.json({ success: true, product: updatedProduct });
    } catch (error) {
      console.error("Error uploading product image:", error);
      res.status(500).json({ error: "Failed to upload image" });
    }
  });

  app.post("/api/admin/import-csv", isAuthenticated, requireAdmin, uploadFile.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const fileContent = req.file.buffer.toString('utf-8');
      const filename = req.file.originalname;
      const products = parseProductsFromHTML(fileContent, filename);
      
      if (products.length === 0) {
        return res.status(400).json({ error: "No valid products found in file" });
      }

      const createdProducts = await storage.createProducts(products);
      
      res.json({
        success: true,
        imported: createdProducts.length,
        total: products.length,
      });
    } catch (error) {
      console.error("Error importing products:", error);
      res.status(500).json({ error: "Failed to import products" });
    }
  });

  app.post("/api/admin/import-batch", isAuthenticated, requireAdmin, uploadFile.array('files', 50), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      let totalImported = 0;
      let filesProcessed = 0;

      for (const file of files) {
        try {
          const fileContent = file.buffer.toString('utf-8');
          const filename = file.originalname;
          const products = parseProductsFromHTML(fileContent, filename);
          
          if (products.length > 0) {
            const createdProducts = await storage.createProducts(products);
            totalImported += createdProducts.length;
            filesProcessed++;
            console.log(`Imported ${createdProducts.length} products from ${filename}`);
          }
        } catch (fileError) {
          console.error(`Error processing file ${file.originalname}:`, fileError);
        }
      }
      
      res.json({
        success: true,
        totalImported,
        filesProcessed,
        totalFiles: files.length,
      });
    } catch (error) {
      console.error("Error importing batch:", error);
      res.status(500).json({ error: "Failed to import batch" });
    }
  });

  // Import products from PDF catalog
  app.post("/api/admin/import-pdf-catalog", isAuthenticated, requireAdmin, uploadFile.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Validate it's a PDF file
      if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({ error: "File must be a PDF" });
      }

      console.log(`📄 Parsing PDF catalog: ${req.file.originalname}`);
      
      // Parse PDF to extract product data
      const parsedProducts = await parsePDFCatalog(req.file.buffer);
      
      if (parsedProducts.length === 0) {
        return res.status(400).json({ error: "No products found in PDF catalog" });
      }

      console.log(`✅ Extracted ${parsedProducts.length} products from PDF`);

      // Normalize and map to InsertProduct format
      const productsToImport: InsertProduct[] = parsedProducts.map(p => {
        // Normalize MSRP to canonical "XX.YY" format
        let normalizedPrice: string | null = null;
        if (p.price) {
          const priceMatch = p.price.match(/^\d+(\.\d{1,2})?$/);
          if (priceMatch) {
            normalizedPrice = parseFloat(p.price).toFixed(2);
          }
        }

        return {
          partNumber: p.partNumber || `PDF-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          partName: p.name,
          description: p.description || null,
          manufacturer: p.manufacturer || 'Unknown',
          category: p.category || 'Uncategorized',
          vehicleMake: p.vehicleMake || null,
          price: normalizedPrice,
          cost: null, // PDF catalogs typically don't include dealer cost
          stockQuantity: null,
          imageUrl: null,
          hidden: false,
        };
      });

      // Import products (upsert based on part number)
      const createdProducts = await storage.createProducts(productsToImport);
      
      console.log(`💾 Imported ${createdProducts.length} products to database`);

      res.json({
        success: true,
        imported: createdProducts.length,
        total: parsedProducts.length,
        filename: req.file.originalname,
      });
    } catch (error) {
      console.error("❌ Error importing PDF catalog:", error);
      res.status(500).json({ 
        error: "Failed to import PDF catalog",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Generate placeholder images for all products without images (no API key needed)
  app.post("/api/admin/populate-placeholders", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const productsWithoutImages = await storage.getProductsWithoutImages();
      
      let updated = 0;
      
      for (const product of productsWithoutImages) {
        try {
          const manufacturerText = (product.manufacturer || '').substring(0, 20);
          const partText = (product.partName || '').substring(0, 25);
          const displayText = `${manufacturerText}+%0A${partText}`;
          const imageUrl = `https://placehold.co/600x400/1E90FF/FFFFFF?text=${displayText}&font=raleway`;
          await storage.updateProductImage(product.id, imageUrl);
          updated++;
        } catch (error) {
          console.error(`Error processing image for product ${product.id}:`, error);
        }
      }
      
      res.json({
        success: true,
        updated,
        total: productsWithoutImages.length,
      });
    } catch (error) {
      console.error("Error populating placeholder images:", error);
      res.status(500).json({ error: "Failed to populate placeholder images" });
    }
  });

  // Fix broken images (those with [object Object] or invalid URLs) using Google Image Search
  app.post("/api/admin/fix-broken-images", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
      const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;

      if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) {
        return res.status(400).json({
          error: "GOOGLE_API_KEY and GOOGLE_CSE_ID must be configured in environment variables"
        });
      }

      const { db } = await import("./db");
      const { products } = await import("@shared/schema");
      const { eq, or, like } = await import("drizzle-orm");

      // Find products with broken imageUrl
      const brokenProducts = await db.select({
        id: products.id,
        partNumber: products.partNumber,
        partName: products.partName,
        manufacturer: products.manufacturer,
        imageUrl: products.imageUrl,
      })
      .from(products)
      .where(
        or(
          eq(products.imageUrl, '[object Object]'),
          like(products.imageUrl, '%[object Object]%')
        )
      );

      if (brokenProducts.length === 0) {
        return res.json({ success: true, message: "No broken images found", fixed: 0, total: 0 });
      }

      const results: Array<{ partNumber: string; status: string; imageUrl?: string }> = [];
      let fixed = 0;

      for (const product of brokenProducts) {
        try {
          // Search Google Images
          const searchQuery = `${product.manufacturer} ${product.partNumber} ${product.partName} product`.trim();
          const url = new URL('https://www.googleapis.com/customsearch/v1');
          url.searchParams.set('q', searchQuery);
          url.searchParams.set('cx', GOOGLE_CSE_ID);
          url.searchParams.set('key', GOOGLE_API_KEY);
          url.searchParams.set('searchType', 'image');
          url.searchParams.set('num', '5');
          url.searchParams.set('imgType', 'photo');
          url.searchParams.set('safe', 'active');

          const response = await fetch(url.toString());
          const data = await response.json();

          if (data.items && data.items.length > 0) {
            // Prefer official sources
            let bestImage = data.items[0];
            for (const item of data.items) {
              if (item.link.includes('revolutionparts') ||
                  item.link.includes('roughcountry') ||
                  item.link.includes('cloudfront')) {
                bestImage = item;
                break;
              }
            }

            const imageUrl = bestImage.link;
            await storage.updateProductImage(product.id, imageUrl);
            fixed++;
            results.push({ partNumber: product.partNumber, status: 'fixed', imageUrl });
          } else {
            // No image found - set placeholder
            const placeholderUrl = `https://placehold.co/600x400/1E90FF/FFFFFF?text=${encodeURIComponent(product.manufacturer.substring(0, 20))}%0A${encodeURIComponent(product.partName.substring(0, 25))}&font=raleway`;
            await storage.updateProductImage(product.id, placeholderUrl);
            results.push({ partNumber: product.partNumber, status: 'placeholder', imageUrl: placeholderUrl });
          }

          // Rate limit: wait 200ms between requests
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`Error fixing image for ${product.partNumber}:`, error);
          results.push({ partNumber: product.partNumber, status: 'error' });
        }
      }

      res.json({
        success: true,
        fixed,
        total: brokenProducts.length,
        results,
      });
    } catch (error) {
      console.error("Error fixing broken images:", error);
      res.status(500).json({ error: "Failed to fix broken images" });
    }
  });

  // User management routes (strict admin only - employee management)
  app.get("/api/users", isAuthenticated, requireStrictAdmin, async (_req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.patch("/api/users/:id/role", isAuthenticated, requireStrictAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      // Valid roles: customer (default), salesman, manager, admin (staff kept for backward compatibility)
      if (!role || !['admin', 'manager', 'salesman', 'staff', 'customer'].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      await storage.updateUserRole(id, role);
      
      // If updating current user's role, force session regeneration
      if (req.user?.claims?.sub === id) {
        req.session.destroy((err: any) => {
          if (err) {
            console.error("Error destroying session:", err);
          }
        });
        return res.status(200).json({ 
          success: true, 
          message: "Role updated. Please log in again." 
        });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ error: "Failed to update user role" });
    }
  });

  // User profile update (any authenticated user can update their own profile)
  app.patch("/api/users/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const profileSchema = z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
      });

      const validationResult = profileSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: validationResult.error.errors,
        });
      }

      const updated = await storage.updateUserProfile(userId, validationResult.data);
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ success: true, user: updated });
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // Order routes - for all authenticated staff to create orders on behalf of customers
  app.post("/api/orders", isAuthenticated, requireStaff, async (req: any, res) => {
    try {
      const orderSchema = z.object({
        customerName: z.string().min(1, "Customer name is required"),
        customerEmail: z.string().email().optional().nullable(),
        customerPhone: z.string().optional().nullable(),
        vehicleInfo: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        cartItems: z.array(z.object({
          product: z.object({
            id: z.number().nullable().optional(),
            partNumber: z.string(),
            partName: z.string(),
            manufacturer: z.string(),
            category: z.string(),
            price: z.string().nullable().optional(),
          }),
          quantity: z.number().min(1),
        })).min(1, "Order must have at least one item"),
        cartTotal: z.string().optional().nullable(),
        taxRate: z.string().optional().nullable(),
        taxAmount: z.string().optional().nullable(),
      });

      const validationResult = orderSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: validationResult.error.errors,
        });
      }

      const data = validationResult.data;
      const userId = req.user?.claims?.sub;
      
      const user = await storage.getUser(userId);
      const createdByName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : null;
      
      const itemCount = data.cartItems.reduce((sum, item) => sum + item.quantity, 0);
      
      const order = await storage.createOrder({
        customerName: data.customerName,
        customerEmail: data.customerEmail || null,
        customerPhone: data.customerPhone || null,
        vehicleInfo: data.vehicleInfo || null,
        notes: data.notes || null,
        cartItems: data.cartItems,
        cartTotal: data.cartTotal || null,
        taxRate: data.taxRate || "0.0700",
        taxAmount: data.taxAmount || null,
        itemCount,
        status: 'pending',
        createdBy: userId,
        createdByName,
      });

      res.json({
        success: true,
        orderId: order.id,
        message: "Order created successfully",
      });
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  // Get orders - authenticated staff can view orders
  app.get("/api/orders", isAuthenticated, requireStaff, async (req: any, res) => {
    try {
      const { status, search, createdBy, page, pageSize } = req.query;
      const orders = await storage.getOrders({
        status: status as string,
        search: search as string,
        createdBy: createdBy as string,
        page: page ? parseInt(page as string) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string) : undefined,
      });
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // Get order stats
  app.get("/api/orders/stats", isAuthenticated, requireStaff, async (req: any, res) => {
    try {
      const stats = await storage.getOrderStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching order stats:", error);
      res.status(500).json({ error: "Failed to fetch order stats" });
    }
  });

  // Get single order
  app.get("/api/orders/:id", isAuthenticated, requireStaff, async (req: any, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "Invalid ID parameter" });
      const order = await storage.getOrder(id);
      
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      res.json(order);
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  // Update order
  app.patch("/api/orders/:id", isAuthenticated, requireStaff, async (req: any, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "Invalid ID parameter" });
      const { status, assignedTo, notes, cartItems, cartTotal, itemCount } = req.body;
      
      // Check if user is trying to modify order items (requires admin/manager)
      const isModifyingItems = cartItems !== undefined || cartTotal !== undefined || itemCount !== undefined;
      if (isModifyingItems) {
        const user = req.user as any;
        if (!user?.claims?.sub) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        const dbUser = await storage.getUser(user.claims.sub);
        if (!dbUser || (dbUser.role !== 'admin' && dbUser.role !== 'manager')) {
          return res.status(403).json({ error: "Only managers and admins can edit order items" });
        }
      }
      
      const updateData: any = {};
      
      if (status) {
        const validStatuses = ['pending', 'processing', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ error: "Invalid status" });
        }
        updateData.status = status;
      }
      
      if (assignedTo !== undefined) {
        updateData.assignedTo = assignedTo;
      }
      
      if (notes !== undefined) {
        updateData.notes = notes;
      }
      
      if (cartItems !== undefined) {
        updateData.cartItems = cartItems;
      }
      
      if (cartTotal !== undefined) {
        updateData.cartTotal = cartTotal;
      }

      if (req.body.taxRate !== undefined) {
        updateData.taxRate = req.body.taxRate;
      }

      if (req.body.taxAmount !== undefined) {
        updateData.taxAmount = req.body.taxAmount;
      }
      
      if (itemCount !== undefined) {
        updateData.itemCount = itemCount;
      }
      
      const order = await storage.updateOrder(id, updateData);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      res.json(order);
    } catch (error) {
      console.error("Error updating order:", error);
      res.status(500).json({ error: "Failed to update order" });
    }
  });

  // Delete order - admin/manager only
  app.delete("/api/orders/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "Invalid ID parameter" });
      const success = await storage.deleteOrder(id);

      if (!success) {
        return res.status(404).json({ error: "Order not found" });
      }

      res.json({ success: true, message: "Order deleted" });
    } catch (error) {
      console.error("Error deleting order:", error);
      res.status(500).json({ error: "Failed to delete order" });
    }
  });

  // =============================================
  // ROUGH COUNTRY FEED IMPORT
  // =============================================

  // Import Rough Country feed - admin only or API key auth
  app.post("/api/admin/import-rough-country", async (req: any, res) => {
    try {
      // Check for API key auth (for GitHub Actions / cron)
      const authHeader = req.headers.authorization;
      const apiKey = process.env.IMPORT_API_KEY;

      let authorized = false;

      if (authHeader && authHeader.startsWith("Bearer ") && apiKey) {
        const token = authHeader.substring(7);
        if (token === apiKey) {
          authorized = true;
          console.log("[RC Import] Authorized via API key");
        }
      }

      // Fall back to admin auth
      if (!authorized) {
        if (!req.isAuthenticated || !req.isAuthenticated()) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        const userId = req.user?.claims?.sub;
        if (!userId) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        const user = await storage.getUser(userId);
        if (!user || user.role !== "admin") {
          return res.status(403).json({ error: "Forbidden - Admin access required" });
        }
        authorized = true;
        console.log("[RC Import] Authorized via admin auth");
      }

      if (!authorized) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const dryRun = req.query.dryRun === "true";
      const limitParam = req.query.limit;
      const limit = limitParam ? parseInt(limitParam as string, 10) : undefined;

      console.log(`[RC Import] Starting import via API (dryRun: ${dryRun}, limit: ${limit || "none"})`);

      const stats = await importRoughCountryFeed({
        dryRun,
        limit,
        onProgress: (current, total) => {
          if (current % 500 === 0) {
            console.log(`[RC Import] Progress: ${current}/${total}`);
          }
        },
      });

      res.json({
        success: true,
        dryRun,
        stats: {
          total: stats.total,
          added: stats.added,
          updated: stats.updated,
          skipped: stats.skipped,
          errors: stats.errors,
          errorMessages: stats.errorMessages.slice(0, 10),
        },
      });
    } catch (error) {
      console.error("[RC Import] API error:", error);
      res.status(500).json({
        error: "Failed to import Rough Country feed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

function parseProductsFromHTML(content: string, filename?: string): InsertProduct[] {
  const products: InsertProduct[] = [];
  
  let vehicleMake: string | undefined;
  
  // Match both "Parts Catalog for XXX" and "Pricing Report for XXX"
  const titleMatch = content.match(/(?:Parts Catalog|Pricing Report) for (.+?)(?:\s+All)?$/im);
  if (titleMatch) {
    vehicleMake = titleMatch[1].trim();
  } else if (filename) {
    // Try to extract make from filename (e.g., "Ford.xls", "Ram R&R.xls")
    const filenameMatch = filename.match(/^([A-Za-z\s-]+?)(?:\.xls|\.xlsx|\sR&R|\s)/i);
    if (filenameMatch) {
      vehicleMake = filenameMatch[1].trim();
    }
  }

  const tableMatch = content.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    console.log("No table found in XLS file");
    return products;
  }

  const rows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  if (!rows || rows.length < 2) {
    console.log("No data rows found in table");
    return products;
  }

  const extractText = (cell: string): string => {
    return cell
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, '')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  };

  const parseBoolean = (value: string): boolean => {
    const normalized = value.toLowerCase();
    return normalized === 'yes' || normalized === 'true' || normalized === '1' || normalized === 'x';
  };

  const parseDecimal = (value: string): string | null => {
    if (!value || value.trim() === '') return null;
    const cleaned = value.replace(/[$,]/g, '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed.toFixed(2);
  };

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!cells || cells.length < 6) continue;

    const partName = extractText(cells[0]);
    const manufacturer = extractText(cells[1]);
    const category = extractText(cells[2]);
    const supplier = extractText(cells[3]);
    const creator = extractText(cells[4]);
    const partNumber = extractText(cells[5]);
    
    // Extract new pricing fields (columns 7-22 in the new format)
    const laborHours = cells.length > 6 ? parseDecimal(extractText(cells[6])) : null;
    const partCost = cells.length > 7 ? parseDecimal(extractText(cells[7])) : null;
    const salesMarkup = cells.length > 8 ? parseDecimal(extractText(cells[8])) : null;
    const salesOperator = cells.length > 9 ? extractText(cells[9]) || null : null;
    const salesType = cells.length > 10 ? extractText(cells[10]) || null : null;
    const costToSales = cells.length > 11 ? parseDecimal(extractText(cells[11])) : null;
    const salesInstallation = cells.length > 12 ? parseDecimal(extractText(cells[12])) : null;
    const totalCostToSales = cells.length > 13 ? parseDecimal(extractText(cells[13])) : null;
    const partMSRP = cells.length > 14 ? parseDecimal(extractText(cells[14])) : null;
    const retailMarkup = cells.length > 15 ? parseDecimal(extractText(cells[15])) : null;
    const retailOperator = cells.length > 16 ? extractText(cells[16]) || null : null;
    const retailType = cells.length > 17 ? extractText(cells[17]) || null : null;
    const partRetail = cells.length > 18 ? parseDecimal(extractText(cells[18])) : null;
    const retailInstallation = cells.length > 19 ? parseDecimal(extractText(cells[19])) : null;
    const totalRetail = cells.length > 20 ? parseDecimal(extractText(cells[20])) : null;

    if (!partName || !manufacturer || !category || !partNumber) {
      continue;
    }

    // Generate placeholder image URL automatically
    const manufacturerText = manufacturer.substring(0, 20);
    const partText = partName.substring(0, 25);
    const displayText = `${manufacturerText}+%0A${partText}`;
    const placeholderImageUrl = `https://placehold.co/600x400/1E90FF/FFFFFF?text=${displayText}&font=raleway`;

    products.push({
      partNumber,
      partName,
      manufacturer,
      category,
      vehicleMake,
      supplier: supplier || undefined,
      creator: creator || undefined,
      dataSource: 'csv',
      isHidden: false,
      isPopular: false,
      description: undefined,
      
      // Legacy pricing fields (kept for backward compatibility)
      price: partMSRP || undefined,
      cost: partCost || undefined,
      
      // New comprehensive pricing fields
      laborHours: laborHours || undefined,
      partCost: partCost || undefined,
      salesMarkup: salesMarkup || undefined,
      salesOperator: salesOperator || undefined,
      salesType: salesType || undefined,
      costToSales: costToSales || undefined,
      salesInstallation: salesInstallation || undefined,
      totalCostToSales: totalCostToSales || undefined,
      partMSRP: partMSRP || undefined,
      retailMarkup: retailMarkup || undefined,
      retailOperator: retailOperator || undefined,
      retailType: retailType || undefined,
      partRetail: partRetail || undefined,
      retailInstallation: retailInstallation || undefined,
      totalRetail: totalRetail || undefined,
      
      imageUrl: placeholderImageUrl,
      stockQuantity: 0,
    });
  }

  console.log(`Parsed ${products.length} products from XLS file for ${vehicleMake}`);
  return products;
}
