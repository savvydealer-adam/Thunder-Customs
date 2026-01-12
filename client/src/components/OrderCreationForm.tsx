import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileBox, CheckCircle, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface OrderFormData {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  vehicleInfo: string;
  notes: string;
}

export function OrderCreationForm() {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { items, clearCart } = useCart();
  const { isAuthenticated, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState<OrderFormData>({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    vehicleInfo: "",
    notes: "",
  });

  const cartTotal = items.reduce((sum, item) => {
    const price = item.product.totalRetail || item.product.partMSRP || item.product.price;
    return sum + (price ? parseFloat(price) * item.quantity : 0);
  }, 0).toFixed(2);

  const submitMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/orders', {
        customerName: formData.customerName.trim(),
        customerEmail: formData.customerEmail.trim() || null,
        customerPhone: formData.customerPhone.trim() || null,
        vehicleInfo: formData.vehicleInfo.trim() || null,
        notes: formData.notes.trim() || null,
        cartItems: items.map(item => ({
          product: {
            id: item.product.id,
            partNumber: item.product.partNumber,
            partName: item.product.partName,
            manufacturer: item.product.manufacturer,
            category: item.product.category,
            price: item.product.totalRetail || item.product.partMSRP || item.product.price || null,
          },
          quantity: item.quantity,
        })),
        cartTotal,
      });
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/stats'] });
      toast({
        title: "Order Created",
        description: "The order has been saved successfully.",
      });
      clearCart();
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

  if (!isAuthenticated || !isAdmin || items.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
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

            <Alert>
              <AlertDescription>
                <div className="flex justify-between">
                  <span>Order includes {items.length} item(s)</span>
                  <span className="font-semibold">${cartTotal}</span>
                </div>
              </AlertDescription>
            </Alert>

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
