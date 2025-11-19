# Thunder Customs Automotive Parts Catalog - Design Guidelines

## Design Approach
**Reference-Based E-Commerce**: Drawing inspiration from Shopify, Amazon, and RockAuto (automotive leader) while incorporating Thunder Customs dealership branding. Focus on product discoverability, clear pricing, and efficient browsing for automotive enthusiasts and professionals.

## Typography System

**Primary Font**: Inter or Roboto (via Google Fonts CDN)
- Headers (H1): 2.5rem (40px), font-weight: 700
- Headers (H2): 2rem (32px), font-weight: 600
- Headers (H3): 1.5rem (24px), font-weight: 600
- Body Text: 1rem (16px), font-weight: 400
- Small Text/Labels: 0.875rem (14px), font-weight: 500
- Price Display: 1.25rem (20px), font-weight: 700

**Secondary Font (Optional Accent)**: Bebas Neue for dealership-style headers and hero sections

## Layout System

**Spacing Primitives**: Tailwind units of 2, 4, 6, 8, 12, 16
- Component padding: p-4 to p-8
- Section margins: my-12 to my-16
- Grid gaps: gap-4 to gap-6
- Card spacing: p-6

**Container Widths**:
- Main content: max-w-7xl (1280px)
- Product grids: Full width with px-4 to px-8
- Detail pages: max-w-6xl (1152px)

## Component Library

### Navigation
**Main Header**:
- Thunder Customs logo (left, h-12 to h-16)
- Mega-menu navigation for vehicle categories (Make → Model → Year)
- Search bar (center, prominent, min-w-96)
- Shopping cart icon and user account (right)
- Sticky header on scroll

**Category Navigation**:
- Horizontal scrolling tabs for part categories (Exterior, Interior, Performance, Lighting, etc.)
- Vehicle selector dropdown (persistent, shows current vehicle selection)

### Product Grid
**Layout**: 4-column grid (lg), 3-column (md), 2-column (sm), 1-column (mobile)
- Product cards with: Image (square aspect ratio), Part name, Part number, Price, "Add to Cart" button
- Hover state: Subtle lift (shadow-lg), show quick-view button overlay
- Image lazy loading with placeholder

**Filtering Sidebar**:
- Left sidebar (desktop) or drawer (mobile)
- Collapsible filter groups: Price range, Brand, Category, Vehicle compatibility
- Active filters display with clear-all option

### Product Detail Page
**Hero Section**:
- Large product image gallery (60% width, left side)
- Main image with 4-6 thumbnails below
- Zoom on hover/click
- Product info panel (40% width, right side): Name, part number, price, availability, "Add to Cart" CTA

**Details Tabs**:
- Horizontal tab navigation: Description, Specifications, Compatibility, Installation, Reviews
- Full-width content area below tabs

**Related Products**:
- "Frequently Bought Together" carousel
- "Similar Parts" grid (4-column)

### Shopping Features
**Vehicle Selector Modal**:
- Prominent "Select Your Vehicle" button in header
- Step-by-step selector: Year → Make → Model → Trim
- Saves selection across session
- Shows selected vehicle as badge in navigation

**Search Results**:
- Grid layout matching product listing
- Search term highlighting
- Sort options: Relevance, Price (low-high), Price (high-low), Newest
- Result count display

### Footer
**Multi-column layout** (4 columns desktop, stacked mobile):
- Column 1: Thunder Customs logo, dealership address, phone, hours
- Column 2: Quick Links (Shop by Vehicle, Categories, New Arrivals)
- Column 3: Customer Service (Returns, Shipping Info, Installation Guides)
- Column 4: Newsletter signup form

**Trust Indicators**: Payment methods icons, secure checkout badge, manufacturer warranties mention

## Images

### Hero Image
**Large hero banner** (h-96 on desktop, h-64 mobile) featuring:
- Customized vehicle with Thunder Customs accessories installed
- Image: Full-width, professionally shot truck/Jeep with aftermarket parts
- Overlay: "Thunder Customs - Premium Accessories for Your Ride" headline with blurred-background CTA button "Shop By Vehicle"

### Product Images
- High-quality product photography on white/neutral background
- Minimum 800x800px, square aspect ratio
- Multiple angles where applicable (installed view, detail shots)

### Category Images
- Banner images for each major category (Exterior, Interior, Performance)
- Lifestyle shots showing parts installed on vehicles

### Brand Logos
- Manufacturer/brand logos on product cards and detail pages
- Partner brand showcase section

## Icons
**Heroicons** (via CDN) for:
- Shopping cart, user account, search, filter
- Checkmarks for features, specifications
- Arrows for carousels, navigation
- Vehicle categories (truck, SUV, sedan icons)

## Animations
**Minimal, purposeful animations**:
- Product card hover: transform scale (1.02) with shadow transition
- Add to cart: Brief success animation (checkmark fade-in)
- Image gallery: Smooth fade transitions between images
- Mega-menu: Slide-down entrance
- NO scroll-triggered or parallax effects

## Key Interactions
- Sticky "Add to Cart" bar on product detail (mobile)
- Quick-view modal from product cards
- Instant search suggestions as user types
- Filter updates without page reload
- Cart preview drawer (no page navigation)

## Accessibility
- ARIA labels for all interactive elements
- Keyboard navigation for menus and filters
- Focus states clearly visible
- Alt text for all product images
- High contrast text throughout

This design prioritizes product discovery and conversion while maintaining the professional dealership aesthetic appropriate for Thunder Customs.