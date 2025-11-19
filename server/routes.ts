// Reference: blueprint:javascript_log_in_with_replit
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { InsertProduct } from "@shared/schema";
import { setupAuth, isAuthenticated, requireAdmin } from "./replitAuth";

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

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Public product routes
  app.get("/api/products", async (req, res) => {
    try {
      const { category, manufacturer, vehicleMake, search } = req.query;
      const products = await storage.getProducts({
        category: category as string | undefined,
        manufacturer: manufacturer as string | undefined,
        vehicleMake: vehicleMake as string | undefined,
        search: search as string | undefined,
      });
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ error: "Failed to fetch products" });
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

  // Protected admin routes - require authentication and admin role
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

  // User management routes (admin only)
  app.get("/api/users", isAuthenticated, requireAdmin, async (_req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.patch("/api/users/:id/role", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!role || !['admin', 'manager', 'staff'].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      await storage.updateUserRole(id, role);
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
  
  const titleMatch = content.match(/Parts Catalog for (.+?)(?:\s+All)?$/im);
  if (titleMatch) {
    vehicleMake = titleMatch[1].trim();
  } else if (filename) {
    const filenameMatch = filename.match(/^([A-Za-z\s-]+)(?:\sR&R|\s)/i);
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

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!cells || cells.length < 6) continue;

    const partName = extractText(cells[0]);
    const manufacturer = extractText(cells[1]);
    const category = extractText(cells[2]);
    const supplier = extractText(cells[3]);
    const creator = extractText(cells[4]);
    const partNumber = extractText(cells[5]);
    
    const hideValue = cells.length > 6 ? extractText(cells[6]) : '';
    const popularValue = cells.length > 7 ? extractText(cells[7]) : '';
    
    const isHidden = hideValue.length > 0 && parseBoolean(hideValue);
    const isPopular = popularValue.length > 0 && parseBoolean(popularValue);

    if (!partName || !manufacturer || !category || !partNumber) {
      continue;
    }

    products.push({
      partNumber,
      partName,
      manufacturer,
      category,
      vehicleMake,
      supplier: supplier || undefined,
      creator: creator || undefined,
      dataSource: 'csv',
      isHidden,
      isPopular,
      description: undefined,
      price: undefined,
      cost: undefined,
      imageUrl: undefined,
      stockQuantity: 0,
    });
  }

  console.log(`Parsed ${products.length} products from XLS file for ${vehicleMake}`);
  return products;
}
