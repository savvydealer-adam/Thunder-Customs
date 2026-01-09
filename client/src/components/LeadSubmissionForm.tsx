import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Send, CheckCircle, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";

interface LeadFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  comments: string;
}

export function LeadSubmissionForm() {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { items, clearCart } = useCart();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState<LeadFormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    comments: "",
  });

  const subtotal = items.reduce((sum, item) => {
    const price = item.product.price ? parseFloat(item.product.price) : 0;
    return sum + price * item.quantity;
  }, 0);

  const submitMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/leads', {
        ...formData,
        cartItems: items.map(item => ({
          product: {
            id: item.product.id,
            partNumber: item.product.partNumber,
            partName: item.product.partName,
            manufacturer: item.product.manufacturer,
            category: item.product.category,
            price: item.product.price,
          },
          quantity: item.quantity,
        })),
        cartTotal: subtotal.toFixed(2),
      });
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: "Request Submitted",
        description: "We'll contact you soon about your parts request!",
      });
      clearCart();
    },
    onError: (error: Error) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName || !formData.lastName || !formData.email) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    submitMutation.mutate();
  };

  const handleInputChange = (field: keyof LeadFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full gap-2" size="lg" data-testid="button-submit-request">
          <Send className="h-4 w-4" />
          Submit Request to Dealership
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Submit Parts Request</DialogTitle>
          <DialogDescription>
            Fill out your contact information and we'll reach out to help with your order.
          </DialogDescription>
        </DialogHeader>
        
        {submitted ? (
          <div className="py-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Request Submitted!</h3>
            <p className="text-muted-foreground">
              Thank you for your interest. A team member will contact you shortly.
            </p>
            <Button 
              className="mt-4" 
              onClick={() => setOpen(false)}
              data-testid="button-close-success"
            >
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange("firstName", e.target.value)}
                  required
                  data-testid="input-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange("lastName", e.target.value)}
                  required
                  data-testid="input-last-name"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                required
                data-testid="input-email"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
                data-testid="input-phone"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="comments">Comments (optional)</Label>
              <Textarea
                id="comments"
                value={formData.comments}
                onChange={(e) => handleInputChange("comments", e.target.value)}
                placeholder="Any specific requirements or questions?"
                rows={3}
                data-testid="input-comments"
              />
            </div>

            <Alert>
              <AlertDescription>
                Your request includes {items.length} item(s) 
                {subtotal > 0 && ` totaling $${subtotal.toFixed(2)}`}
              </AlertDescription>
            </Alert>

            <div className="flex gap-3 pt-2">
              <Button 
                type="button" 
                variant="outline" 
                className="flex-1"
                onClick={() => setOpen(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="flex-1 gap-2"
                disabled={submitMutation.isPending}
                data-testid="button-submit"
              >
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit Request
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
