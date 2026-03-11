import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileBox, CheckCircle, Loader2, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { TAX_RATE, TAX_RATE_DISPLAY, TAX_JURISDICTION, calculateTax } from "@shared/taxConfig";

interface OrderFormData {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  vehicleInfo: string;
  notes: string;
}

interface OrderItem {
  product: {
    id: number | null;
    partNumber: string;
    partName: string;
    manufacturer: string;
    category: string;
    price: string;
  };
  quantity: number;
}

export function OrderCreationForm() {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { items, clearCart } = useCart();
  const { isAuthenticated, user, isStaff, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState<OrderFormData>({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    vehicleInfo: "",
    notes: "",
  });
  
  // State for editable order items (only for admins/managers)
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({
    partName: "",
    partNumber: "",
    manufacturer: "",
    price: "",
    quantity: 1,
  });

  // Pre-fill form with user profile data if they're a customer placing their own order
  useEffect(() => {
    if (user && !isStaff) {
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
      setFormData(prev => ({
        ...prev,
        customerName: fullName || prev.customerName,
        customerEmail: user.email || prev.customerEmail,
        customerPhone: (user as any).phone || prev.customerPhone,
      }));
    }
  }, [user, isStaff]);

  // Initialize order items from cart when dialog opens
  useEffect(() => {
    if (open && items.length > 0) {
      setOrderItems(items.map(item => ({
        product: {
          id: item.product.id,
          partNumber: item.product.partNumber,
          partName: item.product.partName,
          manufacturer: item.product.manufacturer,
          category: item.product.category,
          price: String(item.product.totalRetail || item.product.partMSRP || item.product.price || ""),
        },
        quantity: item.quantity,
      })));
    }
  }, [open, items]);

  // Helper to parse price strings
  const parsePrice = (priceStr: string | number | null | undefined): number => {
    if (!priceStr) return 0;
    const cleaned = String(priceStr).replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Calculate total from orderItems (editable) instead of cart items
  const calculateTotal = () => {
    return orderItems.reduce((sum, item) => {
      return sum + (parsePrice(item.product.price) * item.quantity);
    }, 0).toFixed(2);
  };

  // Item editing functions (admin/manager only)
  const updateItemQuantity = (index: number, quantity: number) => {
    const updated = [...orderItems];
    updated[index].quantity = Math.max(1, quantity);
    setOrderItems(updated);
  };

  const updateItemPrice = (index: number, price: string) => {
    const updated = [...orderItems];
    updated[index].product = { ...updated[index].product, price };
    setOrderItems(updated);
  };

  const removeItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const addCustomItem = () => {
    if (!newItem.partName.trim()) {
      toast({
        title: "Part Name Required",
        description: "Please enter a part name.",
        variant: "destructive",
      });
      return;
    }

    setOrderItems([...orderItems, {
      product: {
        id: null,
        partNumber: newItem.partNumber.trim() || "CUSTOM",
        partName: newItem.partName.trim(),
        manufacturer: newItem.manufacturer.trim() || "Custom",
        category: "Custom",
        price: newItem.price,
      },
      quantity: newItem.quantity,
    }]);

    setNewItem({ partName: "", partNumber: "", manufacturer: "", price: "", quantity: 1 });
    setShowAddItem(false);
  };

  const subtotal = parseFloat(calculateTotal());
  const taxAmount = calculateTax(subtotal);
  const cartTotal = (subtotal + taxAmount).toFixed(2);

  const submitMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/orders', {
        customerName: formData.customerName.trim(),
        customerEmail: formData.customerEmail.trim() || null,
        customerPhone: formData.customerPhone.trim() || null,
        vehicleInfo: formData.vehicleInfo.trim() || null,
        notes: formData.notes.trim() || null,
        cartItems: orderItems.map(item => ({
          product: {
            id: item.product.id || null,
            partNumber: item.product.partNumber,
            partName: item.product.partName,
            manufacturer: item.product.manufacturer,
            category: item.product.category,
            price: item.product.price ? String(item.product.price) : null,
          },
          quantity: item.quantity,
        })),
        cartTotal,
        taxRate: String(TAX_RATE),
        taxAmount: taxAmount.toFixed(2),
        itemCount: orderItems.reduce((sum, item) => sum + item.quantity, 0),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/stats'] });
      toast({
        title: "Order Created",
        description: "The order has been saved successfully.",
      });
      clearCart();
      window.location.href = "/orders";
    },
    onError: (error: Error) => {
      toast({
        title: "Order Failed",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerName.trim()) {
      toast({
        title: "Customer Name Required",
        description: "Please enter the customer's name.",
        variant: "destructive",
      });
      return;
    }
    if (orderItems.length === 0) {
      toast({
        title: "No Items",
        description: "Add at least one item to the order.",
        variant: "destructive",
      });
      return;
    }
    submitMutation.mutate();
  };

  const handleInputChange = (field: keyof OrderFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleClose = () => {
    setOpen(false);
    if (submitted) {
      setSubmitted(false);
      setFormData({
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        vehicleInfo: "",
        notes: "",
      });
    }
  };

  if (!isAuthenticated || items.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        handleClose();
      } else {
        setOpen(true);
      }
    }}>
      <DialogTrigger asChild>
        <Button className="w-full gap-2" variant="default" data-testid="button-create-order">
          <FileBox className="h-4 w-4" />
          Create Order
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Customer Order</DialogTitle>
          <DialogDescription>
            Save this order for a customer. Enter their details below.
          </DialogDescription>
        </DialogHeader>
        
        {submitted ? (
          <div className="py-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Order Created!</h3>
            <p className="text-muted-foreground">
              The order has been saved and can be viewed in the Orders page.
            </p>
            <Button 
              className="mt-4" 
              onClick={handleClose}
              data-testid="button-close-order-success"
            >
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer Name *</Label>
              <Input
                id="customerName"
                value={formData.customerName}
                onChange={(e) => handleInputChange("customerName", e.target.value)}
                placeholder="Full name"
                required
                data-testid="input-order-customer-name"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customerEmail">Email</Label>
                <Input
                  id="customerEmail"
                  type="email"
                  value={formData.customerEmail}
                  onChange={(e) => handleInputChange("customerEmail", e.target.value)}
                  placeholder="customer@email.com"
                  data-testid="input-order-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerPhone">Phone</Label>
                <Input
                  id="customerPhone"
                  type="tel"
                  value={formData.customerPhone}
                  onChange={(e) => handleInputChange("customerPhone", e.target.value)}
                  placeholder="(555) 123-4567"
                  data-testid="input-order-phone"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vehicleInfo">Vehicle</Label>
              <Input
                id="vehicleInfo"
                value={formData.vehicleInfo}
                onChange={(e) => handleInputChange("vehicleInfo", e.target.value)}
                placeholder="Year, Make, Model (e.g., 2024 Jeep Wrangler)"
                data-testid="input-order-vehicle"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="notes">Order Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleInputChange("notes", e.target.value)}
                placeholder="Any special instructions or notes..."
                rows={3}
                data-testid="input-order-notes"
              />
            </div>

            <div className="border rounded-md p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">Order Items ({orderItems.length})</span>
              </div>
              
              {orderItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items in order.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {orderItems.map((item, idx) => (
                    <div key={idx} className="bg-muted p-3 rounded-md space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm leading-tight">{item.product.partName}</p>
                          <p className="text-xs text-muted-foreground">{item.product.partNumber}</p>
                        </div>
                        {isAdmin && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive shrink-0"
                            onClick={() => removeItem(idx)}
                            data-testid={`button-remove-order-item-${idx}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      {isAdmin ? (
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs text-muted-foreground">Qty:</Label>
                            <Input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => updateItemQuantity(idx, parseInt(e.target.value) || 1)}
                              className="w-16 h-8 text-center"
                              data-testid={`input-order-qty-${idx}`}
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs text-muted-foreground">Price:</Label>
                            <div className="flex items-center">
                              <span className="text-sm mr-1">$</span>
                              <Input
                                type="text"
                                value={item.product.price}
                                onChange={(e) => updateItemPrice(idx, e.target.value)}
                                placeholder="0.00"
                                className="w-24 h-8"
                                data-testid={`input-order-price-${idx}`}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 text-sm">
                          <span>Qty: {item.quantity}</span>
                          {item.product.price && (
                            <span className="text-muted-foreground">${item.product.price}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {isAdmin && (
                showAddItem ? (
                  <div className="space-y-2 border-t pt-2">
                    <p className="text-xs font-medium">Add Custom Product</p>
                    <Input
                      placeholder="Part Name *"
                      value={newItem.partName}
                      onChange={(e) => setNewItem({ ...newItem, partName: e.target.value })}
                      className="h-8 text-sm"
                      data-testid="input-custom-part-name"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Part Number"
                        value={newItem.partNumber}
                        onChange={(e) => setNewItem({ ...newItem, partNumber: e.target.value })}
                        className="h-8 text-sm"
                        data-testid="input-custom-part-number"
                      />
                      <Input
                        placeholder="Manufacturer"
                        value={newItem.manufacturer}
                        onChange={(e) => setNewItem({ ...newItem, manufacturer: e.target.value })}
                        className="h-8 text-sm"
                        data-testid="input-custom-manufacturer"
                      />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex items-center gap-1 flex-1">
                        <span className="text-sm">$</span>
                        <Input
                          placeholder="Price"
                          value={newItem.price}
                          onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                          className="h-8 text-sm"
                          data-testid="input-custom-price"
                        />
                      </div>
                      <Input
                        type="number"
                        min={1}
                        placeholder="Qty"
                        value={newItem.quantity}
                        onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
                        className="w-16 h-8 text-sm"
                        data-testid="input-custom-qty"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={addCustomItem} data-testid="button-add-custom-item">
                        Add
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setShowAddItem(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowAddItem(true)}
                    data-testid="button-show-add-custom"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Custom Product
                  </Button>
                )
              )}
            </div>

            {orderItems.length > 0 && (
              <div className="border rounded-md p-3 space-y-1" data-testid="cart-order-tax-summary">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{TAX_JURISDICTION} Tax ({TAX_RATE_DISPLAY})</span>
                  <span>${taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-1">
                  <span>Total</span>
                  <span>${cartTotal}</span>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button 
                type="button" 
                variant="outline" 
                className="flex-1"
                onClick={handleClose}
                data-testid="button-cancel-order"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="flex-1 gap-2"
                disabled={submitMutation.isPending}
                data-testid="button-save-order"
              >
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <FileBox className="h-4 w-4" />
                    Save Order
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
