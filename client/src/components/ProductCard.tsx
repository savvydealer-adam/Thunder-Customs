import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart } from "lucide-react";
import { Link } from "wouter";
import type { Product } from "@shared/schema";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { addToCart } = useCart();
  const { toast } = useToast();

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart(product, 1);
    toast({
      title: "Added to list",
      description: `${product.partName} has been added to your quote list.`,
    });
  };

  return (
    <Card className="hover-elevate active-elevate-2 overflow-hidden group h-full flex flex-col" data-testid={`card-product-${product.id}`}>
      <Link href={`/products/${product.id}`}>
        <div className="aspect-square bg-muted relative overflow-hidden">
          {product.imageUrl ? (
            <img 
              src={product.imageUrl} 
              alt={product.partName}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
              data-testid={`img-product-${product.id}`}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-muted/50 to-primary/10 border border-dashed border-muted-foreground/20">
              <div className="text-4xl font-bold text-primary/30 mb-2">
                {product.partName.charAt(0)}
              </div>
              <div className="text-xs text-muted-foreground text-center px-4">
                Image Coming Soon
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

      <CardFooter className="flex-none pt-0 flex items-center justify-end">
        <Button 
          size="sm" 
          className="gap-2" 
          onClick={handleAddToCart}
          data-testid={`button-add-to-cart-${product.id}`}
        >
          <ShoppingCart className="h-4 w-4" />
          Add
        </Button>
      </CardFooter>
    </Card>
  );
}
