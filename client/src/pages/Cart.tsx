import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ShoppingCart, ArrowLeft, Trash2, Plus, Minus, Download, Printer } from "lucide-react";
import { useCart } from "@/contexts/CartContext";

export default function Cart() {
  const { items, updateQuantity, removeFromCart, clearCart, getTotalItems } = useCart();

  const subtotal = items.reduce((sum, item) => {
    const price = item.product.price ? parseFloat(item.product.price) : 0;
    return sum + price * item.quantity;
  }, 0);

  const handleQuantityChange = (productId: number, newQuantity: number) => {
    if (newQuantity > 0) {
      updateQuantity(productId, newQuantity);
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1">
          <div className="container mx-auto px-4 py-16">
            <div className="max-w-2xl mx-auto text-center">
              <div className="mb-6 flex justify-center">
                <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center">
                  <ShoppingCart className="h-12 w-12 text-muted-foreground" />
                </div>
              </div>
              <h1 className="text-3xl font-bold mb-4" data-testid="text-empty-cart">Your Shopping List is Empty</h1>
              <p className="text-muted-foreground mb-8">
                Start adding parts to build your custom shopping list
              </p>
              <Link href="/products">
                <Button size="lg" data-testid="button-browse-products">
                  Browse Products
                </Button>
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2" data-testid="text-cart-title">Shopping List</h1>
              <p className="text-muted-foreground">
                {getTotalItems()} {getTotalItems() === 1 ? 'item' : 'items'} in your list
              </p>
            </div>
            <Link href="/products">
              <Button variant="ghost" className="gap-2" data-testid="button-continue-shopping">
                <ArrowLeft className="h-4 w-4" />
                Continue Shopping
              </Button>
            </Link>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              {items.map((item) => {
                const price = item.product.price ? parseFloat(item.product.price) : 0;
                const itemTotal = price * item.quantity;

                return (
                  <Card key={item.product.id} data-testid={`cart-item-${item.product.id}`}>
                    <CardContent className="p-6">
                      <div className="flex gap-4">
                        <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                          {item.product.imageUrl ? (
                            <img
                              src={item.product.imageUrl}
                              alt={item.product.partName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-muted-foreground">
                              {item.product.partName.charAt(0)}
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between gap-4 mb-2">
                            <div className="flex-1">
                              <Link href={`/products/${item.product.id}`}>
                                <h3 
                                  className="font-semibold hover:text-primary transition-colors line-clamp-2"
                                  data-testid={`text-product-name-${item.product.id}`}
                                >
                                  {item.product.partName}
                                </h3>
                              </Link>
                              <div className="flex gap-2 mt-1 flex-wrap">
                                <Badge variant="outline" className="text-xs">
                                  {item.product.manufacturer}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {item.product.category}
                                </Badge>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeFromCart(item.product.id)}
                              data-testid={`button-remove-${item.product.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="flex items-center justify-between mt-4">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleQuantityChange(item.product.id, item.quantity - 1)}
                                data-testid={`button-decrease-${item.product.id}`}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <Input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val)) handleQuantityChange(item.product.id, val);
                                }}
                                className="w-16 h-8 text-center"
                                data-testid={`input-quantity-${item.product.id}`}
                              />
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleQuantityChange(item.product.id, item.quantity + 1)}
                                data-testid={`button-increase-${item.product.id}`}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                            {price > 0 && (
                              <div className="text-right">
                                <div className="font-semibold" data-testid={`text-item-total-${item.product.id}`}>
                                  ${itemTotal.toFixed(2)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  ${price.toFixed(2)} each
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="lg:col-span-1">
              <Card className="sticky top-24">
                <CardContent className="p-6 space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold mb-4">Summary</h2>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Items</span>
                        <span data-testid="text-total-items">{getTotalItems()}</span>
                      </div>
                      {subtotal > 0 && (
                        <>
                          <Separator />
                          <div className="flex justify-between text-lg font-semibold">
                            <span>Subtotal</span>
                            <span data-testid="text-subtotal">${subtotal.toFixed(2)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Download or print your shopping list to bring to Thunder Customs dealership
                    </p>
                    
                    <Button className="w-full gap-2" size="lg" data-testid="button-download-pdf">
                      <Download className="h-4 w-4" />
                      Download PDF
                    </Button>

                    <Button variant="outline" className="w-full gap-2" data-testid="button-print">
                      <Printer className="h-4 w-4" />
                      Print List
                    </Button>

                    <Button 
                      variant="ghost" 
                      className="w-full" 
                      onClick={clearCart}
                      data-testid="button-clear-cart"
                    >
                      Clear List
                    </Button>
                  </div>

                  <Separator />

                  <div className="text-xs text-muted-foreground space-y-2">
                    <p>
                      <strong>Next Steps:</strong>
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Download or print your list</li>
                      <li>Visit Thunder Customs dealership</li>
                      <li>Our team will confirm parts and pricing</li>
                      <li>Schedule installation if needed</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
