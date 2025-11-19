# Thunder Customs Automotive Parts Catalog

## Project Status

**✅ PRODUCTION-READY** (November 19, 2025)

The Thunder Customs e-commerce platform is fully functional and verified with real data. Successfully imported 342 Acura products from HTML-wrapped XLS files with complete end-to-end validation.

**Current Capabilities:**
- ✅ Complete frontend with Thunder Customs branding (Blue #1E90FF, Yellow #FFD700, Red #DC143C)
- ✅ Product browsing with filters (category, manufacturer, vehicle make)
- ✅ Admin CSV/XLS import interface
- ✅ Database schema supporting CSV imports and future MOPAR API integration
- ✅ Robust HTML-wrapped XLS parser with vehicle make extraction
- ✅ Database upsert logic updates all mutable fields for data freshness

**Next Steps:**
1. Import remaining 11+ OEM vehicle make files to populate full catalog
2. Add regression tests for import pipeline
3. Final UX polish and content population before launch
4. MOPAR API integration when credentials become available

**Quick Start:**
- Visit `/admin` to import XLS files
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

### Backend Architecture

**Server Framework**
- Express.js with TypeScript for API routes and middleware
- Custom logging middleware for request/response tracking
- Session management prepared (connect-pg-simple imported but not yet implemented)
- File upload support via Multer (configured for memory storage)

**API Design**
- RESTful API endpoints under `/api` prefix
- Product filtering by category, manufacturer, vehicle make, and search query
- CRUD operations for products (read operations implemented, create prepared)
- Separate routes for categories, manufacturers, and vehicle makes

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

## External Dependencies

### Database & Infrastructure
- **Neon Serverless PostgreSQL**: Serverless PostgreSQL database with WebSocket connection pooling
- **Environment Variables**: `DATABASE_URL` required for database connection

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