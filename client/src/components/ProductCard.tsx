import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart } from "lucide-react";
import { Link } from "wouter";
import type { Product } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { isAuthenticated } = useAuth();
  
  // Role-based pricing display
  // Customers (not logged in): See Part Retail and Total Retail
  // Logged-in users: See all pricing details
  const partRetail = product.partRetail ? parseFloat(product.partRetail) : null;
  const totalRetail = product.totalRetail ? parseFloat(product.totalRetail) : null;
  const partMSRP = product.partMSRP ? parseFloat(product.partMSRP) : null;
  
  // Fallback to legacy price field if new fields aren't populated
  const displayPrice = partRetail || (product.price ? parseFloat(product.price) : null);
  const displayTotal = totalRetail;

  return (
    <Card className="hover-elevate active-elevate-2 overflow-hidden group h-full flex flex-col" data-testid={`card-product-${product.id}`}>
      <Link href={`/products/${product.id}`}>
        <div className="aspect-square bg-muted relative overflow-hidden">
          {product.imageUrl ? (
            <img 
              src={product.imageUrl} 
              alt={product.partName}
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
              data-testid={`img-product-${product.id}`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-accent/30">
              <div className="text-6xl font-bold text-muted-foreground/20">
                {product.partName.charAt(0)}
              </div>
            </div>
          )}
          {product.isPopular && (
            <Badge className="absolute top-2 right-2 bg-secondary text-secondary-foreground" data-testid="badge-popular">
              Popular
            </Badge>
          )}
        </div>
      </Link>

      <CardHeader className="flex-none pb-3">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/products/${product.id}`} className="flex-1 min-w-0">
            <h3 className="font-semibold leading-tight line-clamp-2 hover:text-primary transition-colors" data-testid={`text-product-name-${product.id}`}>
              {product.partName}
            </h3>
          </Link>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <Badge variant="outline" className="text-xs" data-testid={`badge-manufacturer-${product.id}`}>
            {product.manufacturer}
          </Badge>
          {product.partNumber && (
            <span className="text-xs text-muted-foreground" data-testid={`text-part-number-${product.id}`}>
              #{product.partNumber}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 pb-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs" data-testid={`badge-category-${product.id}`}>
            {product.category}
          </Badge>
          {product.vehicleMake && (
            <Badge variant="outline" className="text-xs" data-testid={`badge-vehicle-${product.id}`}>
              {product.vehicleMake}
            </Badge>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex-none pt-0 flex items-center justify-between gap-3">
        {displayPrice !== null && (
          <div>
            <div className="text-xs text-muted-foreground">
              Part Retail
            </div>
            <div className="font-bold text-lg text-primary" data-testid={`text-price-${product.id}`}>
              ${displayPrice.toFixed(2)}
            </div>
            {displayTotal !== null && displayTotal !== displayPrice && (
              <div className="text-xs text-muted-foreground mt-1">
                Total: <span className="font-semibold text-foreground" data-testid={`text-total-retail-${product.id}`}>${displayTotal.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}
        <Button size="sm" className="gap-2 ml-auto" data-testid={`button-add-to-cart-${product.id}`}>
          <ShoppingCart className="h-4 w-4" />
          Add
        </Button>
      </CardFooter>
    </Card>
  );
}
