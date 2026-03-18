import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { ShoppingCart, ArrowLeft, AlertCircle, Package, Tag, Factory, Plus, Minus, Edit } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { Product } from "@shared/schema";

export default function ProductDetail() {
  const [, params] = useRoute("/products/:id");
  const productId = params?.id;
  const [quantity, setQuantity] = useState(1);
  const { addToCart } = useCart();
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const { data: product, isLoading, error } = useQuery<Product>({
    queryKey: ['/api/products', productId],
    enabled: !!productId,
  });

  const handleAddToCart = () => {
    if (!product) return;
    
    addToCart(product, quantity);
    toast({
      title: "Added to cart",
      description: `${quantity} × ${product.partName} added to your shopping list`,
    });
    setQuantity(1);
  };

  const incrementQuantity = () => setQuantity(q => q + 1);
  const decrementQuantity = () => setQuantity(q => Math.max(1, q - 1));
  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
      setQuantity(value);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <Link href="/products">
              <Button variant="ghost" className="gap-2" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
                Back to Products
              </Button>
            </Link>
            {isAdmin && productId && (
              <Link href={`/products/${productId}/edit`}>
                <Button variant="outline" className="gap-2" data-testid="button-edit-product">
                  <Edit className="h-4 w-4" />
                  Edit Product
                </Button>
              </Link>
            )}
          </div>

          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to load product details. Please try again later.
              </AlertDescription>
            </Alert>
          )}

          {isLoading ? (
            <div className="grid md:grid-cols-2 gap-8">
              <Skeleton className="aspect-square w-full" />
              <div className="space-y-4">
                <Skeleton className="h-10 w-3/4" />
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-12 w-32" />
              </div>
            </div>
          ) : product ? (
            <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
              <div className="aspect-square bg-muted rounded-lg overflow-hidden">
                {product.imageUrl ? (
                  <img 
                    src={product.imageUrl} 
                    alt={product.partName}
                    className="w-full h-full object-cover"
                    data-testid="img-product"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-muted/50 to-primary/10 border border-dashed border-muted-foreground/20 rounded-lg">
                    <div className="text-8xl font-bold text-primary/30 mb-4">
                      {product.partName.charAt(0)}
                    </div>
                    <div className="text-base text-muted-foreground text-center px-8">
                      Product Image Coming Soon
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-6">
                <div>
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h1 className="text-3xl md:text-4xl font-bold" data-testid="text-product-name">
                      {product.partName}
                    </h1>
                    {product.isPopular && (
                      <Badge variant="secondary" data-testid="badge-popular">Popular</Badge>
                    )}
                  </div>
                  
                  {(() => {
                    const rawPrice = parseFloat(product.totalRetail || product.partRetail || product.price || '0');
                    return rawPrice > 1 ? (
                      <div className="mt-3" data-testid="text-price">
                        <span className="text-3xl font-bold text-primary">${rawPrice.toFixed(2)}</span>
                      </div>
                    ) : null;
                  })()}

                  <div className="flex items-center gap-3 flex-wrap mt-4">
                    <Badge variant="outline" className="gap-1" data-testid="badge-manufacturer">
                      <Factory className="h-3 w-3" />
                      {product.manufacturer}
                    </Badge>
                    <Badge variant="outline" className="gap-1" data-testid="badge-category">
                      <Tag className="h-3 w-3" />
                      {product.category}
                    </Badge>
                    {product.vehicleMake && (
                      <Badge variant="outline" data-testid="badge-vehicle">
                        {product.vehicleMake}
                      </Badge>
                    )}
                  </div>
                </div>

                {product.description && (
                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm leading-relaxed" data-testid="text-description">
                      {product.description}
                    </p>
                  </div>
                )}

                <Card>
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <Package className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">Part Number</div>
                        <div className="text-sm text-muted-foreground" data-testid="text-part-number">
                          {product.partNumber}
                        </div>
                      </div>
                    </div>

                    {product.supplier && (
                      <div className="flex items-center gap-3">
                        <Factory className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium">Supplier</div>
                          <div className="text-sm text-muted-foreground">{product.supplier}</div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={decrementQuantity}
                      disabled={quantity <= 1}
                      data-testid="button-decrease-quantity"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={handleQuantityChange}
                      className="w-20 text-center"
                      data-testid="input-quantity"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={incrementQuantity}
                      data-testid="button-increase-quantity"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <Button 
                    size="lg" 
                    className="gap-2 w-full sm:w-auto flex-1 sm:flex-initial" 
                    onClick={handleAddToCart}
                    data-testid="button-add-to-cart"
                  >
                    <ShoppingCart className="h-5 w-5" />
                    Add to Cart
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-16">
              <p className="text-muted-foreground">Product not found.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
