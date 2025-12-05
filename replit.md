# Thunder Customs Automotive Parts Catalog

## Overview

Thunder Customs is an e-commerce platform for automotive accessories and parts. It features a comprehensive catalog with filtering capabilities and an admin interface for product management, offering a product browsing experience inspired by major e-commerce platforms like Shopify, Amazon, and RockAuto, with a focus on vehicle-specific parts discovery. The platform is production-ready with a complete product catalog, employee authentication, and comprehensive pricing management, having successfully imported 8,326 products across 22 vehicle makes.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The frontend uses React with TypeScript, Vite for fast development, Wouter for routing, and TanStack Query for server state management. UI is built with Shadcn/ui components on Radix UI primitives, styled with Tailwind CSS, and follows a responsive, mobile-first design. Custom HSL-based color systems, Google Fonts, and Thunder Customs branding (Blue #1E90FF, Yellow #FFD700, Red #DC143C) are central to the design. Vehicle images and gradient backgrounds enhance the automotive aesthetic.

### Backend Architecture

The backend is built with Express.js and TypeScript, handling API routes, logging, and file uploads via Multer. Authentication and authorization are managed through Replit Auth (OpenID Connect) with PostgreSQL-backed sessions and role-based access control (Admin, Manager, Staff). Protected routes enforce access based on roles, ensuring secure product and employee management. The API is RESTful, supporting product filtering, CRUD operations, batch imports, and automated image sourcing. Data access is abstracted using an `IStorage` interface, with `DatabaseStorage` implementing operations via Drizzle ORM.

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

### Fonts & Assets
- **Google Fonts**: DM Sans, Fira Code, Geist Mono, Architects Daughter.
- **Attached Assets**: Thunder Customs logo.

### Session & Data Utilities
- **connect-pg-simple**: PostgreSQL session store.
- **date-fns**: Date formatting and manipulation.

## Product Image System (Updated December 2025)

- **10,505 real product images** downloaded from manufacturer sources (CARiD CDN, Summit Racing, AutoAnything, RealTruck)
- **99.4% coverage** of entire catalog with verified product-specific images
- **tc- naming convention**: All images use Thunder Customs prefix (e.g., `tc-456401.jpg`)
- **Image tracking**: `imageSource` field tracks where each image came from; `imageAttemptedAt` prevents re-trying failed downloads
- **Placeholder system**: Products without images show "Image Coming Soon" placeholder instead of incorrect stock photos

### Image Download Script
- Location: `scripts/download-product-images.ts`
- Flags: `--manufacturer=X`, `--limit=N`, `--dry-run`, `--retry`
- Sources: CARiD CDN (WeatherTech), Summit Racing, AutoAnything, RealTruck

### Coverage by Manufacturer (100% Complete)
- WeatherTech: 6,577 images (100%)
- Jeep: 932 images (100%)
- RAM: 641 images (100%)
- Affiliated Accessories: 453 images (100%)
- N-Fab: 371 images (100%)
- Dodge: 261 images (100%)
- Mopar: 186 images (100%)
- Dealership Packages: 58 images (100%)
- Chrysler: 56 images (100%)
- Universal: 800/846 images (95%)
- Window Film: 140/147 images (95%)