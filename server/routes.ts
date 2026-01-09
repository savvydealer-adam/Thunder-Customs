// Reference: blueprint:javascript_log_in_with_replit
import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import multer from "multer";
import { InsertProduct } from "@shared/schema";
import { setupAuth, isAuthenticated, requireAdmin, requireStrictAdmin } from "./replitAuth";
import { parsePDFCatalog } from "./pdfParser";
import { generateAdfXml } from "./adfGenerator";

const upload = multer({ storage: multer.memoryStorage() });

async function searchProductImage(partName: string, manufacturer: string): Promise<string | null> {
  const manufacturerText = manufacturer.substring(0, 20);
  const partText = partName.substring(0, 25);
  const displayText = `${manufacturerText}+%0A${partText}`;
  
  return `https://placehold.co/600x400/1E90FF/FFFFFF?text=${displayText}&font=raleway`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication middleware
  await setupAuth(app);

  // Auth routes - returns envelope with user (null for unauthenticated)
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      // If not authenticated, return null user in envelope
      if (!req.isAuthenticated() || !req.user?.claims?.sub) {
        return res.json({ user: null });
      }
      
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json({ user });
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
      const id = parseInt(req.params.id);
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
  app.post("/api/leads", async (req: any, res) => {
    try {
      const leadSchema = z.object({
        firstName: z.string().min(1, "First name is required"),
        lastName: z.string().min(1, "Last name is required"),
        email: z.string().email("Valid email is required"),
        phone: z.string().optional(),
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
      
      const adfXml = generateAdfXml(data);
      
      const userId = req.isAuthenticated?.() ? req.user?.claims?.sub : null;
      
      const lead = await storage.createLead({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone || null,
        comments: data.comments || null,
        cartItems: data.cartItems,
        cartTotal: data.cartTotal || null,
        adfXml,
        status: 'new',
        submittedBy: userId,
      });

      res.json({
        success: true,
        leadId: lead.id,
        message: "Your request has been submitted. We'll contact you soon!",
      });
    } catch (error) {
      console.error("Error creating lead:", error);
      res.status(500).json({ error: "Failed to submit lead request" });
    }
  });

  // Get leads - authenticated staff can view leads
  app.get("/api/leads", isAuthenticated, async (req: any, res) => {
    try {
      const leads = await storage.getLeads();
      res.json(leads);
    } catch (error) {
      console.error("Error fetching leads:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  // Get single lead with ADF download
  app.get("/api/leads/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
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
  app.get("/api/leads/:id/adf", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
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

  // Update lead status - admin only
  app.patch("/api/leads/:id/status", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      
      const validStatuses = ['new', 'contacted', 'quoted', 'sold', 'lost'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      
      const lead = await storage.updateLeadStatus(id, status);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      res.json(lead);
    } catch (error) {
      console.error("Error updating lead status:", error);
      res.status(500).json({ error: "Failed to update lead status" });
    }
  });

  // Protected admin routes - require authentication and admin role
  
  // Database export - download products as JSON
  app.get("/api/admin/database/export", isAuthenticated, requireStrictAdmin, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { products, leads } = await import("@shared/schema");
      
      const [allProducts, allLeads] = await Promise.all([
        db.select().from(products),
        db.select().from(leads),
      ]);
      
      const exportData = {
        exportDate: new Date().toISOString(),
        products: allProducts,
        leads: allLeads,
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="thunder-customs-backup-${Date.now()}.json"`);
      res.send(JSON.stringify(exportData, null, 2));
    } catch (error) {
      console.error("Error exporting database:", error);
      res.status(500).json({ error: "Failed to export database" });
    }
  });

  // Database import - restore products from JSON
  app.post("/api/admin/database/import", isAuthenticated, requireStrictAdmin, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const { db } = await import("./db");
      const { products, leads } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");
      
      const fileContent = req.file.buffer.toString('utf-8');
      const importData = JSON.parse(fileContent);
      
      if (!importData.products || !Array.isArray(importData.products)) {
        return res.status(400).json({ error: "Invalid backup file format" });
      }
      
      // Clear existing products and insert from backup
      await db.execute(sql`TRUNCATE TABLE products RESTART IDENTITY CASCADE`);
      
      let importedProducts = 0;
      const batchSize = 100;
      
      for (let i = 0; i < importData.products.length; i += batchSize) {
        const batch = importData.products.slice(i, i + batchSize);
        // Remove id field so new ids are generated
        const productsToInsert = batch.map((p: any) => {
          const { id, ...productData } = p;
          return productData;
        });
        
        if (productsToInsert.length > 0) {
          await db.insert(products).values(productsToInsert);
          importedProducts += productsToInsert.length;
        }
      }
      
      // Import leads if present
      let importedLeads = 0;
      if (importData.leads && Array.isArray(importData.leads)) {
        await db.execute(sql`TRUNCATE TABLE leads RESTART IDENTITY CASCADE`);
        
        for (let i = 0; i < importData.leads.length; i += batchSize) {
          const batch = importData.leads.slice(i, i + batchSize);
          const leadsToInsert = batch.map((l: any) => {
            const { id, ...leadData } = l;
            return leadData;
          });
          
          if (leadsToInsert.length > 0) {
            await db.insert(leads).values(leadsToInsert);
            importedLeads += leadsToInsert.length;
          }
        }
      }
      
      res.json({
        success: true,
        message: `Imported ${importedProducts} products and ${importedLeads} leads`,
        importedProducts,
        importedLeads,
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

  // Upload product image
  app.post("/api/admin/products/:id/image", isAuthenticated, requireAdmin, upload.single('image'), async (req: any, res) => {
    try {
      const { id } = req.params;
      
      if (!req.file) {
        return res.status(400).json({ error: "No image file uploaded" });
      }

      // Convert the uploaded image to base64 data URL for storage
      const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      
      const success = await storage.updateProductImage(parseInt(id), base64Image);
      
      if (!success) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      const updatedProduct = await storage.getProduct(parseInt(id));
      res.json({ success: true, product: updatedProduct });
    } catch (error) {
      console.error("Error uploading product image:", error);
      res.status(500).json({ error: "Failed to upload image" });
    }
  });

  app.post("/api/admin/import-csv", isAuthenticated, requireAdmin, upload.single('file'), async (req, res) => {
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

  app.post("/api/admin/import-batch", isAuthenticated, requireAdmin, upload.array('files', 50), async (req, res) => {
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
  app.post("/api/admin/import-pdf-catalog", isAuthenticated, requireAdmin, upload.single('file'), async (req, res) => {
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
          const imageUrl = await searchProductImage(product.partName, product.manufacturer);
          if (imageUrl) {
            await storage.updateProductImage(product.id, imageUrl);
            updated++;
          }
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

  app.post("/api/admin/populate-images", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      if (!process.env.UNSPLASH_ACCESS_KEY) {
        return res.status(400).json({ 
          error: "UNSPLASH_ACCESS_KEY not configured. Please add the API key to enable image sourcing." 
        });
      }

      const productsWithoutImages = await storage.getProductsWithoutImages();
      
      let updated = 0;
      let errors = 0;
      
      for (const product of productsWithoutImages) {
        try {
          const imageUrl = await searchProductImage(product.partName, product.manufacturer);
          if (imageUrl) {
            await storage.updateProductImage(product.id, imageUrl);
            updated++;
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error processing image for product ${product.id}:`, error);
          errors++;
        }
      }
      
      res.json({
        success: true,
        updated,
        total: productsWithoutImages.length,
        errors,
      });
    } catch (error) {
      console.error("Error populating images:", error);
      res.status(500).json({ error: "Failed to populate images" });
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

      if (!role || !['admin', 'manager', 'staff'].includes(role)) {
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
