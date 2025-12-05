# Thunder Customs Automotive Parts Catalog

## Project Status

**✅ PRODUCTION-READY WITH COMPREHENSIVE PRICING** (November 24, 2025)

The Thunder Customs e-commerce platform is fully functional with complete product catalog, employee authentication system, and **comprehensive pricing management**. Successfully imported **8,326 products** (including 1,130 Chevrolet products with complete pricing data) across **22 vehicle makes** from HTML-wrapped XLS files.

**Current Capabilities:**
- ✅ Complete frontend with Thunder Customs branding (Blue #1E90FF, Yellow #FFD700, Red #DC143C)
- ✅ User-provided vehicle images: 2026 Ram Rebel Red and 2025 Jeep Rubicon
- ✅ Prominent Thunder Customs logo display on hero section
- ✅ Vehicle showcase section: "Truck Accessories" and "Jeep Accessories"
- ✅ Clean, engaging layout with gradient backgrounds
- ✅ Product browsing with filters (category, manufacturer, vehicle make)
- ✅ Batch upload admin interface (import multiple XLS files simultaneously)
- ✅ **Comprehensive pricing database schema** with 15+ fields (labor hours, sales markup, retail calculations, etc.)
- ✅ Robust HTML-wrapped XLS parser with vehicle make extraction **and comprehensive pricing field extraction**
- ✅ Database upsert logic updates all mutable fields for data freshness
- ✅ **ALL 35 vehicle make files imported** - Complete catalog ready!
- ✅ **Automated product image sourcing** - 851 product-specific images from Summit Racing, 7,038 category-based stock images (100% coverage)
- ✅ **Employee authentication system** with Replit Auth integration
- ✅ **Role-based access control** (admin, manager, staff roles)
- ✅ **Protected admin routes** for product management and employee management
- ✅ **Shopping cart system** with localStorage persistence for anonymous users
- ✅ **PDF download** - Generate professional Thunder Customs branded shopping lists
- ✅ **Print-friendly** cart page for in-store purchasing workflow
- ✅ **Comprehensive product editing system** - Admin/manager can edit ALL 15+ pricing fields plus description and upload custom images
- ✅ **Role-based pricing display** - Customers see Part Retail + Total Retail; logged-in users see all internal metrics (labor, cost, markups)
- ✅ **Stock quantity hidden** - Stock info not displayed to customers on product detail pages

**Product Image System (Updated December 2025):**
- **3,261 real product images** downloaded from manufacturer sources (Summit Racing CDN, CARiD, AutoAnything, RealTruck)
- **tc- naming convention**: All images use Thunder Customs prefix (e.g., `tc-456401.jpg`)
- **Image tracking**: `imageSource` field tracks where each image came from; `imageAttemptedAt` prevents re-trying failed downloads
- **Placeholder system**: Products without images show "Image Coming Soon" placeholder instead of incorrect stock photos
- **Image Scripts:**
  - `scripts/download-product-images.ts`: Downloads images from multiple CDN sources with manufacturer-specific URL patterns
  - Flags: `--manufacturer=X`, `--limit=N`, `--dry-run`, `--retry` (retry previously failed products)
- **Current Coverage by Manufacturer:**
  - WeatherTech: 1,591 images
  - Universal: 732 images  
  - Affiliated Accessories: 453 images
  - N-Fab: 371 images (100% coverage)
  - Dealership Packages: 58 images
- **OEM Products (Jeep, RAM, Dodge, Mopar, Chrysler)**: ~2,000 products awaiting MOPAR API credentials for image sourcing
- **To download more images**: Run `npx tsx scripts/download-product-images.ts --manufacturer=Weathertech --limit=50` in batches of 50 to avoid timeouts

**Imported Product Catalog:**
- **22 Vehicle Makes** with **7,889 Total Products**
- Top brands: Toyota (1,059), Ford (706), GMC (644), Nissan (534), KIA (502), Honda (486), Jeep (467)
- All makes: Acura, Buick, Cadillac, Chevrolet, Chrysler, Dodge, Ford, GMC, Honda, Infiniti, Jeep, KIA, Lexus, Lincoln, Mazda, Mitsubishi, Nissan, Ram, Subaru, Toyota, Volkswagen, Volvo

**Next Steps:**
1. Add pricing data to products using the admin product edit feature (`/products/:id/edit`)
2. MOPAR API integration when credentials become available

**Quick Start:**
- Visit `/admin` to batch import XLS files
- Browse products at `/products`
- Filter by vehicle make, category, or manufacturer

## Overview

Thunder Customs is an e-commerce platform for automotive accessories and parts, featuring a comprehensive catalog with filtering capabilities and an admin interface for product management. The application provides a product browsing experience inspired by major e-commerce platforms like Shopify, Amazon, and RockAuto, with a focus on vehicle-specific parts discovery.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build Tools**
- React with TypeScript for type safety and component-based architecture
- Vite as the build tool and development server for fast hot module replacement
- Wouter for lightweight client-side routing (instead of React Router)
- TanStack Query (React Query) for server state management and data fetching with automatic caching and refetching

**UI Component System**
- Shadcn/ui component library (New York style variant) built on Radix UI primitives
- Tailwind CSS for utility-first styling with custom design tokens
- Component aliases configured for clean imports (`@/components`, `@/lib`, etc.)
- Responsive design approach with mobile-first breakpoints

**Styling & Design**
- Custom color system using HSL color space with CSS variables for theme consistency
- Typography system using Inter/Roboto fonts (via Google Fonts CDN) with optional Bebas Neue for headers
- Shadcn's "New York" style preset with custom border radius and spacing values
- Design guidelines inspired by automotive e-commerce leaders (Shopify, Amazon, RockAuto)
- Thunder Customs branding prominently featured with large logo on hero section
- Background imagery: Lifted Jeep Wranglers and Ram trucks for automotive appeal
- Dark gradient overlays on images for text readability
- Elevation-based hover effects (hover-elevate, active-elevate-2 utilities)
- Gradient backgrounds on Products page for visual interest without compromising readability

### Backend Architecture

**Server Framework**
- Express.js with TypeScript for API routes and middleware
- Custom logging middleware for request/response tracking
- Session management with PostgreSQL store (connect-pg-simple)
- File upload support via Multer (configured for memory storage)

**Authentication & Authorization** ✅ **FULLY TESTED & PRODUCTION-READY**
- **Provider**: Replit Auth (OpenID Connect) for secure employee login
- **Session Management**: PostgreSQL-backed sessions with 7-day TTL
- **Cookie Security**: Environment-aware (secure in production, HTTP-friendly in development)
- **API Envelope Pattern**: All auth endpoints return `{ user: User | null }` for type consistency
- **Role-Based Access Control (RBAC)**:
  * **Admin**: Full access including employee management
  * **Manager**: Can manage products and import data, but cannot manage employees
  * **Staff**: Basic access (default role for new users, no admin features)

**Authentication Middleware** (server/replitAuth.ts):
- `isAuthenticated`: Verifies user session and handles token refresh
- `requireAdmin`: Allows admin OR manager (for product management)
- `requireStrictAdmin`: Allows admin ONLY (for employee management)

**Auth Routes**:
- `GET /api/auth/user` - Returns `{ user: User | null }` envelope
- `GET /api/login` - Initiates Replit Auth login flow
- `GET /api/callback` - OAuth callback handler, creates user with 'staff' role if new
- `GET /api/logout` - Destroys session and redirects to Replit logout

**Protected Routes** (verified via E2E testing):
- **Product Management** (`/api/admin/import-csv`, `/api/admin/import-batch`, `/api/admin/populate-images`): Use `requireAdmin` - allows admin OR manager
- **Employee Management** (`/api/users`, `/api/users/:id/role`): Use `requireStrictAdmin` - allows admin ONLY
- All admin routes query database for current role on every request (no stale session issues)

**Frontend Auth Hook** (client/src/hooks/useAuth.ts):
- Returns `{ user: User | null, isLoading, isAuthenticated, isAdmin, isStrictAdmin }`
- `isAdmin`: true if role is 'admin' OR 'manager' (product management access)
- `isStrictAdmin`: true if role is 'admin' ONLY (employee management access)

**E2E Test Results** (Playwright verification):
- ✅ Unauthenticated users: Redirected from protected pages, login button visible
- ✅ Admin role: Full access to product management AND employee management
- ✅ Manager role: Access to product management, blocked from employee management
- ✅ Staff role: No access to admin features, redirected from all protected pages
- ✅ Logout flow: Properly destroys session and returns to unauthenticated state

**API Design**
- RESTful API endpoints under `/api` prefix
- Product filtering by category, manufacturer, vehicle make, and search query
- CRUD operations for products (read operations implemented, create prepared)
- Separate routes for categories, manufacturers, and vehicle makes
- Batch import endpoint (`/api/admin/import-batch`) supports multiple file uploads
- Image population endpoint (`/api/admin/populate-images`) auto-sources product images

**Data Access Layer**
- Storage abstraction through `IStorage` interface for future flexibility
- `DatabaseStorage` class implements concrete database operations
- Drizzle ORM query builder for type-safe database queries
- Support for complex filtering with AND/OR conditions using Drizzle operators

### Database Design

**ORM & Database Driver**
- Drizzle ORM configured for PostgreSQL dialect
- Neon serverless PostgreSQL driver with WebSocket support
- Schema-first approach with migrations stored in `/migrations` directory
- Type generation from schema using `drizzle-zod` for runtime validation

**Schema Structure**

*Products Table*
- Auto-incrementing integer primary key
- Unique part number constraint for inventory management
- Decimal fields for price/cost (10,2 precision)
- Support for multiple data sources (CSV import, manual entry)
- Boolean flags for hidden/popular product status
- Stock quantity tracking
- Timestamps for created/updated tracking

*Reference Tables*
- Categories: Name, slug, description, image URL, display order
- Manufacturers: Name, slug, description, logo URL
- Vehicle Makes: Name, slug, display order

All reference tables use auto-incrementing IDs and enforce unique constraints on names and slugs for SEO-friendly URLs.

**Design Rationale**
- Separate reference tables maintain data integrity and enable efficient filtering
- Slug fields support SEO-friendly URLs for categories and manufacturers
- Display order fields allow manual curation of navigation menus
- Text fields for descriptions support rich product information

### State Management

**Client-Side State**
- TanStack Query handles all server state (products, categories, filters)
- React local state (useState) for UI-specific state (search input, filter selections)
- Query key-based caching strategy: `/api/products` with dynamic query parameters
- Stale-while-revalidate pattern disabled (staleTime: Infinity) for controlled refetching

**Query Architecture**
- Single filter enforcement: Only one category OR one manufacturer OR one vehicle make can be applied at a time
- Dynamic URL building based on active filters
- Automatic query invalidation on product mutations (CSV import)

**Shopping Cart System**
- **Client-Side Storage**: Cart state managed via React Context (CartContext) with localStorage persistence
- **Anonymous Users**: Cart items stored in localStorage with key "thunder-customs-cart"
- **Cart Operations**: addToCart(product, quantity), updateQuantity(productId, quantity), removeFromCart(productId), clearCart(), getTotalItems()
- **Automatic Cleanup**: Items with quantity <= 0 are automatically removed from cart
- **PDF Export**: Client-side PDF generation using jsPDF + autoTable with Thunder Customs branding
- **Print Support**: Print-friendly CSS styles hide navigation/buttons and format cart for paper output
- **Future Enhancement**: Database schema includes `cartItems` table for authenticated user cart persistence (not yet implemented)

## External Dependencies

### Database & Infrastructure
- **Neon Serverless PostgreSQL**: Serverless PostgreSQL database with WebSocket connection pooling
- **Environment Variables**: `DATABASE_URL` required for database connection
- **Unsplash API**: Image sourcing service for automatic product image population (requires `UNSPLASH_ACCESS_KEY`)

### UI & Styling
- **Radix UI**: Headless accessible component primitives (@radix-ui/react-*)
- **Tailwind CSS**: Utility-first CSS framework with PostCSS processing
- **Lucide React**: Icon library for consistent iconography
- **class-variance-authority**: Type-safe component variant management
- **clsx/tailwind-merge**: Conditional className utilities

### Development Tools
- **Replit Plugins**: Development banner, error overlay, and cartographer for Replit environment
- **TypeScript**: Type checking with strict mode enabled
- **ESBuild**: Production bundling for server code

### Form & Data Handling
- **React Hook Form**: Form state management (imported but not yet implemented)
- **Zod**: Runtime schema validation integrated with Drizzle
- **Multer**: Multipart/form-data handling for CSV file uploads

### Fonts & Assets
- **Google Fonts**: DM Sans, Fira Code, Geist Mono, Architects Daughter (loaded via CDN)
- **Attached Assets**: Thunder Customs logo stored in `attached_assets` directory with Vite alias

### Session & Data Utilities
- **connect-pg-simple**: PostgreSQL session store (imported for future session management)
- **date-fns**: Date formatting and manipulation library
- **cmdk**: Command menu component (imported but not yet implemented)