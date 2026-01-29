# Thunder Customs Automotive Parts Catalog

## Overview

Thunder Customs is an e-commerce platform for automotive accessories and parts. It features a comprehensive catalog with filtering capabilities and an admin interface for product management, offering a product browsing experience inspired by major e-commerce platforms like Shopify, Amazon, and RockAuto, with a focus on vehicle-specific parts discovery. The platform is production-ready with a complete product catalog, employee authentication, and comprehensive pricing management, having successfully imported 8,326 products across 22 vehicle makes.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The frontend uses React with TypeScript, Vite for fast development, Wouter for routing, and TanStack Query for server state management. UI is built with Shadcn/ui components on Radix UI primitives, styled with Tailwind CSS, and follows a responsive, mobile-first design. Custom HSL-based color systems, Google Fonts, and Thunder Customs branding (Blue #1E90FF, Yellow #FFD700, Red #DC143C) are central to the design. Vehicle images and gradient backgrounds enhance the automotive aesthetic.

### Backend Architecture

The backend is built with Express.js and TypeScript, handling API routes, logging, and file uploads via Multer. Authentication and authorization are managed through Replit Auth (OpenID Connect) with PostgreSQL-backed sessions and role-based access control. Protected routes enforce access based on roles, ensuring secure product and employee management. The API is RESTful, supporting product filtering, CRUD operations, batch imports, and automated image sourcing. Data access is abstracted using an `IStorage` interface, with `DatabaseStorage` implementing operations via Drizzle ORM.

### User Roles & Permissions (January 2026)

The system supports four user roles with the following permissions:

- **Customer** (default for new signups): Can browse products, add to cart, request quotes, and save profile info for checkout
- **Salesman**: Can view leads, create/manage orders, and all customer permissions
- **Staff (Legacy)**: Same as Salesman, retained for backward compatibility with existing users
- **Manager**: Can manage products, admin features, and all salesman permissions
- **Admin**: Full access including user role management

User profiles include name, email, and phone fields that are saved and pre-filled on checkout forms. Admins can elevate users from Customer to Salesman/Manager via the User Management panel (/employees).

### Database Design

The system uses Neon serverless PostgreSQL with Drizzle ORM for type-safe queries. The schema includes `Products` (with unique part numbers, decimal price fields, stock tracking, timestamps) and reference tables for `Categories`, `Manufacturers`, and `Vehicle Makes`. These reference tables have auto-incrementing IDs, unique names/slugs for SEO, and display order fields.

### State Management

Client-side state uses TanStack Query for server data (products, categories, filters) with a query key-based caching strategy. Local React state manages UI-specific elements. The shopping cart system is managed via React Context with localStorage persistence for anonymous users, supporting add, update, remove, and clear operations, and provides client-side PDF export and print-friendly cart pages.

## External Dependencies

### Database & Infrastructure
- **Neon Serverless PostgreSQL**: Database.

### UI & Styling
- **Radix UI**: Headless accessible component primitives.
- **Tailwind CSS**: Utility-first CSS framework.
- **Lucide React**: Icon library.
- **class-variance-authority**: Type-safe component variant management.
- **clsx/tailwind-merge**: Conditional className utilities.

### Development Tools
- **Replit Plugins**: Development banner, error overlay, cartographer.
- **TypeScript**: Type checking.
- **ESBuild**: Server code bundling.

### Form & Data Handling
- **Zod**: Runtime schema validation.
- **Multer**: Multipart/form-data handling for file uploads.
- **ExcelJS**: Excel file parsing and generation (replaced xlsx library).

### Fonts & Assets
- **Google Fonts**: DM Sans, Fira Code, Geist Mono, Architects Daughter.
- **Attached Assets**: Thunder Customs logo.

### Session & Data Utilities
- **connect-pg-simple**: PostgreSQL session store.
- **date-fns**: Date formatting and manipulation.

## Product Catalog (Updated December 2025)

- **8,997 verified products** in catalog (fully audited against 35 official XLS files)
- **Cleanup performed**: Removed 1,571 unverified products total (675 corrupted AA- products + 896 products not in XLS files)
- **1,813 real manufacturer images** (~20% coverage) from CARiD CDN, MoparOnlineParts CDN
- **tc- naming convention**: All images use Thunder Customs prefix (e.g., `tc-456401.jpg`)
- **Image tracking**: `imageSource` field tracks where each image came from; `imageAttemptedAt` prevents re-trying failed downloads
- **Audit script**: `scripts/audit-database.ts` verifies all products exist in official XLS source files

### Image Download Scripts
1. `scripts/download-product-images.ts` - CARiD CDN for WeatherTech and N-Fab
   - Flags: `--manufacturer=X`, `--limit=N`, `--dry-run`, `--retry`
2. `scripts/download-mopar-images.ts` - MoparOnlineParts CDN for Mopar OEM parts
   - Flags: `--manufacturer=X`, `--limit=N`
   - Works for: Dodge, Jeep, RAM, Chrysler (standard Mopar part numbers)
   - Does NOT work for: AA- prefixed parts (Affiliated Accessories)

### Coverage by Manufacturer (December 2025)
- WeatherTech: 1,594/6,583 real (24.2%) - CARiD CDN
- N-Fab: 108/371 real (29.1%) - CARiD CDN
- Dodge: 39/261 real (14.9%) - MoparOnlineParts CDN
- Jeep: 29/932 real (3.1%) - MoparOnlineParts CDN
- RAM: 37/641 real (5.8%) - MoparOnlineParts CDN
- Chrysler: 6/56 real (10.7%) - MoparOnlineParts CDN
- Universal: 0/846 (0%) - No external source available
- Affiliated Accessories: 0/453 (0%) - AA- prefix not on standard retailers
- Mopar: 0/186 (0%) - AA- prefix (actually Affiliated Accessories)
- Window Film: 0/147 (0%) - Service package, no standard images
- Dealership Packages: 0/58 (0%) - Service package, no standard images
- K&N: 0/10 (0%) - Too few products to prioritize

### Placeholder Image
- All 8,692 placeholders are identical 11,279-byte files showing "Image Coming Soon"
- Located at: `attached_assets/product_images/tc-{partnumber}.jpg`

### Improving Image Coverage
To increase real image coverage, options include:
1. Contact WeatherTech for dealer image access (they restrict scraping)
2. Obtain manufacturer image packs from distributor portal
3. Photograph products manually as inventory is received
4. Use category-specific placeholder images for service packages

## Lead Management System (January 2025)

### ADF Lead Submission
- Customers can submit shopping cart as a lead request from the Cart page
- Generates industry-standard ADF (Auto-lead Data Format) XML for dealership CRM integration
- Captures customer contact info, cart items, and comments
- Leads stored in `leads` table with full cart snapshot

### Lead Management (Staff Access)
- All authenticated users (Staff, Manager, Admin) can view leads at `/leads`
- Lead status tracking: new → contacted → quoted → sold/lost
- Download ADF XML for each lead to import into dealership systems
- Admins can update lead status

### Database Backup/Restore (Admin Only)
- Export: Download all products and leads as JSON backup file
- Import: Restore database from backup file (replaces all data)
- Located in Admin panel under "Database Backup" section
- Use for syncing development environments or disaster recovery